import { seededRandom } from '@axe/core/util/seeded-random';
import type { MapLightKind, MapPoint, MapRect } from '@axe/domain/tabletop/map-blocks';

/** The kinds of place laid out round the buildings and walls people put up: a farming village and two forts. */
export const SETTLEMENT_KINDS = ['village', 'barbarianFort', 'stoneFort'] as const;

export type SettlementKind = (typeof SETTLEMENT_KINDS)[number];

/**
 * What the ground of a cell of a settlement is, each painted with a band of its own: open ground, a
 * road or path, a yard or courtyard, the floor inside a building, tilled soil and a flooded paddy.
 */
export const SETTLEMENT_ZONES = { ground: 0, road: 1, yard: 2, floor: 3, soil: 4, paddy: 5 } as const;

/** What grows in a field: vegetables walked between, and wheat, maize and rice waded through. */
export const CROP_KINDS = ['vegetable', 'wheat', 'corn', 'rice'] as const;

export type CropKind = (typeof CROP_KINDS)[number];

/** The crops that slow whoever crosses them: tall stalks and a flooded paddy. Vegetables are walked between. */
export const SLOWING_CROPS: readonly CropKind[] = ['wheat', 'corn', 'rice'];

/**
 * What a wall is: the wall round a fort, a tower on it, the wall of a room, a low fence, the boards of a
 * barn or the hides of a tent.
 */
export const SETTLEMENT_WALL_KINDS = [
  'palisade',
  'watchtower',
  'stoneWall',
  'tower',
  'timberWall',
  'stoneRoomWall',
  'fence',
  'boardWall',
  'hideWall',
] as const;

export type SettlementWallKind = (typeof SETTLEMENT_WALL_KINDS)[number];

/** The walls a piece looks over and climbs: a fence, low enough to. Every other stops sight and feet alike. */
export const LOW_WALLS: readonly SettlementWallKind[] = ['fence'];

/** A door hung in a wall, a cell wide: one leaf of a gate or the door of a room. */
export interface SettlementDoor {
  readonly x: number;
  readonly y: number;
  /** The axis it bars, as a dungeon's door names it: a slab thin along x stands across an east-west way. */
  readonly across: 'x' | 'y';
  /** Whether it opens the other way round, which is what makes two leaves a pair. */
  readonly mirrored: boolean;
  /** A gate in the wall round a fort, or the door of a building. */
  readonly kind: 'gate' | 'door';
  /** What the wall it hangs in is, which it is as tall as and made to match. */
  readonly wall: SettlementWallKind;
}

/** A field of one crop, inside its fence where it has one. */
export interface SettlementCrop {
  readonly rect: MapRect;
  readonly crop: CropKind;
}

/** Something standing on a cell of its own: a well, a cart, a stack of hay, a totem, a hearth. */
export interface SettlementThing extends MapPoint {
  readonly thing: 'well' | 'hay' | 'cart' | 'totem' | 'hearth';
}

/** A fire burning or a lamp standing on a cell: a lantern by a door, a brazier on a wall, a camp's great fire. */
export interface SettlementFire extends MapPoint {
  readonly kind: MapLightKind;
}

/** A settlement laid out on a board. */
export interface SettlementLayout {
  readonly kind: SettlementKind;
  /** The ground of each cell, as one of `SETTLEMENT_ZONES`. */
  readonly zones: Uint8Array;
  /** The wall standing on each cell, as one more than its place in `SETTLEMENT_WALL_KINDS`, or 0 for none. */
  readonly walls: Uint8Array;
  readonly doors: readonly SettlementDoor[];
  readonly crops: readonly SettlementCrop[];
  readonly things: readonly SettlementThing[];
  /** Where a fire burns or a lamp stands, a cell each. */
  readonly fires: readonly SettlementFire[];
  /** Every cell anything of the settlement stands on, which nothing else is grown or put on. */
  readonly taken: Uint8Array;
  /** The middle of what a fort's wall rings round and how far the wall reaches from it each way, or null for a village. */
  readonly ring: { readonly middle: MapPoint; readonly reach: MapPoint } | null;
}

/** How tall each kind of wall stands, in cells. */
export const SETTLEMENT_WALL_HEIGHTS: Readonly<Record<SettlementWallKind, number>> = {
  palisade: 2.5,
  watchtower: 4,
  stoneWall: 3.5,
  tower: 5,
  timberWall: 2,
  stoneRoomWall: 3,
  fence: 0.6,
  boardWall: 2.5,
  hideWall: 2,
};

