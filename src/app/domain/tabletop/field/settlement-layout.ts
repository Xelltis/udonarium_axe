import { clamp } from '@axe/core/util/clamp';
import { seededRandom } from '@axe/core/util/seeded-random';
import { OPPOSITE_SIDE, type Side, SIDE_STEPS, TURN_TO_FACE } from '@axe/domain/tabletop/cell-steps';
import type { DungeonFurnishing } from '@axe/domain/tabletop/dungeon/dungeon-layout';
import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import type { MapLightKind, MapPoint, MapRect } from '@axe/domain/tabletop/map-blocks';

/**
 * The kinds of place laid out round the buildings and walls people put up: a farming village, two
 * forts, and the town below a castle.
 */
export const SETTLEMENT_KINDS = ['village', 'barbarianFort', 'stoneFort', 'castleTown'] as const;

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

/**
 * A cell a stream runs through, and which way its water runs on out of it, in degrees clockwise from
 * the top of the board: 0, 90, 180 or 270, always towards the next cell of the stream, and off the
 * board out of the last.
 */
export interface SettlementStreamCell extends MapPoint {
  readonly flow: number;
  /** Whether a road crosses the stream here, the water running under it and the road left dry. */
  readonly bridge: boolean;
}

/** A stream a cell wide running across a board from its top edge to its bottom edge, its cells in the order the water runs. */
export interface SettlementStream {
  readonly cells: readonly SettlementStreamCell[];
}

/** The mills a village works: one whose sails turn in the wind, and one whose wheel the stream turns. */
export const MILL_KINDS = ['windmill', 'watermill'] as const;

export type MillKind = (typeof MILL_KINDS)[number];

/**
 * A mill standing on the cells of a rectangle, turned as its model is: by `turn` degrees clockwise
 * from facing south, so that at 90 it faces west, at 180 north and at 270 east. A windmill's sails
 * face the way it does; a watermill's wheel is the column or row of its rectangle on its east side
 * at nought, turned with it, standing in the stream, its house the rest of it.
 */
export interface SettlementMill {
  readonly kind: MillKind;
  readonly rect: MapRect;
  readonly turn: number;
}

/**
 * What stands in a town's streets, or hangs on its walls: a fountain, market stalls, lamp posts,
 * benches and boxes of flowers, a banner on the town wall and a sign over a shop's door.
 */
export const TOWN_FIXTURE_KINDS = [
  'fountain',
  'marketStallFruit',
  'marketStallCloth',
  'marketStallPottery',
  'lampPost',
  'bench',
  'planter',
  'banner',
  'signInn',
  'signTavern',
  'signSmithy',
  'signBakery',
  'signShop',
] as const;

export type TownFixtureKind = (typeof TOWN_FIXTURE_KINDS)[number];

/** The fixtures that hang on a wall, sharing its cell, rather than standing on a cell of their own. */
export const HUNG_FIXTURES: readonly TownFixtureKind[] = [
  'banner',
  'signInn',
  'signTavern',
  'signSmithy',
  'signBakery',
  'signShop',
];

/**
 * A fixture standing on the cells of a rectangle, or hung on the wall standing on its one cell, turned
 * as its model is: by `turn` degrees clockwise from facing south.
 */
export interface SettlementFixture {
  readonly kind: TownFixtureKind;
  readonly rect: MapRect;
  readonly turn: number;
}

/**
 * The kinds of building a castle town is built of, each with its rooms furnished as what it is: a
 * church, an inn, a tavern, a smithy, a bakery, a general store, the guards' house by the gate, and
 * the houses of the townsfolk.
 */
export const TOWN_BUILDING_KINDS = [
  'church',
  'inn',
  'tavern',
  'smithy',
  'bakery',
  'shop',
  'guardhouse',
  'house',
] as const;

export type TownBuildingKind = (typeof TOWN_BUILDING_KINDS)[number];

/**
 * What each room of each kind of building is: the one its door opens into, and the ones behind it.
 * An inn's door opens into its common room and its bedrooms are behind; a guards' house keeps its
 * bunks and its weapons in turn behind its guardroom.
 */
export const TOWN_ROOM_KINDS: Readonly<
  Record<TownBuildingKind, { readonly front: string; readonly back: readonly string[] }>
