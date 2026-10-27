import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, cellCount, CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { convertMoveLength, parseMoveUnit } from '@axe/domain/tabletop/move/move-units';
import { bondGroupOf } from '@axe/domain/tabletop/move/piece-bonds';
import { zoneCells } from '@axe/domain/tabletop/zone/zone-cells';
import { zoneCovers, ZonePoint, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';
import { LeaveInput, leaveReasonOf, mayEscape, zoneHolds, ZoneSideCounts } from '@axe/domain/tabletop/zone/zone-leave';
import { ZoneRules } from '@axe/domain/tabletop/zone/zone-rules';
import { ZonePieceInput, ZoneState, ZoneView } from '@axe/domain/tabletop/zone/zone-state';

/** What the zones need to know of the table they are on. */
export interface ZoneTable {
  readonly table: GameTable;
  readonly rules: ZoneRules;
  readonly pxPerMetre: number;
  readonly snap: (point: ZonePoint) => ZonePoint;
}

/** The pieces and zones on the table in view, as the zones see them at one moment. */
export interface ZoneSnapshot {
  readonly world: ZoneTable;
  readonly pieces: ZonePieceInput[];
  readonly state: ZoneState;
  /** The mounts ridden in front, each with the one riding it there. */
  readonly front: ReadonlyMap<string, string>;
  /** The pieces riding a mount behind its rider or carried as a load. */
  readonly carried: ReadonlySet<string>;
  /** Each piece's word that it will leave its zone: the round it gave it in, missing for none. */
  readonly leaveRounds: ReadonlyMap<string, string>;
  /** The pieces nobody can see, as the rules read it. */
  readonly unseen: ReadonlySet<string>;
  /** The pieces nobody may stop: those nobody can see, and those making a move nobody may stop. */
  readonly unstoppable: ReadonlySet<string>;
  /** Where the round stands, which a word to leave is kept by. */
  readonly turn: { readonly round: number; readonly roundsKept: boolean };
  /** Whether the side a move runs into chooses whether to stop it, rather than every zone stopping it of itself. */
  readonly stopsByChoice: boolean;
}

/** What a move is shaped by where zones stand on the table. */
export interface ZoneReachTerms {
  /** Where the move starts instead of where the token stands: the centre of the piece's zone. */
  readonly startPoint: ZonePoint | null;
  /** Whether the piece may not move at all by this kind, held in its zone. */
  readonly noReach: boolean;
  /** Cells the piece may not enter: zones already holding as many as they may. */
  readonly blocked: CellBits | null;
  /** Cells where the move ends: into a zone that holds the piece, or out of one it stood in. */
  readonly stops: CellBits | null;
}

/** What a move is shaped by where zones stand, as the zones themselves rather than cells. */
export interface ZoneMoveLimits {
  /** Where the move starts instead of where the token stands: the centre of the piece's zone. */
  readonly startPoint: ZonePoint | null;
  /** Whether the piece may not move at all by this kind, held in its zone. */
  readonly noReach: boolean;
  /** Zones the piece may not enter: those already holding as many as they may. */
  readonly shut: readonly ZoneShape[];
  /** Zones that end the move as the piece walks into them. */
  readonly stops: readonly ZoneShape[];
  /** Zones that end the move as the piece walks out of them: those it stands in without being in. */
  readonly escapes: readonly ZoneShape[];
}

/** A piece that could stop a move, and how many bodies it counts as. */
export interface ZoneInterrupter {
  readonly id: string;
  readonly count: number;
  readonly point: ZonePoint;
}

/** A zone that may stop a move, with the pieces of the other sides in it, any of which may stop it. */
export interface ZoneHold {
  readonly id: string;
  readonly shape: ZoneShape;
  readonly members: readonly ZoneInterrupter[];
}

/** A piece standing in zones that may stop a move without being in them, and which those zones are. */
export interface ZoneStander extends ZoneInterrupter {
  readonly zones: readonly string[];
}

/** The pieces and zones that could stop a move, and what counting them against the mover needs. */
export interface ZoneInterrupters {
  readonly moverCount: number;
  /** Whether nobody may stop the move: the piece cannot be seen, or it is making a move nobody may stop. */
  readonly unstoppable: boolean;
  /** Pieces in no zone and standing in none, which step into a move outside every zone. */
  readonly candidates: readonly ZoneInterrupter[];
  /** Every zone on the table, inside which those pieces may not step in. */
  readonly zones: readonly ZoneShape[];
  /** The zones that may stop the piece, by how many the sides in them count against it. */
  readonly holding: readonly ZoneHold[];
  /**
   * Pieces standing in a zone that may stop the piece without being in it, which stop it within their
   * own reach and within that zone.
   */
  readonly standing: readonly ZoneStander[];
  /** The pieces nobody can see, a move stopped by which makes a zone there and then. */
  readonly unseen: ReadonlySet<string>;
  readonly ratio: number;
  /** How close two points are, in table pixels, to be one. */
  readonly samePointPx: number;
}

/** Where a piece stood among the zones as a move began, to tell afterwards what the move did. */
export interface ZoneMoveStart {
  readonly zone: string;
  readonly inside: readonly string[];
  /** The kind of move it is made by, which an overflowing zone is left by. */
  readonly kind: string;
}

/**
 * What a move did among the zones: nothing, left the zone the piece was in, let its word to leave
 * go as it walked out of a zone it stood in, or was held by a zone, which it joins.
 */
export type ZoneMoveOutcome =
  | { readonly kind: 'stay' }
  | { readonly kind: 'left' }
  | { readonly kind: 'forgetLeave' }
  | { readonly kind: 'held'; readonly zone: ZoneView };

/**
 * What zones make of a move by a kind, as the zones themselves: where it starts, whether it may be
 * made at all, which zones it may not enter, which end it on walking in, and which end it on walking
 * out. Null where zones say nothing about this piece.
 */
export function zoneMoveLimits(snapshot: ZoneSnapshot, pieceId: string, kindName: string): ZoneMoveLimits | null {
  const mover = snapshot.pieces.find((one) => one.id === pieceId);
  if (!mover || mover.side === null || mover.offField) return null;
  const { state, pieces, world } = snapshot;
  const ratio = world.rules.outnumber;
  const own = state.zoneOf(pieceId);
  const mine = asOne(mover, snapshot);
  const counted = { side: mover.side, count: mine.count };
  const entering = enteringCountOf(mover, pieces);
  const limits = { shut: [] as ZoneShape[], stops: [] as ZoneShape[], escapes: [] as ZoneShape[] };
  const leaveRound = snapshot.leaveRounds.get(pieceId) ?? '';

  if (!mayAct(mover)) return { startPoint: own?.shape.centre ?? null, noReach: true, ...limits };
  if (own && leaveReasonOf(leaveInputOf(snapshot, own, mine, kindName, leaveRound)) === 'held') {
    return { startPoint: own.shape.centre, noReach: true, ...limits };
  }
  // Where the side a move runs into chooses whether to stop it, no zone ends the move of itself:
  // the way is drawn on through, and stopped once it is walked if the side says so.
  const ofItself = !snapshot.stopsByChoice && !snapshot.unstoppable.has(pieceId);
  const standingIn = own ? [] : state.insideOf(pieceId);
  for (const zone of state.zones) {
    if (zone === own) continue;
    if (standingIn.includes(zone)) {
      if (ofItself && !mayEscape(leaveInputOf(snapshot, zone, mine, kindName, leaveRound))) {
        limits.escapes.push(zone.shape);
      }
      continue;
    }
    if (zone.occupants + entering > zone.limit) limits.shut.push(zone.shape);
    else if (ofItself && zoneHolds(countsOf(zone, pieces), counted, 'pass', ratio)) limits.stops.push(zone.shape);
  }
  return { startPoint: own?.shape.centre ?? null, noReach: false, ...limits };
}

/** The limits of {@link zoneMoveLimits} laid on a grid's cells. */
export function zoneReachTerms(limits: ZoneMoveLimits, grid: CellGrid): ZoneReachTerms {
  if (limits.noReach) return { startPoint: limits.startPoint, noReach: true, blocked: null, stops: null };
  const blocked = new CellBits(cellCount(grid));
  const stops = new CellBits(cellCount(grid));
  for (const shape of limits.shut) blocked.or(zoneCells(grid, shape));
  for (const shape of limits.stops) stops.or(zoneCells(grid, shape));
  for (const shape of limits.escapes) stops.or(outside(zoneCells(grid, shape)));
  return {
    startPoint: limits.startPoint,
    noReach: false,
    blocked: blocked.isEmpty ? null : blocked,
    stops: stops.isEmpty ? null : stops,
  };
}

/**
 * Who could stop a move by a piece, by a kind of move.
 *
 * Outside every zone, any piece on another side that is in no zone, stands in none, is on the field
 * and may act. Every zone the piece is not in that would hold it, as the sides in it count against
 * the piece: walking into one, or out of one it stands in without having said it would leave; any
 * piece of another side in such a zone may stop it there. And any piece of another side standing in
 * such a zone without being in it, that may act, within its own reach inside the zone. Null where
 * zones say nothing about this piece.
 */
export function zoneInterrupters(snapshot: ZoneSnapshot, moverId: string, kindName: string): ZoneInterrupters | null {
  const moving = snapshot.pieces.find((one) => one.id === moverId);
  if (!moving || moving.side === null || moving.offField) return null;
  const { state, pieces, world } = snapshot;
  const ratio = world.rules.outnumber;
  const mine = asOne(moving, snapshot);
  const counted = { side: moving.side, count: mine.count };
  const entering = enteringCountOf(moving, pieces);
  const leaveRound = snapshot.leaveRounds.get(moverId) ?? '';
  // A mount ridden in front steps in by the one riding it, who counts for both; whoever rides
  // behind or is carried steps in for nobody.
  const standsAlone = (piece: ZonePieceInput) => !snapshot.front.has(piece.id) && !snapshot.carried.has(piece.id);
  const hostile = (piece: ZonePieceInput) =>
    piece.id !== moving.id &&
    piece.side !== null &&
    piece.side !== moving.side &&
    !piece.offField &&
    !piece.down &&
    !piece.held &&
    !piece.grabbedBy &&
    standsAlone(piece);
  const asInterrupter = (piece: ZonePieceInput): ZoneInterrupter => ({
    id: piece.id,
    count: asOne(piece, snapshot).count,
    point: piece.point,
  });

  const own = state.zoneOf(moving.id);
  const standingIn = state.insideOf(moving.id);
  const holding: ZoneHold[] = [];
  for (const zone of state.zones) {
    if (zone === own) continue;
    const holds = standingIn.includes(zone)
      ? !mayEscape(leaveInputOf(snapshot, zone, mine, kindName, leaveRound))
      : zone.occupants + entering <= zone.limit && zoneHolds(countsOf(zone, pieces), counted, 'pass', ratio);
    if (!holds) continue;
    const members = zone.members
      .map((id) => pieces.find((piece) => piece.id === id))
      .filter(
        (piece): piece is ZonePieceInput =>
          !!piece && piece.side !== null && piece.side !== moving.side && standsAlone(piece)
      )
      .map(asInterrupter);
    if (members.length > 0) holding.push({ id: zone.id, shape: zone.shape, members });
  }
  const holdingIds = new Set(holding.map((zone) => zone.id));
  const standing: ZoneStander[] = [];
  const candidates: ZoneInterrupter[] = [];
  for (const piece of pieces) {
    if (!hostile(piece) || state.zoneOf(piece.id)) continue;
    const inside = state.insideOf(piece.id);
    if (inside.length < 1) {
      candidates.push(asInterrupter(piece));
      continue;
    }
    const zones = inside.map((zone) => zone.id).filter((id) => holdingIds.has(id));
    if (zones.length > 0) standing.push({ ...asInterrupter(piece), zones });
  }
  return {
    moverCount: mine.count,
    unstoppable: snapshot.unstoppable.has(moverId),
    candidates,
    zones: state.zones.map((zone) => zone.shape),
    holding,
    standing,
    unseen: new Set(pieces.filter((piece) => snapshot.unseen.has(piece.id)).map((piece) => piece.id)),
    ratio,
    samePointPx: world.rules.samePointM * world.pxPerMetre,
  };
}

/** Whether a piece may move at all by a kind, as far as zones say. */
export function mayMoveByZones(snapshot: ZoneSnapshot | null, pieceId: string, kindName: string): boolean {
  const mover = snapshot?.pieces.find((one) => one.id === pieceId);
  if (!snapshot || !mover || mover.side === null) return true;
  if (!mayAct(mover)) return false;
  const own = snapshot.state.zoneOf(pieceId);
  if (!own) return true;
  const leaveRound = snapshot.leaveRounds.get(pieceId) ?? '';
  return leaveReasonOf(leaveInputOf(snapshot, own, asOne(mover, snapshot), kindName, leaveRound)) !== 'held';
}

/**
 * What a move did among the zones, the piece now standing with its middle at `point`.
 *
 * A piece that walked out of its zone has left it. Where zones stop moves of themselves, a piece held
 * walking out of a zone it stood in, or walking into one that holds it, is held by that zone; where
 * the side a move runs into chooses, or nobody may stop the piece, that was settled before it walked.
 * `unstoppable` is read as the move began, since the mark of a move nobody may stop goes as it ends.
 */
export function zoneMoveOutcome(
  snapshot: ZoneSnapshot,
  pieceId: string,
  start: ZoneMoveStart,
  point: ZonePoint,
  unstoppable: boolean
): ZoneMoveOutcome {
  const { state, pieces, world } = snapshot;
  const mover = pieces.find((one) => one.id === pieceId);
  if (!mover || mover.side === null) return { kind: 'stay' };
  if (start.zone.length > 0) {
    const left = state.zones.find((zone) => zone.id === start.zone);
    return !left || !zoneCovers(left.shape, point) ? { kind: 'left' } : { kind: 'stay' };
  }
  const leaveRound = snapshot.leaveRounds.get(pieceId) ?? '';
  const mine = asOne(mover, snapshot);
  const counted = { side: mover.side, count: mine.count };
  const ratio = world.rules.outnumber;
  const leftZones = state.zones.filter((zone) => start.inside.includes(zone.id) && !zoneCovers(zone.shape, point));
  const forgets: ZoneMoveOutcome =
    leftZones.length > 0 && leaveRound !== '' ? { kind: 'forgetLeave' } : { kind: 'stay' };
  if (unstoppable || snapshot.stopsByChoice) return forgets;
  const heldBack = leftZones.find((zone) => !mayEscape(leaveInputOf(snapshot, zone, mine, start.kind, leaveRound)));
  const stopped =
    heldBack ??
    state.zones.find(
      (zone) =>
        !start.inside.includes(zone.id) &&
        zoneCovers(zone.shape, point) &&
        zone.occupants <= zone.limit &&
        zoneHolds(countsOf(zone, pieces), counted, 'pass', ratio)
    );
  return stopped ? { kind: 'held', zone: stopped } : forgets;
}

/** Whether a piece may act of its own will: not down, not held fast, and held on to by nobody. */
function mayAct(piece: ZonePieceInput): boolean {
  return !piece.down && !piece.held && !piece.grabbedBy;
}

function leaveInputOf(
  snapshot: ZoneSnapshot,
  zone: ZoneView,
  mover: ZonePieceInput,
  kindName: string,
  leaveRound: string
): LeaveInput {
  const rules = snapshot.world.rules;
  return {
    counts: countsOf(zone, snapshot.pieces),
    mover: { side: mover.side!, count: mover.count },
    ratio: rules.outnumber,
    overflowing: zone.overflowing,
    leaveRound,
    round: snapshot.turn.round,
    roundsKept: snapshot.turn.roundsKept,
    leaveKind: rules.leaveKind,
    kind: kindName,
  };
}

function countsOf(zone: ZoneView, pieces: readonly ZonePieceInput[]): ZoneSideCounts {
  const inside = new Map<string, number>();
  for (const id of zone.inside) {
    const piece = pieces.find((one) => one.id === id);
    if (piece?.side) inside.set(piece.side, (inside.get(piece.side) ?? 0) + piece.count);
  }
  return { members: zone.sides, inside };
}

/**
 * A piece counted as one with its partner, as a mount ridden in front and the one riding it are,
 * for who may stop a move and whether a zone may be left: as many as both together.
 */
function asOne(piece: ZonePieceInput, snapshot: ZoneSnapshot): ZonePieceInput {
  const partner =
    snapshot.front.get(piece.id) ?? [...snapshot.front].find(([, rider]) => rider === piece.id)?.[0] ?? null;
  const other = partner === null ? undefined : snapshot.pieces.find((one) => one.id === partner);
  return other ? { ...piece, count: piece.count + other.count } : piece;
}

/** How many go into a zone with a piece: it, and everybody bound together with it but the held fast. */
function enteringCountOf(piece: ZonePieceInput, pieces: readonly ZonePieceInput[]): number {
  const group = new Set(bondGroupOf(piece.id, pieces));
  return pieces
    .filter((one) => group.has(one.id) && (one.id === piece.id || !one.held))
    .reduce((sum, one) => sum + one.count, 0);
}

/**
 * How many metres one cell of the table stands for: what the table says a cell is, turned into
 * metres, and a metre a cell where the table counts in cells or says nothing it can be measured by.
 */
export function metresPerCell(rules: { cellDistance: number; cellDistanceUnit: string }): number {
  const unit = parseMoveUnit(rules.cellDistanceUnit);
  if (!(rules.cellDistance > 0) || (unit !== 'metre' && unit !== 'foot')) return 1;
  return convertMoveLength(rules.cellDistance, unit, 'metre');
}

/**
 * Where a worked-out point is put on a table: the middle of its cell on a grid, or of its square
 * where the table counts several cells as one, and as it is without a grid.
 */
export function snapOn(table: GameTable): (point: ZonePoint) => ZonePoint {
  if (table.gridType === GridType.NONE) return (point) => point;
  const grid = moveGridOf(table);
  return (point) => {
    const index = cellIndexAt(grid, point.x, point.y);
    return index < 0 ? point : cellCenterOf(grid, index);
  };
}

/** Every cell a set leaves out. */
function outside(cells: CellBits): CellBits {
  const rest = new CellBits(cells.count);
  for (let index = 0; index < cells.count; index++) if (!cells.get(index)) rest.set(index);
  return rest;
}