/** The fewest cells a room is across inside its walls, so a piece and a table fit in it. */
const LEAST_ROOM = 3;

/** A board of cells being laid out: the zone of each and what stands on it. */
class Plot {
  readonly zones: Uint8Array;
  readonly taken: Uint8Array;
  readonly walls: Uint8Array;
  readonly doors: SettlementDoor[] = [];
  readonly crops: SettlementCrop[] = [];
  readonly things: SettlementThing[] = [];
  readonly fires: SettlementFire[] = [];
  ring: { readonly middle: MapPoint; readonly reach: MapPoint } | null = null;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.zones = new Uint8Array(width * height);
    this.taken = new Uint8Array(width * height);
    this.walls = new Uint8Array(width * height);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Whether every cell of a rectangle is on the board and free, with as many free cells round it as asked. */
  free(rect: MapRect, margin = 0): boolean {
    for (let y = rect.y - margin; y < rect.y + rect.h + margin; y++) {
      for (let x = rect.x - margin; x < rect.x + rect.w + margin; x++) {
        if (!this.inside(x, y)) {
          if (y >= rect.y && y < rect.y + rect.h && x >= rect.x && x < rect.x + rect.w) return false;
          continue;
        }
        if (this.taken[y * this.width + x]) return false;
      }
    }
    return true;
  }

  /**
   * Whether the cells round a rectangle are free but for a wall of one kind, which a small building
   * may stand against.
   */
  clearBut(rect: MapRect, kind: SettlementWallKind): boolean {
    const mark = SETTLEMENT_WALL_KINDS.indexOf(kind) + 1;
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
      for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
        const edge = x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h;
        if (!edge || !this.inside(x, y)) continue;
        const cell = y * this.width + x;
        if (this.taken[cell] && this.walls[cell] !== mark) return false;
      }
    }
    return true;
  }

  take(rect: MapRect): void {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) if (this.inside(x, y)) this.taken[y * this.width + x] = 1;
    }
  }

  paint(rect: MapRect, zone: number): void {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) if (this.inside(x, y)) this.zones[y * this.width + x] = zone;
    }
  }

  /** Stands a wall on cells, the latest laid on a cell standing there, and takes the cells. */
  wall(cells: readonly MapPoint[], kind: SettlementWallKind): void {
    const mark = SETTLEMENT_WALL_KINDS.indexOf(kind) + 1;
    for (const { x, y } of cells) {
      if (!this.inside(x, y)) continue;
      this.walls[y * this.width + x] = mark;
      this.taken[y * this.width + x] = 1;
    }
  }

  layout(kind: SettlementKind): SettlementLayout {
    return {
      kind,
      zones: this.zones,
      walls: this.walls,
      doors: this.doors,
      crops: this.crops,
      things: this.things,
      fires: this.fires,
      taken: this.taken,
      ring: this.ring,
    };
  }
}

/**
 * Lays a settlement out on a board of the size given, the same from the same seed. `density`, from 0
 * to 100, says how full of buildings, fields and things it is, a middling 50 by default.
 */
export function laySettlement(
  kind: SettlementKind,
  width: number,
  height: number,
  seed: number,
  density = 50
): SettlementLayout {
  const plot = new Plot(width, height);
  const rng = seededRandom(seed + 6151);
  const fill = Math.min(Math.max(density, 0), 100) / 50;
  if (kind === 'village') layVillage(plot, rng, fill);
  else if (kind === 'barbarianFort') layBarbarianFort(plot, rng, fill);
  else layStoneFort(plot, rng, fill);
  return plot.layout(kind);
}

/** A whole number from `least` to `most`, both included. */
function between(least: number, most: number, rng: () => number): number {
  return least + Math.floor(rng() * (most - least + 1));
}

/**
 * A building with rooms in it: walls round the edge of its footprint, the inside cut into rooms by
 * walls with a door in each, a floor under them, and a door out of the side named, or for a tent a way
 * in left open. The rooms are cut one at a time, the largest across its longer way, so none is less
 * than `LEAST_ROOM` across. Its floor is the floor of a house unless another zone is asked for, as the
 * trodden earth of a barn or a tent is.
 */