> = {
  church: { front: 'nave', back: ['vestry'] },
  inn: { front: 'innHall', back: ['innRoom'] },
  tavern: { front: 'tavern', back: ['tavernStore'] },
  smithy: { front: 'smithy', back: ['smithyStore'] },
  bakery: { front: 'bakeryShop', back: ['bakery'] },
  shop: { front: 'shop', back: ['shopStore'] },
  guardhouse: { front: 'guardroom', back: ['barracks', 'armory'] },
  house: { front: 'kitchen', back: ['bedroom'] },
};

/** A room inside a building's walls, and what it is, which is how it is furnished. */
export interface SettlementRoom extends MapRect {
  readonly kind: string;
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
  /**
   * Every cell anything of the settlement stands on or keeps clear, which nothing else is grown or put
   * on: its buildings and walls, a town's fixtures and lamps, and the cell in front of a door.
   */
  readonly taken: Uint8Array;
  /** The middle of what a fort's wall rings round and how far the wall reaches from it each way, or null for a village. */
  readonly ring: { readonly middle: MapPoint; readonly reach: MapPoint } | null;
  /** The stream run through a village. Left out, none runs through it. */
  readonly stream?: SettlementStream;
  /** The mills a village works. Left out, it has none. */
  readonly mills?: readonly SettlementMill[];
  /** The rooms of a town's buildings, each with what it is. Left out where they are not furnished. */
  readonly rooms?: readonly SettlementRoom[];
  /** What stands in a town's streets and hangs on its walls. Left out, nothing. */
  readonly fixtures?: readonly SettlementFixture[];
  /** The furniture of a town's rooms, as a dungeon's rooms are furnished. Left out, they stand bare. */
  readonly furnishings?: readonly DungeonFurnishing[];
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

/**
 * How many times a barbarian fort tries to pitch a tent four cells across, and then one three across
 * where none of those has room, so that a large fort is pitched with large tents and a small one still
 * with small ones.
 */
const LARGE_TENT_TRIES = 300;
const SMALL_TENT_TRIES = 450;

/** How a wall of one kind is written in `SettlementLayout.walls`: one more than its place in `SETTLEMENT_WALL_KINDS`. */
function wallMark(kind: SettlementWallKind): number {
  return SETTLEMENT_WALL_KINDS.indexOf(kind) + 1;
}

/** A board of cells being laid out: the zone of each and what stands on it. */
class Plot {
  readonly zones: Uint8Array;
  readonly taken: Uint8Array;
  readonly walls: Uint8Array;
  readonly doors: SettlementDoor[] = [];
  readonly crops: SettlementCrop[] = [];
  readonly things: SettlementThing[] = [];
  readonly fires: SettlementFire[] = [];
  readonly rooms: SettlementRoom[] = [];
  readonly fixtures: SettlementFixture[] = [];
  ring: { readonly middle: MapPoint; readonly reach: MapPoint } | null = null;
  /**
   * The cells something stands on in a town's streets, a fixture or a fire, or that are kept clear in
   * front of a door: nothing else is stood on one.
   */
  private readonly stood: Uint8Array;

  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.zones = new Uint8Array(width * height);
    this.taken = new Uint8Array(width * height);
    this.walls = new Uint8Array(width * height);
    this.stood = new Uint8Array(width * height);
  }

  /** Keeps a cell clear, as the one in front of a door is, so nothing is stood on it. */
  keepClear(x: number, y: number): void {
    if (this.inside(x, y)) this.stood[y * this.width + x] = 1;
  }

