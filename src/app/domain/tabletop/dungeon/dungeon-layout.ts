/**
 * How many cells across a passage is cut.
 *
 * One is what a dungeon drawn on paper usually has, and is what the maze was written for. Wider
 * than that is for a table that wants a party abreast in a passage, or a thing too big to walk
 * one cell at a time; four is as wide as a passage may be asked to be before it stops being one.
 */
export const MIN_CORRIDOR_WIDTH = 1;
export const MAX_CORRIDOR_WIDTH = 4;

export function clampCorridorWidth(width: number | undefined): number {
  if (width === undefined || !Number.isFinite(width)) return MIN_CORRIDOR_WIDTH;
  return Math.min(MAX_CORRIDOR_WIDTH, Math.max(MIN_CORRIDOR_WIDTH, Math.round(width)));
}

export const DungeonCell = {
  Rock: 0,
  Room: 1,
  Corridor: 2,
  Door: 3,
  Hazard: 4,
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
}

export interface DungeonDoor extends DungeonPoint {
  /** The rooms this opening serves. A gap between two rooms belongs to both. */
  rooms: number[];
  locked: boolean;
}

export interface DungeonLayout {
  width: number;
  height: number;
  cells: Uint8Array;
  rooms: DungeonRoom[];
  doors: DungeonDoor[];
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
  seed: number;
}

export function inBounds(layout: Pick<DungeonLayout, 'width' | 'height'>, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < layout.width && y < layout.height;
}

export function cellAt(layout: DungeonLayout, x: number, y: number): DungeonCellValue {
  if (!inBounds(layout, x, y)) return DungeonCell.Rock;
  return layout.cells[y * layout.width + x] as DungeonCellValue;
}

export function setCell(layout: DungeonLayout, x: number, y: number, value: DungeonCellValue): void {
  if (!inBounds(layout, x, y)) return;
  layout.cells[y * layout.width + x] = value;
}

export function isOpenCell(value: DungeonCellValue): boolean {
  return value !== DungeonCell.Rock;
}

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