function houseWithRooms(
  plot: Plot,
  rect: MapRect,
  rooms: number,
  wall: SettlementWallKind,
  facing: 'n' | 's' | 'e' | 'w',
  rng: () => number,
  { floor = SETTLEMENT_ZONES.floor, open = false }: { readonly floor?: number; readonly open?: boolean } = {}
): void {
  plot.take(rect);
  const inner = { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 };
  plot.paint(inner, floor);
  const walls: MapPoint[] = [];
  for (let x = rect.x; x < rect.x + rect.w; x++) walls.push({ x, y: rect.y }, { x, y: rect.y + rect.h - 1 });
  for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) walls.push({ x: rect.x, y }, { x: rect.x + rect.w - 1, y });

  const spaces: MapRect[] = [inner];
  const partitions: MapPoint[] = [];
  while (spaces.length < rooms) {
    spaces.sort((a, b) => b.w * b.h - a.w * a.h);
    const room = spaces[0];
    const across = room.w >= room.h;
    const length = across ? room.w : room.h;
    if (length < LEAST_ROOM * 2 + 1) break;
    const at = between(LEAST_ROOM, length - LEAST_ROOM - 1, rng);
    const line: MapPoint[] = [];
    if (across) for (let y = room.y; y < room.y + room.h; y++) line.push({ x: room.x + at, y });
    else for (let x = room.x; x < room.x + room.w; x++) line.push({ x, y: room.y + at });
    const door = line[between(0, line.length - 1, rng)];
    partitions.push(...line.filter((cell) => cell !== door));
    plot.doors.push({ x: door.x, y: door.y, across: across ? 'x' : 'y', mirrored: rng() < 0.5, kind: 'door', wall });
    spaces.splice(
      0,
      1,
      across ? { x: room.x, y: room.y, w: at, h: room.h } : { x: room.x, y: room.y, w: room.w, h: at },
      across
        ? { x: room.x + at + 1, y: room.y, w: room.w - at - 1, h: room.h }
        : { x: room.x, y: room.y + at + 1, w: room.w, h: room.h - at - 1 }
    );
  }

  const blocked = new Set(partitions.map(({ x, y }) => `${x},${y}`));
  const sideCells =
    facing === 'n' || facing === 's'
      ? Array.from({ length: rect.w - 2 }, (_, i) => ({
          x: rect.x + 1 + i,
          y: facing === 'n' ? rect.y : rect.y + rect.h - 1,
        }))
      : Array.from({ length: rect.h - 2 }, (_, i) => ({
          x: facing === 'w' ? rect.x : rect.x + rect.w - 1,
          y: rect.y + 1 + i,
        }));
  const inward = { n: { x: 0, y: 1 }, s: { x: 0, y: -1 }, e: { x: -1, y: 0 }, w: { x: 1, y: 0 } }[facing];
  const clear = sideCells.filter(({ x, y }) => !blocked.has(`${x + inward.x},${y + inward.y}`));
  const entrance = clear[Math.floor(clear.length / 2)] ?? sideCells[Math.floor(sideCells.length / 2)];
  if (open) plot.paint({ ...entrance, w: 1, h: 1 }, floor);
  else
    plot.doors.push({
      x: entrance.x,
      y: entrance.y,
      across: facing === 'n' || facing === 's' ? 'y' : 'x',
      mirrored: rng() < 0.5,
      kind: 'door',
      wall,
    });
  plot.wall(
    [...walls, ...partitions].filter(({ x, y }) => x !== entrance.x || y !== entrance.y),
    wall
  );
}

/**
 * A road from one edge of the board to the other, two cells wide, bending a cell aside every few cells
 * and drawn back toward where it set out from, so it wanders without straying off. Answers the first
 * of its two cells across at every step along it.
 */
function layRoad(plot: Plot, rng: () => number, along: 'x' | 'y', at: number): number[] {
  const length = along === 'x' ? plot.width : plot.height;
  const breadth = along === 'x' ? plot.height : plot.width;
  const middles: number[] = [];
  let middle = at;
  let turn = between(4, 8, rng);
  for (let step = 0; step < length; step++) {
    if (step === turn) {
      middle += middle > at + 1 ? -1 : middle < at - 1 ? 1 : rng() < 0.5 ? -1 : 1;
      turn += between(4, 8, rng);
    }
    middle = Math.min(Math.max(middle, 3), breadth - 5);
    middles.push(middle);
    const rect = along === 'x' ? { x: step, y: middle, w: 1, h: 2 } : { x: middle, y: step, w: 2, h: 1 };
    plot.paint(rect, SETTLEMENT_ZONES.road);
    plot.take(rect);
  }
  return middles;
}