  /** Whether every cell of a rectangle is on the board with nothing standing on it nor kept clear. */
  canStand(rect: MapRect): boolean {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        if (!this.inside(x, y) || this.stood[y * this.width + x]) return false;
      }
    }
    return true;
  }

  /**
   * Stands a fixture on the ground where it can stand, and keeps its cells for it; answers whether it
   * stood. A fixture that hangs on a wall stands on no ground, and is hung whatever stands below.
   */
  stand(fixture: SettlementFixture): boolean {
    if (HUNG_FIXTURES.includes(fixture.kind)) {
      this.fixtures.push(fixture);
      return true;
    }
    if (!this.canStand(fixture.rect)) return false;
    this.fixtures.push(fixture);
    for (let y = fixture.rect.y; y < fixture.rect.y + fixture.rect.h; y++) {
      for (let x = fixture.rect.x; x < fixture.rect.x + fixture.rect.w; x++) this.stood[y * this.width + x] = 1;
    }
    return true;
  }

  /** Lights a fire on a cell where it can stand, and keeps the cell for it; answers whether it was lit. */
  light(fire: SettlementFire): boolean {
    if (!this.canStand({ x: fire.x, y: fire.y, w: 1, h: 1 })) return false;
    this.fires.push(fire);
    this.stood[fire.y * this.width + fire.x] = 1;
    return true;
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
    for (let y = rect.y - 1; y <= rect.y + rect.h; y++) {
      for (let x = rect.x - 1; x <= rect.x + rect.w; x++) {
        const edge = x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h;
        if (!edge || !this.inside(x, y)) continue;
        if (this.taken[y * this.width + x] && !this.wallOf(x, y, kind)) return false;
      }
    }
    return true;
  }

  /** Whether a wall of one kind stands on a cell. */
  wallOf(x: number, y: number, kind: SettlementWallKind): boolean {
    return this.inside(x, y) && this.walls[y * this.width + x] === wallMark(kind);
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
    const mark = wallMark(kind);
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
      taken: this.taken.map((cell, index) => cell | this.stood[index]),
      ring: this.ring,
      ...(this.rooms.length > 0 ? { rooms: this.rooms } : {}),
      ...(this.fixtures.length > 0 ? { fixtures: this.fixtures } : {}),
    };
  }
}

/**
 * Lays a settlement out on a board of the size given, the same from the same seed. `density`, from 0
 * to 100, says how full of buildings, fields and things it is, a middling 50 by default. A village's
 * stream and mills are not laid here but run through it afterwards, where it left room for them
 * (`layMillStream`).
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
  const fill = clamp(density, 0, 100) / 50;
  if (kind === 'village') layVillage(plot, rng, fill);
  else if (kind === 'barbarianFort') layBarbarianFort(plot, rng, fill);
  else if (kind === 'castleTown') layCastleTown(plot, rng, fill);
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
 * trodden earth of a barn or a tent is. Answers its rooms inside its walls and the cell its way in is.
 */
