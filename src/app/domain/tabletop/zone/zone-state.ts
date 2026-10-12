import { boundTo } from '@axe/domain/tabletop/move/piece-bonds';
import { distanceBetween, midpointOf, zoneCovers, ZonePoint, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';
import { zoneLimitOf, ZoneRules, zoneSizeFor } from '@axe/domain/tabletop/zone/zone-rules';

/** A zone as it is held, read into plain values. */
export interface ZoneInput {
  readonly id: string;
  readonly centre: ZonePoint | null;
  readonly limit: number | null;
  readonly square: boolean;
  readonly forming: boolean;
}

/** A piece as the zones see it. */
export interface ZonePieceInput {
  readonly id: string;
  /** The middle of its token, in pixels. */
  readonly point: ZonePoint;
  /** The zone it says it is in, or empty. */
  readonly zone: string;
  readonly offField: boolean;
  /** How many bodies it counts as, one at least. */
  readonly count: number;
  /** Its side, or null for a piece on no side. */
  readonly side: string | null;
  /** Whether it is down and cannot act, which keeps it out of any zone wherever it lies. */
  readonly down?: boolean;
  /** Whether it is held fast where it stands, so a zone's centre moving off leaves it behind. */
  readonly held?: boolean;
  /** The piece holding on to it, whose zone it is in only while that piece is; empty for none. */
  readonly grabbedBy?: string;
  /** The piece it rides, whose zone it is in only while that piece is; empty for none. */
  readonly ridingOn?: string;
}

export interface ZoneWorld {
  readonly zones: readonly ZoneInput[];
  readonly pieces: readonly ZonePieceInput[];
  readonly rules: ZoneRules;
  /** How many pixels make a metre on this table. */
  readonly pxPerMetre: number;
  /** Where a worked-out point is put on this table, as a grid puts it in the middle of a cell. */
  readonly snap?: (point: ZonePoint) => ZonePoint;
}

/** A zone as it stands after everything that follows from who is in it. */
export interface ZoneView {
  readonly id: string;
  readonly shape: ZoneShape;
  /** The bodies in it, counted as the pieces count themselves, which is what its size goes by. */
  readonly count: number;
  /**
   * Every body standing in it, those in it and those standing in it without being in it alike,
   * which is what its limit goes by.
   */
  readonly occupants: number;
  /** The most it may hold. */
  readonly limit: number;
  /** Whether more stand in it than its limit, those in it and those only standing in it alike. */
  readonly overflowing: boolean;
  readonly forming: boolean;
  /** The pieces in it, whose point is its centre. */
  readonly members: readonly string[];
  /** The pieces standing in it without being in it, each at its own point. */
  readonly inside: readonly string[];
  /** The bodies in it by side. */
  readonly sides: ReadonlyMap<string, number>;
}

/** What has to be written for the held values to say what the state says. */
export interface ZoneWrites {
  readonly removeZones: readonly string[];
  readonly updateZones: readonly {
    readonly id: string;
    readonly centre: ZonePoint;
    readonly forming: boolean;
    /** The most it holds, null for as many as the size table allows: the lower of two zones joined. */
    readonly limit: number | null;
  }[];
  readonly setPieceZones: readonly { readonly id: string; readonly zone: string }[];
}

export interface ZoneState {
  readonly zones: readonly ZoneView[];
  /** Pairs of zones whose ground meets without either taking in the other's centre. */
  readonly overlaps: readonly (readonly [string, string])[];
  readonly writes: ZoneWrites;
  /** The zone a piece is in, or null. */
  zoneOf(pieceId: string): ZoneView | null;
  /** The zones a piece stands in without being in them. */
  insideOf(pieceId: string): readonly ZoneView[];
  /** Where a piece is for every rule: the centre of its zone, or its own point. */
  pointOf(pieceId: string): ZonePoint | null;
  readonly isEmpty: boolean;
}

interface Working {
  id: string;
  centre: ZonePoint;
  limit: number | null;
  square: boolean;
  forming: boolean;
  members: string[];
  moved: boolean;
  formingChanged: boolean;
  limitChanged: boolean;
}

/** A token further than this outside its zone, in metres, has been carried out of it. */
const CARRIED_OUT_M = 1;

/** How far a centre may shift, in pixels, before the shift is worth writing. */
const MOVED_PX = 1e-3;

/**
 * Works out the zones on a table from what is held: who is in which, how big each is, which have
 * run into one another and which have ended.
 *
 * Computed the same on every peer from the same values, so whichever peer writes the result writes
 * the same thing:
 *
 * 1. A zone with no readable centre is no zone. A piece names a zone it is in only while that zone
 *    stands, while the piece is on the field, on a side and not down, and while its token is no
 *    further outside the zone than a metre; a token carried further than that has left.
 * 2. Zones are joined, lowest identifier first, while one's centre lies in the other: the one with
 *    the lower identifier stays, standing half way between the two, and takes in both sets of pieces
 *    but those held fast, which stay where the old centre was and are out of the zone.
 * 3. A piece bound to another, held on to by it or riding it, is in a zone only while the one it is
 *    bound to is, so a piece that leaves takes those bound to it out as well. A piece off the table
 *    or out of the fight binds nothing.
 * 4. A zone left with fewer than two sides in it is over, and its pieces are out of it.
 * 5. Every other piece standing in a zone is inside it without being in it.
 */
export function zoneStateOf(world: ZoneWorld): ZoneState {
  const { rules, pxPerMetre } = world;
  const snap = world.snap ?? ((point: ZonePoint) => point);
  const pieces = new Map(world.pieces.map((piece) => [piece.id, piece]));
  const removeZones: string[] = [];
  const pieceZone = new Map<string, string>();

  const working: Working[] = [];
  for (const zone of [...world.zones].sort((a, b) => compareIds(a.id, b.id))) {
    if (!zone.centre) {
      removeZones.push(zone.id);
      continue;
    }
    working.push({
      id: zone.id,
      centre: zone.centre,
      limit: zone.limit,
      square: zone.square,
      forming: zone.forming,
      members: [],
      moved: false,
      formingChanged: false,
      limitChanged: false,
    });
  }
  const byId = new Map(working.map((zone) => [zone.id, zone]));

  for (const piece of [...world.pieces].sort((a, b) => compareIds(a.id, b.id))) {
    const zone = piece.zone.length > 0 ? byId.get(piece.zone) : undefined;
    if (zone && !piece.offField && !piece.down && piece.side !== null) zone.members.push(piece.id);
  }

  const countOf = (zone: Working) => zone.members.reduce((sum, id) => sum + (pieces.get(id)?.count ?? 1), 0);
  const shapeOf = (zone: Working, count = countOf(zone)): ZoneShape => {
    const size = zoneSizeFor(rules.sizes, count);
    return {
      centre: zone.centre,
      square: zone.square,
      reach: (zone.square ? size.sideM / 2 : size.radiusM) * pxPerMetre,
    };
  };

  for (const zone of working) {
    const shape = shapeOf(zone);
    const leeway = { ...shape, reach: shape.reach + CARRIED_OUT_M * pxPerMetre };
    zone.members = zone.members.filter((id) => zoneCovers(leeway, pieces.get(id)!.point));
  }

  let joined = true;
  while (joined) {
    joined = false;
    for (let i = 0; i < working.length && !joined; i++) {
      for (let j = i + 1; j < working.length && !joined; j++) {
        const keep = working[i];
        const other = working[j];
        if (!zoneCovers(shapeOf(keep), other.centre) && !zoneCovers(shapeOf(other), keep.centre)) continue;
        keep.centre = snap(midpointOf(keep.centre, other.centre));
        keep.moved = true;
        keep.members = [...keep.members, ...other.members].filter((id) => !pieces.get(id)!.held).sort(compareIds);
        if (keep.forming && !other.forming) {
          keep.forming = false;
          keep.formingChanged = true;
        }
        const limit = minimumOf(keep.limit, other.limit);
        if (limit !== keep.limit) keep.limitChanged = true;
        keep.limit = limit;
        removeZones.push(other.id);
        working.splice(j, 1);
        joined = true;
      }
    }
  }

  const binding = new Set(world.pieces.filter((piece) => !piece.offField).map((piece) => piece.id));
  const boundOf = (id: string): string => boundTo(pieces.get(id)!, binding);
  for (let dropped = true; dropped;) {
    dropped = false;
    for (const zone of working) {
      const kept = zone.members.filter((id) => !boundOf(id) || zone.members.includes(boundOf(id)));
      if (kept.length < zone.members.length) dropped = true;
      zone.members = kept;
    }
  }

  const sideOf = (id: string) => pieces.get(id)!.side!;
  const standing: Working[] = [];
  for (const zone of working) {
    const sides = new Set(zone.members.map(sideOf));
    if (sides.size < 2) {
      removeZones.push(zone.id);
      continue;
    }
    standing.push(zone);
    for (const id of zone.members) pieceZone.set(id, zone.id);
  }

  const views: ZoneView[] = standing.map((zone) => {
    const count = countOf(zone);
    const limit = zone.limit ?? zoneLimitOf(rules.sizes);
    const sides = new Map<string, number>();
    for (const id of zone.members) sides.set(sideOf(id), (sides.get(sideOf(id)) ?? 0) + pieces.get(id)!.count);
    return {
      id: zone.id,
      shape: shapeOf(zone, count),
      count,
      occupants: count,
      limit,
      overflowing: count > limit,
      forming: zone.forming,
      members: zone.members,
      inside: [],
      sides,
    };
  });

  const insideByPiece = new Map<string, ZoneView[]>();
  for (const piece of world.pieces) {
    if (pieceZone.has(piece.id) || piece.offField || piece.side === null) continue;
    for (const view of views) {
      if (!zoneCovers(view.shape, piece.point)) continue;
      (view.inside as string[]).push(piece.id);
      insideByPiece.set(piece.id, [...(insideByPiece.get(piece.id) ?? []), view]);
    }
  }
  for (const view of views) {
    (view.inside as string[]).sort(compareIds);
    const occupants = view.count + view.inside.reduce((sum, id) => sum + pieces.get(id)!.count, 0);
    Object.assign(view, { occupants, overflowing: occupants > view.limit });
  }

  const overlaps: [string, string][] = [];
  for (let i = 0; i < views.length; i++) {
    for (let j = i + 1; j < views.length; j++) {
      if (shapesMeet(views[i].shape, views[j].shape)) overlaps.push([views[i].id, views[j].id]);
    }
  }

  const setPieceZones = world.pieces
    .map((piece) => ({ id: piece.id, zone: pieceZone.get(piece.id) ?? '' }))
    .filter((change) => change.zone !== pieces.get(change.id)!.zone)
    .sort((a, b) => compareIds(a.id, b.id));
  const updateZones = standing
    .filter(
      (zone) =>
        zone.formingChanged ||
        zone.limitChanged ||
        (zone.moved && distanceBetween(zone.centre, originalCentre(world, zone.id)) > MOVED_PX)
    )
    .map((zone) => ({ id: zone.id, centre: zone.centre, forming: zone.forming, limit: zone.limit }));

  const viewById = new Map(views.map((view) => [view.id, view]));
  return {
    zones: views,
    overlaps,
    writes: { removeZones: [...removeZones].sort(compareIds), updateZones, setPieceZones },
    zoneOf: (pieceId) => viewById.get(pieceZone.get(pieceId) ?? '') ?? null,
    insideOf: (pieceId) => insideByPiece.get(pieceId) ?? [],
    pointOf: (pieceId) => {
      const zone = viewById.get(pieceZone.get(pieceId) ?? '');
      if (zone) return zone.shape.centre;
      return pieces.get(pieceId)?.point ?? null;
    },
    isEmpty: views.length < 1 && removeZones.length < 1 && setPieceZones.length < 1,
  };
}

/** Whether a state asks for anything to be written. */
export function hasZoneWrites(writes: ZoneWrites): boolean {
  return writes.removeZones.length > 0 || writes.updateZones.length > 0 || writes.setPieceZones.length > 0;
}

/** Whether two zones' ground meets, edges included. */
export function shapesMeet(a: ZoneShape, b: ZoneShape): boolean {
  const dx = Math.abs(a.centre.x - b.centre.x);
  const dy = Math.abs(a.centre.y - b.centre.y);
  if (a.square && b.square) return dx <= a.reach + b.reach && dy <= a.reach + b.reach;
  if (!a.square && !b.square) return Math.hypot(dx, dy) <= a.reach + b.reach;
  const square = a.square ? a : b;
  const circle = a.square ? b : a;
  const nearestX = Math.max(-square.reach, Math.min(square.reach, circle.centre.x - square.centre.x));
  const nearestY = Math.max(-square.reach, Math.min(square.reach, circle.centre.y - square.centre.y));
  return (
    Math.hypot(circle.centre.x - square.centre.x - nearestX, circle.centre.y - square.centre.y - nearestY) <=
    circle.reach
  );
}

function originalCentre(world: ZoneWorld, id: string): ZonePoint {
  return world.zones.find((zone) => zone.id === id)?.centre ?? { x: Number.NaN, y: Number.NaN };
}

function minimumOf(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