/**
 * A farming village: a road across the board with houses along it, each with its rooms and a door to
 * the road, a barn or two, fields of crops behind them, each fenced but for a gap, a well by the road
 * and hay and carts about.
 */
function layVillage(plot: Plot, rng: () => number, fill: number): void {
  const middles = layRoad(plot, rng, 'x', Math.floor(plot.height / 2) - 1);
  const houses = Math.max(2, Math.round(between(3, 5, rng) * fill));
  const spacing = plot.width / (houses + 1);
  for (let i = 0; i < houses; i++) {
    const w = between(5, 7, rng);
    const h = between(5, 6, rng);
    const north = i % 2 === 0;
    const x = Math.round(spacing * (i + 1) - w / 2);
    const under = middles.slice(Math.max(x, 0), Math.max(x + w, 0));
    if (under.length < w) continue;
    const rect = { x, y: north ? Math.min(...under) - 1 - h : Math.max(...under) + 3, w, h };
    if (!plot.free(rect, 1)) continue;
    houseWithRooms(plot, rect, between(2, 3, rng), 'timberWall', north ? 's' : 'n', rng);
    plot.paint({ x: rect.x, y: north ? rect.y + rect.h : rect.y - 1, w: rect.w, h: 1 }, SETTLEMENT_ZONES.yard);
    const lamp = { x: rect.x + rect.w, y: north ? rect.y + rect.h : rect.y - 1 };
    if (plot.inside(lamp.x, lamp.y) && plot.free({ ...lamp, w: 1, h: 1 })) {
      plot.take({ ...lamp, w: 1, h: 1 });
      plot.fires.push({ ...lamp, kind: 'lantern' });
    }
    const beside = { x: rect.x + rect.w + 1, y: north ? rect.y : rect.y + rect.h - 4, w: 5, h: 4 };
    const behind = {
      x: rect.x + Math.floor((rect.w - 5) / 2),
      y: north ? rect.y - 5 : rect.y + rect.h + 1,
      w: 5,
      h: 4,
    };
    const barn = [beside, behind].find((spot) => plot.free(spot, 1));
    if (rng() < 0.5 && barn) {
      houseWithRooms(plot, barn, 1, 'boardWall', north ? 's' : 'n', rng, { floor: SETTLEMENT_ZONES.yard });
      const hay = { x: barn.x + barn.w, y: barn.y + 1 };
      if (plot.inside(hay.x, hay.y) && plot.free({ ...hay, w: 1, h: 1 })) {
        plot.take({ ...hay, w: 1, h: 1 });
        plot.things.push({ ...hay, thing: 'hay' });
      }
    }
  }

  const fields = Math.round(between(5, 8, rng) * fill);
  for (let tries = 0, laid = 0; tries < 200 && laid < fields; tries++) {
    const w = between(5, 9, rng);
    const h = between(4, 7, rng);
    const rect = { x: between(1, plot.width - w - 1, rng), y: between(1, plot.height - h - 1, rng), w, h };
    if (!plot.free(rect, 1)) continue;
    const crop = CROP_KINDS[Math.floor(rng() * CROP_KINDS.length)];
    plot.take(rect);
    laid++;
    if (crop === 'rice') {
      plot.paint(rect, SETTLEMENT_ZONES.paddy);
      plot.crops.push({ rect, crop });
      continue;
    }
    const fence: MapPoint[] = [];
    for (let x = rect.x; x < rect.x + rect.w; x++) fence.push({ x, y: rect.y }, { x, y: rect.y + rect.h - 1 });
    for (let y = rect.y + 1; y < rect.y + rect.h - 1; y++) fence.push({ x: rect.x, y }, { x: rect.x + rect.w - 1, y });
    const gap = between(1, rect.w - 3, rng);
    const side = rng() < 0.5 ? rect.y : rect.y + rect.h - 1;
    plot.wall(
      fence.filter(({ x, y }) => y !== side || (x !== rect.x + gap && x !== rect.x + gap + 1)),
      'fence'
    );
    const inner = { x: rect.x + 1, y: rect.y + 1, w: rect.w - 2, h: rect.h - 2 };
    plot.paint(inner, SETTLEMENT_ZONES.soil);
    plot.crops.push({ rect: inner, crop });
  }

  const wellX = Math.floor(plot.width / 2);
  const well = { x: wellX, y: middles[wellX] - 1 };
  if (plot.inside(well.x, well.y) && plot.free({ ...well, w: 1, h: 1 })) {
    plot.take({ ...well, w: 1, h: 1 });
    plot.things.push({ ...well, thing: 'well' });
  }
  for (let tries = 0, carts = 0; tries < 40 && carts < Math.round(2 * fill); tries++) {
    const x = between(2, plot.width - 3, rng);
    const y = middles[x] + (rng() < 0.5 ? -1 : 2);
    if (!plot.inside(x, y) || !plot.free({ x, y, w: 1, h: 1 })) continue;
    plot.take({ x, y, w: 1, h: 1 });
    plot.things.push({ x, y, thing: rng() < 0.6 ? 'cart' : 'hay' });
    carts++;
  }
}