function houseWithRooms(
  plot: Plot,
  rect: MapRect,
  rooms: number,
  wall: SettlementWallKind,
  facing: 'n' | 's' | 'e' | 'w',
  rng: () => number,
  { floor = SETTLEMENT_ZONES.floor, open = false }: { readonly floor?: number; readonly open?: boolean } = {}
): { readonly rooms: readonly MapRect[]; readonly entrance: MapPoint } {
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
  return { rooms: spaces, entrance };
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
    middle = clamp(middle, 3, breadth - 5);
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
  for (let tries = 0, laid = 0; tries < LARGE_TENT_TRIES + SMALL_TENT_TRIES && laid < tents; tries++) {
    const size = tries < LARGE_TENT_TRIES ? 4 : 3;
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
  const keepW = clamp(innerW - 6, LEAST_ROOM + 2, 14);
  const keepH = clamp(Math.min(innerH - 3, Math.round(innerH * 0.45)), LEAST_ROOM + 2, 9);
  const keep = { x: x0 + 1 + Math.round((innerW - keepW) / 2), y: y0 + 2, w: keepW, h: keepH };
  if (plot.free(keep)) {
    houseWithRooms(plot, keep, between(3, 5, rng), 'stoneRoomWall', 's', rng);
  }
  const buildings = Math.max(1, Math.round(2 * fill));
  const below = keep.y + keep.h + 1;
  for (let i = 0; i < buildings; i++) {
    const west = i % 2 === 0;
    const narrow = clamp(Math.round(innerH * 0.3), 3, 5);
    const spots = [
      {
        rect: {
          x: west ? x0 + 1 : x1 - 5,
          y: below,
          w: 5,
          h: clamp(Math.round(innerH * 0.4), 5, y1 - 3 - below),
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

/** How deep a building of a town runs back from its street, at least and at most, in cells. */
const TOWN_DEPTH = { least: 5, most: 7 } as const;

/** How wide a lot along a street is cut, at least and at most, in cells. */
const TOWN_FRONTAGE = { least: 5, most: 8 } as const;

/** How many lots in a hundred a town leaves standing empty, as a yard, at a middling density. */
const TOWN_VACANCY = 12;

/** How many cells along a street are left between one lamp post and the next. */
const LAMP_SPACING = 8;

/** How many cells of the town wall are left between one banner and the next. */
const BANNER_SPACING = 6;

/** The buildings a town has one of where it has the room, in the order the best lots go to them. */
const TOWN_LANDMARKS: readonly TownBuildingKind[] = [
  'guardhouse',
  'church',
  'inn',
  'tavern',
  'smithy',
  'bakery',
  'shop',
];

/** The sign each kind of building hangs over its door, where it hangs one. */
const TOWN_SIGNS: Readonly<Partial<Record<TownBuildingKind, TownFixtureKind>>> = {
  inn: 'signInn',
  tavern: 'signTavern',
  smithy: 'signSmithy',
  bakery: 'signBakery',
  shop: 'signShop',
};

/**
 * How many rooms each kind of building is cut into, at least and at most, and how many cells of
 * floor it keeps to a room at least: a hall that seats a counter and its tables, a church its pews,
 * and an inn's or a tavern's room is no use cut small.
 */
const TOWN_ROOM_COUNTS: Readonly<
  Record<TownBuildingKind, { readonly rooms: readonly [number, number]; readonly floor: number }>
> = {
  church: { rooms: [1, 2], floor: 30 },
  inn: { rooms: [1, 2], floor: 20 },
  tavern: { rooms: [1, 2], floor: 20 },
  smithy: { rooms: [2, 2], floor: 12 },
  bakery: { rooms: [2, 2], floor: 12 },
  shop: { rooms: [2, 2], floor: 12 },
  guardhouse: { rooms: [3, 3], floor: 9 },
  house: { rooms: [2, 3], floor: 12 },
};

/**
 * The buildings whose door opens into a hall that wants a lot of room, and how many cells across a lot
 * for one is at least each way: an inn's and a tavern's room seats a counter, a church's nave rows of pews.
 */
const ROOMY_BUILDINGS: Readonly<Partial<Record<TownBuildingKind, { readonly short: number; readonly long: number }>>> =
  {
    church: { short: 7, long: 8 },
    inn: { short: 6, long: 7 },
    tavern: { short: 6, long: 7 },
  };

/** A lot cut from a block between streets, and the side of it a street runs along, if any does. */
interface TownLot {
  readonly rect: MapRect;
  readonly facing: Side;
  readonly onStreet: boolean;
}

/**
 * The town below a castle that stands off the board to the north: the castle's wall along the top of
 * the board, its gate in the middle between two towers with banners along the wall, a high street
 * from the gate to the bottom of the board crossed by a street from side to side, and where they
 * cross a market square round a fountain, with stalls, benches and lamp posts. Lanes run down the
 * board beside the high street on a wide one, and a back street across it below the cross street
 * where there is room for buildings on both sides of it. The blocks
 * between the streets are cut into lots, each with a building whose door opens on the street it
 * fronts, and every building has its rooms: the guards' house nearest the gate, a church on the
 * square, an inn and a tavern on the high street by it, a smithy, a bakery and a shop, and the
 * houses of the townsfolk, each room furnished afterwards as what it is: the room nearest the way in
 * is the one its door opens into, and the rest are its back rooms. A shop hangs its sign by
 * its door, and a lantern burns at every few doors.
 */
function layCastleTown(plot: Plot, rng: () => number, fill: number): void {
  const { width, height } = plot;
  const gateX = Math.floor(width / 2) - 1;
  const towers = [
    { x: gateX - 2, y: 0, w: 2, h: 3 },
    { x: gateX + 2, y: 0, w: 2, h: 3 },
  ];
  const inTower = (x: number, y: number) =>
    towers.some((tower) => x >= tower.x && x < tower.x + tower.w && y >= tower.y && y < tower.y + tower.h);
  let ring: MapPoint[] = Array.from({ length: width }, (_, x) => ({ x, y: 0 }));
  ring = hangGate(plot, ring, { x: gateX, y: 0 }, 'x', 'stoneWall');
  plot.take({ x: gateX, y: 0, w: 2, h: 1 });
  plot.wall(
    ring.filter(({ x, y }) => !inTower(x, y)),
    'stoneWall'
  );
  plot.wall(
    towers.flatMap((tower) =>
      Array.from({ length: tower.w * tower.h }, (_, at) => ({
        x: tower.x + (at % tower.w),
        y: tower.y + Math.floor(at / tower.w),
      }))
    ),
    'tower'
  );
  for (let x = 1; x < width - 1; x += BANNER_SPACING) {
    if (inTower(x, 0) || x === gateX || x === gateX + 1) continue;
    plot.stand({ kind: 'banner', rect: { x, y: 0, w: 1, h: 1 }, turn: TURN_TO_FACE.s });
  }
  plot.take({ x: 0, y: 1, w: width, h: 1 });
  plot.paint({ x: gateX, y: 1, w: 2, h: 2 }, SETTLEMENT_ZONES.road);
  plot.take({ x: gateX, y: 1, w: 2, h: 2 });

  const wide = width >= 28 ? 4 : 2;
  const high = { x: gateX + 1 - wide / 2, y: 3, w: wide, h: height - 3 };
  const crossY = Math.round(height * 0.55);
  const cross = { x: 0, y: crossY, w: width, h: height >= 22 ? 3 : 2 };
  const lanes: MapRect[] = [];
  if (width >= 32) {
    const inset = Math.round(width * 0.2);
    lanes.push({ x: inset - 1, y: 3, w: 2, h: height - 3 }, { x: width - inset - 1, y: 3, w: 2, h: height - 3 });
  }
  const below = height - (crossY + cross.h);
  if (below >= (TOWN_DEPTH.most + 1) * 2 + 2)
    lanes.push({ x: 0, y: crossY + cross.h + Math.floor((below - 2) / 2), w: width, h: 2 });
  const streets = [high, cross, ...lanes];
  for (const street of streets) {
    plot.paint(street, SETTLEMENT_ZONES.road);
    plot.take(street);
  }

  const square = {
    w: clamp(Math.round(width * 0.32), 8, 14),
    h: clamp(Math.round(height * 0.4), 7, 11),
  };
  const plaza = {
    x: gateX + 1 - Math.floor(square.w / 2),
    y: crossY + Math.floor(cross.h / 2) - Math.floor(square.h / 2),
    ...square,
  };
  plot.paint(plaza, SETTLEMENT_ZONES.yard);
  plot.take(plaza);

  const onStreet = (x: number, y: number) =>
    streets.some((street) => x >= street.x && x < street.x + street.w && y >= street.y && y < street.y + street.h) ||
    (x >= plaza.x && x < plaza.x + plaza.w && y >= plaza.y && y < plaza.y + plaza.h);
  const lots = townLots(plot, onStreet, rng);
  const kinds = townBuildingKinds(lots, { x: gateX + 1, y: 1 }, plaza, rng, fill);
  let lanterns = 0;
  lots.forEach((lot, index) => {
    const kind = kinds[index];
    if (!kind || !plot.free(lot.rect)) return;
    const wall = kind === 'church' || kind === 'guardhouse' ? 'stoneRoomWall' : 'timberWall';
    const { rooms, floor } = TOWN_ROOM_COUNTS[kind];
    const inside = (lot.rect.w - 2) * (lot.rect.h - 2);
    const count = Math.min(between(rooms[0], rooms[1], rng), Math.max(1, Math.floor(inside / floor)));
    const built = houseWithRooms(plot, lot.rect, count, wall, lot.facing, rng);
    const step = SIDE_STEPS[lot.facing];
    plot.keepClear(built.entrance.x + step.dx, built.entrance.y + step.dy);
    const front = { x: built.entrance.x - step.dx, y: built.entrance.y - step.dy };
    const names = TOWN_ROOM_KINDS[kind];
    const off = (room: MapRect) =>
      Math.max(room.x - front.x, 0, front.x - (room.x + room.w - 1)) +
      Math.max(room.y - front.y, 0, front.y - (room.y + room.h - 1));
    const nearest = built.rooms.reduce((best, room) => (off(room) < off(best) ? room : best));
    let back = 0;
    for (const room of built.rooms) {
      plot.rooms.push({ ...room, kind: room === nearest ? names.front : names.back[back++ % names.back.length] });
    }
    const along = lot.facing === 'n' || lot.facing === 's' ? { dx: 1, dy: 0 } : { dx: 0, dy: 1 };
    const sides = [-1, 1].map((sign) => ({
      x: built.entrance.x + along.dx * sign,
      y: built.entrance.y + along.dy * sign,
    }));
    const sign = TOWN_SIGNS[kind];
    if (sign && wall === 'timberWall') {
      const hung = sides.find(({ x, y }) => plot.wallOf(x, y, 'timberWall'));
      if (hung) plot.stand({ kind: sign, rect: { ...hung, w: 1, h: 1 }, turn: TURN_TO_FACE[lot.facing] });
    }
    if (lot.onStreet && lanterns++ % 2 === 0) {
      const lit = sides
        .map(({ x, y }) => ({ x: x + step.dx, y: y + step.dy }))
        .find(({ x, y }) => onStreet(x, y) && plot.canStand({ x, y, w: 1, h: 1 }));
      if (lit) plot.light({ ...lit, kind: 'lantern' });
    }
  });
  laySquare(plot, plaza, high, rng, fill);
  layStreetLamps(plot, high, cross, onStreet);
}

/**
 * The market square: a fountain in the middle, stalls along its top and bottom facing into it but
 * for where the high street runs through, a bench east and west of the fountain facing it, boxes of
 * flowers at its corners and lamp posts beside them.
 */
function laySquare(plot: Plot, plaza: MapRect, high: MapRect, rng: () => number, fill: number): void {
  const fountain = {
    x: plaza.x + Math.floor((plaza.w - 3) / 2),
    y: plaza.y + Math.floor((plaza.h - 3) / 2),
    w: 3,
    h: 3,
  };
  plot.stand({ kind: 'fountain', rect: fountain, turn: 0 });
  const stalls: TownFixtureKind[] = ['marketStallFruit', 'marketStallCloth', 'marketStallPottery'];
  const wanted = Math.max(1, Math.round(2 * fill));
  const clearOfHigh = (x: number) => x + 1 < high.x || x > high.x + high.w - 1;
  for (const [y, turn] of [
    [plaza.y, TURN_TO_FACE.s],
    [plaza.y + plaza.h - 1, TURN_TO_FACE.n],
  ] as const) {
    let laid = 0;
    for (let x = plaza.x + 1; x + 1 < plaza.x + plaza.w - 1 && laid < wanted; x += 3) {
      if (!clearOfHigh(x)) continue;
      const kind = stalls[Math.floor(rng() * stalls.length)];
      if (plot.stand({ kind, rect: { x, y, w: 2, h: 1 }, turn })) laid++;
    }
  }
  const middle = { x: fountain.x + 1, y: fountain.y + 1 };
  for (const way of ['e', 'w'] as const) {
    const step = SIDE_STEPS[way];
    const at = { x: middle.x + step.dx * 3, y: middle.y + step.dy * 3 };
    if (at.x >= plaza.x + 1 && at.x < plaza.x + plaza.w - 1) {
      plot.stand({ kind: 'bench', rect: { ...at, w: 1, h: 1 }, turn: TURN_TO_FACE[OPPOSITE_SIDE[way]] });
    }
  }
  for (const [x, y] of [
    [plaza.x, plaza.y + 1],
    [plaza.x + plaza.w - 1, plaza.y + 1],
    [plaza.x, plaza.y + plaza.h - 2],
    [plaza.x + plaza.w - 1, plaza.y + plaza.h - 2],
  ]) {
    plot.stand({ kind: 'planter', rect: { x, y, w: 1, h: 1 }, turn: x === plaza.x ? TURN_TO_FACE.e : TURN_TO_FACE.w });
  }
  for (const [x, y] of [
    [plaza.x, plaza.y],
    [plaza.x + plaza.w - 1, plaza.y],
    [plaza.x, plaza.y + plaza.h - 1],
    [plaza.x + plaza.w - 1, plaza.y + plaza.h - 1],
  ]) {
    plot.stand({ kind: 'lampPost', rect: { x, y, w: 1, h: 1 }, turn: 0 });
  }
}

/** Lamp posts along the edges of the high street and the cross street, every so many cells, out of the square. */
function layStreetLamps(plot: Plot, high: MapRect, cross: MapRect, onStreet: (x: number, y: number) => boolean): void {
  const lamp = (x: number, y: number) => {
    if (!plot.inside(x, y) || !onStreet(x, y) || plot.zones[y * plot.width + x] !== SETTLEMENT_ZONES.road) return;
    plot.stand({ kind: 'lampPost', rect: { x, y, w: 1, h: 1 }, turn: 0 });
  };
  for (let y = high.y + 2; y < high.y + high.h; y += LAMP_SPACING) {
    if (high.w > 2) lamp((y / LAMP_SPACING) % 2 < 1 ? high.x : high.x + high.w - 1, y);
  }
  for (let x = 2; x < cross.w; x += LAMP_SPACING) {
    if (cross.h > 2) lamp(x, (x / LAMP_SPACING) % 2 < 1 ? cross.y : cross.y + cross.h - 1);
  }
}

/**
 * The lots the blocks between a town's streets are cut into: each block, a run of free cells bounded
 * by streets and the board's edge, cut along its longer way into lots a frontage wide, and into as
 * many rows as it is deep enough for with an alley between each two, the first and the last against
 * its sides, so no row stands back to back against another; a lot keeps a cell clear of the next lot
 * along as an alley, and fronts a street or ground no lot takes (see {@link lotFacing}). A lot too
 * small for a building with a room in it is left out.
 */
function townLots(plot: Plot, onStreet: (x: number, y: number) => boolean, rng: () => number): TownLot[] {
  const rects: MapRect[] = [];
  for (const block of freeBlocks(plot)) {
    const across = block.w >= block.h;
    const length = across ? block.w : block.h;
    const depth = across ? block.h : block.w;
    if (depth < TOWN_DEPTH.least) continue;
    const rows = Math.max(1, Math.floor((depth + 1) / (TOWN_DEPTH.least + 1)));
    const deep = Math.min(TOWN_DEPTH.most, Math.floor((depth - (rows - 1)) / rows));
    for (let row = 0; row < rows; row++) {
      const offset = rows === 1 ? 0 : Math.round(((depth - deep) * row) / (rows - 1));
      for (let at = 0; at < length;) {
        const left = length - at;
        if (left < TOWN_FRONTAGE.least - 1) break;
        let wide = between(TOWN_FRONTAGE.least, TOWN_FRONTAGE.most, rng);
        if (left - wide < TOWN_FRONTAGE.least) wide = left;
        const span = Math.min(wide, left) - (at + wide < length ? 1 : 0);
        const rect = across
          ? { x: block.x + at, y: block.y + offset, w: span, h: deep }
          : { x: block.x + offset, y: block.y + at, w: deep, h: span };
        at += wide;
        if (rect.w < LEAST_ROOM + 2 || rect.h < LEAST_ROOM + 2) continue;
        rects.push(rect);
      }
    }
  }
  const lotted = new Uint8Array(plot.width * plot.height);
  for (const rect of rects) {
    for (let y = rect.y; y < rect.y + rect.h; y++)
      lotted.fill(1, y * plot.width + rect.x, y * plot.width + rect.x + rect.w);
  }
  return rects.flatMap((rect) => lotFacing(plot, rect, onStreet, lotted) ?? []);
}

/**
 * A lot, facing the side of it the most cells of street run along, or where none does, the side with
 * the most free ground on the board beside it that no lot takes, so that its door never opens off the
 * board nor onto another lot's wall. Null for a lot with no such side, which is left empty.
 */
function lotFacing(
  plot: Plot,
  rect: MapRect,
  onStreet: (x: number, y: number) => boolean,
  lotted: Uint8Array
): TownLot | null {
  const open = (x: number, y: number) =>
    plot.inside(x, y) && !plot.taken[y * plot.width + x] && !lotted[y * plot.width + x];
  const count = (cells: MapPoint[]) =>
    cells.filter(({ x, y }) => onStreet(x, y)).length * plot.width * plot.height +
    cells.filter(({ x, y }) => open(x, y)).length;
  const sides: { facing: Side; street: number }[] = [
    { facing: 's', street: count(Array.from({ length: rect.w }, (_, i) => ({ x: rect.x + i, y: rect.y + rect.h }))) },
    { facing: 'n', street: count(Array.from({ length: rect.w }, (_, i) => ({ x: rect.x + i, y: rect.y - 1 }))) },
    { facing: 'e', street: count(Array.from({ length: rect.h }, (_, i) => ({ x: rect.x + rect.w, y: rect.y + i }))) },
    { facing: 'w', street: count(Array.from({ length: rect.h }, (_, i) => ({ x: rect.x - 1, y: rect.y + i }))) },
  ];
  const best = sides.reduce((one, other) => (other.street > one.street ? other : one));
  if (best.street < 1) return null;
  return { rect, facing: best.facing, onStreet: best.street >= plot.width * plot.height };
}

/**
 * The blocks of free cells left on a board, each the largest rectangle grown from the first free cell
 * left, row by row: as wide as the free run it starts on, and as deep as every row of that run is free,
 * as a mask of cells is covered with rectangles (`mergeMaskToRects`).
 */
function freeBlocks(plot: Plot): MapRect[] {
  const free = plot.taken.map((taken) => (taken ? 0 : 1));
  return mergeMaskToRects(free, plot.width, plot.height, Infinity);
}

/**
 * What stands on each lot: the landmarks first, each on the lot that suits it best of those left on a
 * street, a church, an inn and a tavern only on a lot with room inside for a hall -
 * the guards' house nearest the gate, the church the largest lot on the square, the inn and the
 * tavern on large lots near the square, the smithy, the bakery and the shop on a street -
 * and houses on the rest, but for a lot in so many a density leaves empty. Empty where a lot stands bare.
 */
function townBuildingKinds(
  lots: readonly TownLot[],
  gate: MapPoint,
  plaza: MapRect,
  rng: () => number,
  fill: number
): (TownBuildingKind | null)[] {
  const kinds: (TownBuildingKind | null)[] = lots.map(() => null);
  const middle = (rect: MapRect) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  const far = (rect: MapRect, point: MapPoint) => {
    const at = middle(rect);
    return Math.abs(at.x - point.x) + Math.abs(at.y - point.y);
  };
  const square = middle(plaza);
  const roomy = (kind: TownBuildingKind, { rect }: TownLot) => {
    const least = ROOMY_BUILDINGS[kind];
    return !least || (Math.min(rect.w, rect.h) >= least.short && Math.max(rect.w, rect.h) >= least.long);
  };
  const best = (kind: TownBuildingKind, score: (lot: TownLot) => number) => {
    let chosen = -1;
    lots.forEach((lot, index) => {
      if (kinds[index] !== null || !lot.onStreet || !roomy(kind, lot)) return;
      if (chosen < 0 || score(lot) < score(lots[chosen])) chosen = index;
    });
    return chosen;
  };
  const scores: Readonly<Record<TownBuildingKind, (lot: TownLot) => number>> = {
    guardhouse: (lot) => far(lot.rect, gate),
    church: (lot) => far(lot.rect, square) - lot.rect.w * lot.rect.h * 0.5,
    inn: (lot) => far(lot.rect, square) - lot.rect.w * lot.rect.h * 0.3,
    tavern: (lot) => far(lot.rect, square) - lot.rect.w * lot.rect.h * 0.3,
    smithy: (lot) => -far(lot.rect, square),
    bakery: (lot) => far(lot.rect, square) * 0.5,
    shop: (lot) => far(lot.rect, square) * 0.7,
    house: () => 0,
  };
  for (const kind of TOWN_LANDMARKS) {
    const index = best(kind, scores[kind]);
    if (index >= 0) kinds[index] = kind;
  }
  const vacancy = clamp(TOWN_VACANCY * (2 - fill), 0, 60) / 100;
  lots.forEach((_, index) => {
    if (kinds[index] === null && rng() >= vacancy) kinds[index] = 'house';
  });
  return kinds;
}
