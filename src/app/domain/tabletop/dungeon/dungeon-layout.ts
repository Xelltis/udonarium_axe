import { clamp } from '@axe/core/util/clamp';
import type { GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { TrapKind } from '@axe/domain/tabletop/trap-presets';

/**
 * How many cells across a passage is cut.
 *
 * One is what a dungeon drawn on paper usually has, and is what the maze was written for. Wider
 * than that is for a table that wants a party abreast in a passage, or a thing too big to walk
 * one cell at a time; four is as wide as a passage may be asked to be before it stops being one.
 */
export const MIN_CORRIDOR_WIDTH = 1;
export const MAX_CORRIDOR_WIDTH = 4;

/** A passage width rounded to whole cells and kept between one and four; missing or not a number gives one. */
export function clampCorridorWidth(width: number | undefined): number {
  if (width === undefined || !Number.isFinite(width)) return MIN_CORRIDOR_WIDTH;
  return clamp(Math.round(width), MIN_CORRIDOR_WIDTH, MAX_CORRIDOR_WIDTH);
}

export const DungeonCell = {
  Rock: 0,
  Room: 1,
  Corridor: 2,
  Door: 3,
  Hazard: 4,
  /** Floor under water: a channel down the middle of a passage, or a basin in a room. */
  Water: 5,
} as const;

export type DungeonCellValue = (typeof DungeonCell)[keyof typeof DungeonCell];

export const DungeonRoomRole = {
  Entrance: 'entrance',
  Hall: 'hall',
  Treasure: 'treasure',
  Boss: 'boss',
  DeadEnd: 'deadEnd',
  Chamber: 'chamber',
} as const;

export type DungeonRoomRoleValue = (typeof DungeonRoomRole)[keyof typeof DungeonRoomRole];

export const DUNGEON_ROOM_ROLES: readonly DungeonRoomRoleValue[] = [
  DungeonRoomRole.Entrance,
  DungeonRoomRole.Hall,
  DungeonRoomRole.Treasure,
  DungeonRoomRole.Boss,
  DungeonRoomRole.DeadEnd,
  DungeonRoomRole.Chamber,
];

export interface DungeonRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DungeonPoint {
  x: number;
  y: number;
}

export interface DungeonRoom extends DungeonRect {
  index: number;
  role: DungeonRoomRoleValue;
  /**
   * What the room is, of the kinds of room a place keeps for the part it plays: a workshop, an
   * observatory or a bedroom among a tower's small rooms. Left out where the place keeps one kind.
   */
  set?: string;
}

export interface DungeonDoor extends DungeonPoint {
  /** The rooms this opening serves. A gap between two rooms belongs to both. */
  rooms: number[];
  locked: boolean;
}

/**
 * One slab of a door, which is a piece of terrain standing in an opening.
 *
 * A doorway is filled by a single leaf, or by two that part in the middle; an opening wider
 * than a door is hung takes several doors side by side. Every cell a leaf covers is a door
 * cell of the opening it fills.
 */
export interface DungeonDoorLeaf extends DungeonRect {
  /** The axis it bars. A leaf thin along x stands across an east-west passage. */
  across: 'x' | 'y';
  rooms: number[];
  locked: boolean;
  /** Whether it is hung the other way round, which is what makes two leaves a pair. */
  mirrored: boolean;
  /** Whether it is dressed as the wall it stands in, so that nobody who does not know it is there sees a door. */
  hidden?: boolean;
}

export const FURNISHING_IDS = [
  'counter',
  'stool',
  'table',
  'pillar',
  'desk',
  'crate',
  'rubble',
  'shopCounter',
  'gamingTable',
  'containerRed',
  'containerBlue',
  'containerGreen',
  'barrel',
  'pipe',
  'pipeValve',
  'pipeElbow',
  'pipeEnd',
  'neonCocktail',
  'neonDice',
  'neonHeart',
  'backBar',
  'boothSofa',
  'lowTable',
  'jukebox',
  'slotMachine',
  'arcadeCabinet',
  'rouletteTable',
  'vendingMachine',
  'goodsShelf',
  'safe',
  'executiveDesk',
  'still',
  'speaker',
  'aquarium',
  'plant',
  'bookshelf',
  'lectern',
  'bookPile',
  'alchemyTable',
  'cauldron',
  'potionShelf',
  'magicCircle',
  'crystalPedestal',
  'orrery',
  'telescope',
  'canopyBed',
  'wardrobe',
  'treasureChest',
  'candelabra',
  'gargoyle',
  'writingDesk',
  'storageJars',
  'bed',
  'tableWood',
  'chairWood',
  'cupboard',
  'fireplace',
  'anvil',
  'forge',
  'weaponRack',
  'breadOven',
  'flourSacks',
  'pew',
  'altar',
  'bunkBed',
  'chestWood',
  'shelfGoods',
  'barCounter',
  'tavernCounter',
] as const;

export type FurnishingId = (typeof FURNISHING_IDS)[number];

/**
 * What water a cell holds: none, the channel of a passage, the basin of a room, or the outfall of a
 * channel, its last cells before it drains, cut as deep as a basin for the channel to fall into.
 */
export const WaterwayKind = {
  Dry: 0,
  Channel: 1,
  Basin: 2,
  Outfall: 3,
} as const;

export type WaterwayKindValue = (typeof WaterwayKind)[keyof typeof WaterwayKind];

/**
 * The water run through a place, cell by cell.
 *
 * Every cell that holds any is a water cell of the board; this says which water it is and which
 * way it runs, which is what the table is given as the water's areas.
 */
export interface DungeonWaterway {
  /** What water each cell holds, as one of {@link WaterwayKind}. */
  kinds: Uint8Array;
  /** Which way the water of each cell runs, in degrees clockwise from the top of the board, or -1 where it lies still or there is none. */
  flow: Int16Array;
}

/**
 * Where a pipe comes out of a wall over the water of a basin: the cell against the wall, which the
 * basin's water is let into under it, and which way it faces, measured away from the wall as a light
 * on a wall is.
 */
export interface DungeonSpout extends DungeonPoint {
  facing: number;
}

/** A piece of furniture standing in a room, and the cells it takes. */
export interface DungeonFurnishing extends DungeonRect {
  piece: FurnishingId;
  /**
   * On a board of hexes, the cell a piece of several cells stands its middle on: for one with its back
   * to a wall, the cell out from the wall, so it reaches no further into the wall than its cells do.
   * Left out, the cell nearest its middle.
   */
  standsOn?: DungeonPoint;
  /** How far it is turned off square, in degrees. */
  spin: number;
  /**
   * Which way it faces, for a piece that stands with its back to a wall or lies one way in the middle
   * of a room: how far its model, made facing south, is turned clockwise. Left out, as made.
   */
  facing?: number;
  /** What is stacked on top of it, from the bottom up. */
  stack?: FurnishingId[];
}

/** A trap set on one cell of the board, and what kind of trap it is. */
export interface DungeonTrap extends DungeonPoint {
  kind: TrapKind;
}

export interface DungeonLayout {
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
  /** The doors hung in those openings, which is what the table is given rather than the cells. */
  doorLeaves: DungeonDoorLeaf[];
  /** Which rooms a corridor joins, as index pairs. The spanning tree first, then the extra loops. */
  links: [number, number][];
  entrance: DungeonPoint;
  exit: DungeonPoint;
  /**
   * The break in the outer wall, when the dungeon opens onto the world outside.
   *
   * A stairway suits a floor with more above it; a tunnel mouth suits the first one, or a
   * cave in a hillside. Null when the way in is a stair inside the dungeon.
   */
  mouth: DungeonPoint | null;
  /** Where the key to the locked door lies, or -1 when nothing is locked. */
  keyRoomIndex: number;
  /** What stands in the rooms, where the place is furnished at all. */
  furnishings?: DungeonFurnishing[];
  /** What is set on the floor to catch whoever walks on it, where the place is trapped at all. */
  traps?: DungeonTrap[];
  /** The water run through it, where any is. */
  waterway?: DungeonWaterway;
  /** The pipes that pour into its basins, where it has any. */
  spouts?: DungeonSpout[];
  /** How high its ground stands over the board, where the water run through it digs into it. */
  relief?: GroundRaster | null;
  /**
   * For a round place, as a tower is, the cells outside it, each as 1: no part of the place at all,
   * so nothing is built or painted on them. Left out, the place fills the board.
   */
  outside?: Uint8Array;
  seed: number;
}

/** Whether a cell position lies on the board. */
export function inBounds(layout: Pick<DungeonLayout, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < layout.width && y < layout.height;
}

/** What a cell of the board is; anywhere off the board reads as rock. */
export function cellAt(layout: DungeonLayout, x: number, y: number): DungeonCellValue {
  if (!inBounds(layout, x, y)) return DungeonCell.Rock;
  return layout.cells[y * layout.width + x] as DungeonCellValue;
}

/** Sets what a cell of the board is; a position off the board is ignored. */
export function setCell(layout: DungeonLayout, x: number, y: number, value: DungeonCellValue): void {
  if (!inBounds(layout, x, y)) return;
  layout.cells[y * layout.width + x] = value;
}

/** Whether a kind of cell is open ground (room, corridor, door, hazard or water) rather than rock. */
export function isOpenCell(value: DungeonCellValue): boolean {
  return value !== DungeonCell.Rock;
}

/** Whether the cell at a position is open ground; off the board it is not. */
export function isWalkable(layout: DungeonLayout, x: number, y: number): boolean {
  return isOpenCell(cellAt(layout, x, y));
}

/** A flag per cell for the kinds asked for, which is what the rectangle merge consumes. */
export function maskOfKind(layout: DungeonLayout, kinds: readonly DungeonCellValue[]): Uint8Array {
  const wanted = new Set<number>(kinds);
  const mask = new Uint8Array(layout.width * layout.height);
  for (let index = 0; index < mask.length; index++) {
    mask[index] = wanted.has(layout.cells[index]) ? 1 : 0;
  }
  return mask;
}

/**
 * The middle cell of a room's bounding box, rounded towards the top left.
 *
 * A room carved to a shape may not include this cell; {@link firstCellOf} finds one that is.
 */
export function roomCenter(room: DungeonRect): DungeonPoint {
  return { x: room.x + Math.floor(room.w / 2), y: room.y + Math.floor(room.h / 2) };
}

/** Every cell that is not rock, reached from the given start by walking the four directions. */
export function reachableCells(layout: DungeonLayout, start: DungeonPoint): Set<number> {
  const seen = new Set<number>();
  if (!isWalkable(layout, start.x, start.y)) return seen;
  const queue: number[] = [start.y * layout.width + start.x];
  seen.add(queue[0]);
  while (queue.length > 0) {
    const index = queue.pop()!;
    const x = index % layout.width;
    const y = Math.floor(index / layout.width);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!isWalkable(layout, nx, ny)) continue;
      const next = ny * layout.width + nx;
      if (seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

/** How many cells of the board are anything other than rock. */
export function countOpenCells(layout: DungeonLayout): number {
  let total = 0;
  for (const cell of layout.cells) if (cell !== DungeonCell.Rock) total++;
  return total;
}

/** Every cell of the board that really is this room, the shape of one not always being its box. */
export function roomCells(layout: DungeonLayout, room: DungeonRoom): number[] {
  const cells: number[] = [];
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      const x = room.x + dx;
      const y = room.y + dy;
      if (cellAt(layout, x, y) === DungeonCell.Room) cells.push(y * layout.width + x);
    }
  }
  return cells;
}

/**
 * A cell of the room to stand something on: its middle, or the nearest of its own cells.
 *
 * The middle of a room is not always part of it - a room carved to a shape can be hollow
 * there - so the nearest cell that really is the room stands in for it.
 */
export function firstCellOf(layout: DungeonLayout, index: number): { x: number; y: number } {
  const room = layout.rooms[index];
  if (!room) return { x: 1, y: 1 };
  const cx = room.x + Math.floor(room.w / 2);
  const cy = room.y + Math.floor(room.h / 2);
  if (cellAt(layout, cx, cy) === DungeonCell.Room) return { x: cx, y: cy };

  let best = { x: cx, y: cy };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const cell of roomCells(layout, room)) {
    const x = cell % layout.width;
    const y = Math.floor(cell / layout.width);
    const distance = (x - cx) ** 2 + (y - cy) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { x, y };
    }
  }
  return best;
}