/**
 * The cells of the ring a wall round an ellipse stands on: every cell inside it with a cell outside
 * among the eight round it, so the ring is solid and nobody slips through it corner to corner.
 */
function ellipseRing(cx: number, cy: number, rx: number, ry: number, width: number, height: number): MapPoint[] {
  const inside = (x: number, y: number) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const ring: MapPoint[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++)
        for (let dx = -1; dx <= 1; dx++) if (!inside(x + dx, y + dy)) edge = true;
      if (edge) ring.push({ x, y });
    }
  }
  return ring;
}

/** Hangs a gate two leaves wide in a ring of wall, at two cells of it side by side, which it takes out of the ring. */
function hangGate(plot: Plot, ring: MapPoint[], at: MapPoint, along: 'x' | 'y', wall: SettlementWallKind): MapPoint[] {
  const second = along === 'x' ? { x: at.x + 1, y: at.y } : { x: at.x, y: at.y + 1 };
  const across = along === 'x' ? 'y' : 'x';
  plot.doors.push({ ...at, across, mirrored: false, kind: 'gate', wall });
  plot.doors.push({ ...second, across, mirrored: true, kind: 'gate', wall });
  return ring.filter((cell) => !(cell.x === at.x && cell.y === at.y) && !(cell.x === second.x && cell.y === second.y));
}

/**
 * A fort of a people who build in wood: a ring of sharpened logs round the middle of the board with a
 * gate to the south and watchtowers on it, the chief's hall inside with its rooms, tents round a great
 * fire, totems, and a path from the gate to the edge of the board.
 */
function layBarbarianFort(plot: Plot, rng: () => number, fill: number): void {
  const cx = plot.width / 2;
  const cy = plot.height / 2;
  const rx = Math.max(6, plot.width * 0.36);
  const ry = Math.max(5, plot.height * 0.36);
  let ring = ellipseRing(cx, cy, rx, ry, plot.width, plot.height);
  plot.ring = { middle: { x: cx, y: cy }, reach: { x: rx, y: ry } };
  const bottom = Math.max(...ring.map((cell) => cell.y));
  const gateX = Math.floor(cx) - 1;
  ring = hangGate(plot, ring, { x: gateX, y: bottom }, 'x', 'palisade');
  for (let y = bottom + 1; y < plot.height; y++) plot.paint({ x: gateX, y, w: 2, h: 1 }, SETTLEMENT_ZONES.road);
  plot.take({ x: gateX, y: bottom, w: 2, h: 1 });
  for (let y = Math.floor(cy); y < bottom; y++) {
    plot.paint({ x: gateX, y, w: 2, h: 1 }, SETTLEMENT_ZONES.road);
    plot.take({ x: gateX, y, w: 2, h: 1 });
  }

  const towers: MapPoint[] = [];
  for (const angle of [Math.PI * 0.62, Math.PI * 0.38, Math.PI * 1.25, Math.PI * 1.75, Math.PI]) {
    const x = Math.round(cx + Math.cos(angle) * rx - 1);
    const y = Math.round(cy - Math.sin(angle) * ry - 1);
    towers.push({ x, y });
  }
  const towerCells = new Set<string>();
  for (const tower of towers) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) towerCells.add(`${tower.x + dx},${tower.y + dy}`);
  }
  plot.wall(
    ring.filter(({ x, y }) => !towerCells.has(`${x},${y}`)),
    'palisade'
  );
  plot.wall(
    [...towerCells].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y };
    }),
    'watchtower'
  );

  const inside = (x: number, y: number) => ((x + 0.5 - cx) / (rx - 1.5)) ** 2 + ((y + 0.5 - cy) / (ry - 1.5)) ** 2 <= 1;
  for (let y = 0; y < plot.height; y++) {
    for (let x = 0; x < plot.width; x++) {
      if (inside(x, y) && plot.zones[y * plot.width + x] === SETTLEMENT_ZONES.ground) {
        plot.zones[y * plot.width + x] = SETTLEMENT_ZONES.yard;
      }
    }
  }
  const hall = { x: Math.round(cx - 4), y: Math.round(cy - ry * 0.65), w: 8, h: 5 };
  if (plot.free(hall)) {
    houseWithRooms(plot, hall, 2, 'timberWall', 's', rng);
    plot.things.push({ x: hall.x + 2, y: hall.y + 2, thing: 'hearth' });
  }
  plot.fires.push({ x: Math.floor(cx), y: Math.floor(cy) + 1, kind: 'campfire' });
  plot.take({ x: Math.floor(cx) - 1, y: Math.floor(cy), w: 3, h: 3 });

  const tents = Math.max(2, Math.round(between(3, 5, rng) * fill));
  for (let tries = 0, laid = 0; tries < 600 && laid < tents; tries++) {
    const size = tries < 150 ? 4 : 3;
    const x = between(1, plot.width - size - 1, rng);
    const y = between(1, plot.height - size - 1, rng);
    const rect = { x, y, w: size, h: size };
    const far = size - 1;
    const within =
      size > 3
        ? [inside(x, y), inside(x + far, y), inside(x, y + far), inside(x + far, y + far)].every(Boolean)
        : inside(x + 1, y + 1);
    if (!within || !(size > 3 ? plot.free(rect, 1) : plot.free(rect) && plot.clearBut(rect, 'palisade'))) continue;
    const dx = cx - (x + size / 2);
    const dy = cy - (y + size / 2);
    const facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : dy > 0 ? 's' : 'n';
    houseWithRooms(plot, rect, 1, 'hideWall', facing, rng, { floor: SETTLEMENT_ZONES.yard, open: true });
    laid++;
  }
  for (let tries = 0, laid = 0; tries < 100 && laid < 3; tries++) {
    const x = between(1, plot.width - 2, rng);
    const y = between(1, plot.height - 2, rng);
    if (!inside(x, y) || !plot.free({ x, y, w: 1, h: 1 }, 1)) continue;
    plot.take({ x, y, w: 1, h: 1 });
    plot.things.push({ x, y, thing: 'totem' });
    laid++;
  }
  for (const tower of towers) plot.fires.push({ x: tower.x, y: tower.y + 2, kind: 'brazier' });
}

/**
 * A fort of stone: a square wall round the middle of the board with a tower on each corner and a gate
 * between two towers to the south, a paved courtyard, the keep at the back with its rooms, barracks
 * and stables along the walls, a well, and a road from the gate to the edge of the board.
 */
function layStoneFort(plot: Plot, rng: () => number, fill: number): void {
  const x0 = Math.max(2, Math.round(plot.width * 0.16));
  const x1 = plot.width - 1 - x0;
  const y0 = Math.max(2, Math.round(plot.height * 0.14));
  const y1 = plot.height - 1 - y0;
  const gateX = Math.floor((x0 + x1) / 2);
  plot.ring = {
    middle: { x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2 },
    reach: { x: (x1 - x0 + 1) / 2, y: (y1 - y0 + 1) / 2 },
  };
  plot.paint({ x: x0 + 1, y: y0 + 1, w: x1 - x0 - 1, h: y1 - y0 - 1 }, SETTLEMENT_ZONES.yard);
  for (let y = y1 + 1; y < plot.height; y++) plot.paint({ x: gateX, y, w: 2, h: 1 }, SETTLEMENT_ZONES.road);

  const towers = [
    { x: x0 - 1, y: y0 - 1, w: 3, h: 3 },
    { x: x1 - 1, y: y0 - 1, w: 3, h: 3 },
    { x: x0 - 1, y: y1 - 1, w: 3, h: 3 },
    { x: x1 - 1, y: y1 - 1, w: 3, h: 3 },
    { x: gateX - 2, y: y1 - 1, w: 2, h: 3 },
    { x: gateX + 2, y: y1 - 1, w: 2, h: 3 },
  ];
  const inTower = (x: number, y: number) =>
    towers.some((tower) => x >= tower.x && x < tower.x + tower.w && y >= tower.y && y < tower.y + tower.h);
  let ring: MapPoint[] = [];
  for (let x = x0; x <= x1; x++) ring.push({ x, y: y0 }, { x, y: y1 });
  for (let y = y0 + 1; y < y1; y++) ring.push({ x: x0, y }, { x: x1, y });
  ring = hangGate(plot, ring, { x: gateX, y: y1 }, 'x', 'stoneWall');
  plot.take({ x: gateX, y: y1, w: 2, h: 1 });
  plot.wall(
    ring.filter(({ x, y }) => !inTower(x, y)),
    'stoneWall'
  );
  const towerCells: MapPoint[] = [];
  for (const tower of towers) {
    for (let y = tower.y; y < tower.y + tower.h; y++) {
      for (let x = tower.x; x < tower.x + tower.w; x++) {
        if (x === gateX || x === gateX + 1) continue;
        towerCells.push({ x, y });
      }
    }
  }
  plot.wall(towerCells, 'tower');
  plot.fires.push(
    { x: x0 + 2, y: y0 + 2, kind: 'brazier' },
    { x: x1 - 2, y: y0 + 2, kind: 'brazier' },
    { x: x0 + 2, y: y1 - 2, kind: 'brazier' },
    { x: x1 - 2, y: y1 - 2, kind: 'brazier' }
  );
  for (const fire of plot.fires) plot.take({ x: fire.x, y: fire.y, w: 1, h: 1 });

  const innerW = x1 - x0 - 1;
  const innerH = y1 - y0 - 1;
  const keepW = Math.min(14, Math.max(LEAST_ROOM + 2, innerW - 6));
  const keepH = Math.min(9, Math.max(LEAST_ROOM + 2, Math.min(innerH - 3, Math.round(innerH * 0.45))));
  const keep = { x: x0 + 1 + Math.round((innerW - keepW) / 2), y: y0 + 2, w: keepW, h: keepH };
  if (plot.free(keep)) {
    houseWithRooms(plot, keep, between(3, 5, rng), 'stoneRoomWall', 's', rng);
  }
  const buildings = Math.max(1, Math.round(2 * fill));
  const below = keep.y + keep.h + 1;
  for (let i = 0; i < buildings; i++) {
    const west = i % 2 === 0;
    const narrow = Math.max(3, Math.min(5, Math.round(innerH * 0.3)));
    const spots = [
      {
        rect: {
          x: west ? x0 + 1 : x1 - 5,
          y: below,
          w: 5,
          h: Math.min(Math.max(5, Math.round(innerH * 0.4)), y1 - 3 - below),
        },
        facing: west ? 'e' : 'w',
      },
      { rect: { x: west ? x0 + 1 : x1 - 3, y: y1 - 3 - narrow, w: 3, h: narrow }, facing: 's' },
    ] as const;
    const spot = spots.find(({ rect }) => rect.h >= 3 && plot.free(rect));
    if (!spot) continue;
    const { rect, facing } = spot;
    if (west) houseWithRooms(plot, rect, between(1, 2, rng), 'stoneRoomWall', facing, rng);
    else houseWithRooms(plot, rect, between(2, 3, rng), 'stoneRoomWall', facing, rng, { floor: SETTLEMENT_ZONES.yard });
  }
  const well = { x: gateX + 3, y: y1 - 3 };
  if (plot.free({ ...well, w: 1, h: 1 }, 1)) {
    plot.take({ ...well, w: 1, h: 1 });
    plot.things.push({ ...well, thing: 'well' });
  }
  plot.fires.push({ x: gateX - 1, y: y1 + 2, kind: 'stand' }, { x: gateX + 2, y: y1 + 2, kind: 'stand' });
}
