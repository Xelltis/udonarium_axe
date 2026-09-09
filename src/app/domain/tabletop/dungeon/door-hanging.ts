import {
  cellAt,
  DungeonCell,
  DungeonDoorLeaf,
  DungeonLayout,
  DungeonPoint,
  DungeonRect,
  inBounds,
  isOpenCell,
  roomCells,
  setCell,
} from '@axe/domain/tabletop/dungeon/dungeon-layout';

/**
 * How many cells across a door is hung.
 *
 * One is the door of a dungeon drawn on paper, and fits the passage such a dungeon is cut.
 * Wider is for the gate of a hall or a temple, which a party walks through abreast; four is
 * as wide as a thing may be hung before it stops being a door.
 */
export const MIN_DOOR_WIDTH = 1;
export const MAX_DOOR_WIDTH = 4;

export const MIN_DOUBLE_DOOR_PERCENT = 0;
export const MAX_DOUBLE_DOOR_PERCENT = 100;
/** Half of what can be hung as a pair is, which tells only once a door is wide enough to halve. */
export const DEFAULT_DOUBLE_DOOR_PERCENT = 50;

/** How wide a door is hung, at its narrowest and at its widest. */
export interface DoorWidths {
  least: number;
  most: number;
}

export interface DoorHanging {
  widths?: DoorWidths;
  /** How many doors in a hundred are hung as a pair that parts in the middle. */
  doublePercent?: number;
}

export function clampDoorWidth(width: number | undefined): number {
  if (width === undefined || !Number.isFinite(width)) return MIN_DOOR_WIDTH;
  return Math.min(MAX_DOOR_WIDTH, Math.max(MIN_DOOR_WIDTH, Math.round(width)));
}

/** The widths a door is hung between, held in order and within what a door may be. */
export function doorWidthsFor(asked?: DoorWidths): DoorWidths {
  const most = clampDoorWidth(asked?.most ?? MIN_DOOR_WIDTH);
  const least = Math.min(most, clampDoorWidth(asked?.least ?? MIN_DOOR_WIDTH));
  return { least, most };
}

export function clampDoubleDoorPercent(percent: number | undefined): number {
  if (percent === undefined || !Number.isFinite(percent)) return DEFAULT_DOUBLE_DOOR_PERCENT;
  return Math.min(MAX_DOUBLE_DOOR_PERCENT, Math.max(MIN_DOUBLE_DOOR_PERCENT, Math.round(percent)));
}

/** Which way the passage runs where a door stands, so the slab can be set across it. */
export function doorAxis(layout: DungeonLayout, x: number, y: number): 'x' | 'y' {
  const open = (cx: number, cy: number) => cellAt(layout, cx, cy) !== DungeonCell.Rock;
  const eastWest = open(x + 1, y) && open(x - 1, y);
  const northSouth = open(x, y + 1) && open(x, y - 1);
  if (eastWest && !northSouth) return 'x';
  if (northSouth && !eastWest) return 'y';
  // A corner or a wide opening: bar the way the neighbouring stone leaves free.
  return open(x + 1, y) || open(x - 1, y) ? 'x' : 'y';
}

const NEIGHBOURS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** One opening in the stone: the run of door cells that fills it, taken as a whole. */
interface Doorway {
  cells: DungeonPoint[];
  across: 'x' | 'y';
  rooms: number[];
  locked: boolean;
}

/**
 * Widens each opening to the door it is given, and works out the leaves that fill it.
 *
 * A door wider than the passage it bars needs the stone beside the opening cut away, and a
 * threshold cut in front of it where the way beyond is narrower still. Nothing is ever
 * narrowed, and nothing is cut into a room whose door a key opens, since a way in that opens
 * to a shove makes the key an ornament.
 */
export function hangDoors(layout: DungeonLayout, hanging: DoorHanging, rng: () => number): void {
  const widths = doorWidthsFor(hanging.widths);
  const doublePercent = clampDoubleDoorPercent(hanging.doublePercent);
  const sealed = sealedCells(layout);

  layout.doorLeaves = [];
  for (const doorway of doorwaysOf(layout)) {
    const pair = rng() * 100 < doublePercent;
    const width = rollWidth(widths, pair, rng);
    widen(layout, doorway, width, sealed);
    layout.doorLeaves.push(...leavesOf(doorway, width, pair));
  }
}

function stepOf(across: 'x' | 'y'): DungeonPoint {
  return across === 'x' ? { x: 0, y: 1 } : { x: 1, y: 0 };
}

function doorwaysOf(layout: DungeonLayout): Doorway[] {
  const inOrder = [...layout.doors].sort(
    (left, right) => left.y * layout.width + left.x - (right.y * layout.width + right.x)
  );
  const doorAt = new Map(inOrder.map((door) => [door.y * layout.width + door.x, door]));
  const taken = new Set<number>();
  const doorways: Doorway[] = [];

  for (const door of inOrder) {
    const first = door.y * layout.width + door.x;
    if (taken.has(first)) continue;
    taken.add(first);

    const across = doorAxis(layout, door.x, door.y);
    const step = stepOf(across);
    const cells: DungeonPoint[] = [{ x: door.x, y: door.y }];
    const rooms = new Set(door.rooms);
    let locked = door.locked;

    for (let x = door.x + step.x, y = door.y + step.y; inBounds(layout, x, y); x += step.x, y += step.y) {
      const beside = doorAt.get(y * layout.width + x);
      if (!beside || taken.has(y * layout.width + x) || doorAxis(layout, x, y) !== across) break;
      taken.add(y * layout.width + x);
      cells.push({ x, y });
      for (const room of beside.rooms) rooms.add(room);
      locked = locked || beside.locked;
    }

    doorways.push({ cells, across, rooms: [...rooms].sort((left, right) => left - right), locked });
  }

  return doorways;
}

/** Every cell of every room a key opens, which is ground nothing may be cut through to. */
function sealedCells(layout: DungeonLayout): Set<number> {
  const shut = new Set<number>();
  for (const door of layout.doors) {
    if (!door.locked) continue;
    for (const index of door.rooms) {
      const room = layout.rooms[index];
      if (room) for (const cell of roomCells(layout, room)) shut.add(cell);
    }
  }
  return shut;
}

function rollWidth(widths: DoorWidths, pair: boolean, rng: () => number): number {
  const spread: number[] = [];
  for (let width = widths.least; width <= widths.most; width++) spread.push(width);
  const halves = spread.filter((width) => width % 2 === 0);
  const pool = pair && halves.length > 0 ? halves : spread;
  return pool[Math.floor(rng() * pool.length)] ?? widths.least;
}

function widen(layout: DungeonLayout, doorway: Doorway, width: number, sealed: ReadonlySet<number>): void {
  const step = stepOf(doorway.across);
  let ahead = true;
  while (doorway.cells.length < width) {
    if (!extend(layout, doorway, step, ahead, sealed) && !extend(layout, doorway, step, !ahead, sealed)) return;
    ahead = !ahead;
  }
}

function extend(
  layout: DungeonLayout,
  doorway: Doorway,
  step: DungeonPoint,
  ahead: boolean,
  sealed: ReadonlySet<number>
): boolean {
  const from = ahead ? doorway.cells[doorway.cells.length - 1] : doorway.cells[0];
  const cell = { x: from.x + (ahead ? step.x : -step.x), y: from.y + (ahead ? step.y : -step.y) };
  const cut = hangable(layout, cell, doorway, sealed);
  if (!cut) return false;

  if (cut.threshold) setCell(layout, cut.threshold.x, cut.threshold.y, DungeonCell.Corridor);
  setCell(layout, cell.x, cell.y, DungeonCell.Door);
  layout.doors.push({ x: cell.x, y: cell.y, rooms: [...doorway.rooms], locked: doorway.locked });
  if (ahead) doorway.cells.push(cell);
  else doorway.cells.unshift(cell);
  return true;
}

/**
 * Whether one more cell of this opening can be cut, and what has to be cut in front of it.
 *
 * A door stands between two open cells. Where the way beyond the stone is narrower than the
 * door, the cell it would open onto is cut as well and becomes the threshold.
 */
function hangable(
  layout: DungeonLayout,
  cell: DungeonPoint,
  doorway: Doorway,
  sealed: ReadonlySet<number>
): { threshold: DungeonPoint | null } | null {
  if (!within(layout, cell)) return null;
  const value = cellAt(layout, cell.x, cell.y);
  if (value !== DungeonCell.Rock && value !== DungeonCell.Corridor) return null;
  if (!doorway.locked && touchesSealed(layout, cell, sealed)) return null;

  const sides =
    doorway.across === 'x'
      ? [
          { x: cell.x - 1, y: cell.y },
          { x: cell.x + 1, y: cell.y },
        ]
      : [
          { x: cell.x, y: cell.y - 1 },
          { x: cell.x, y: cell.y + 1 },
        ];
  const open = sides.map((side) => isOpenCell(cellAt(layout, side.x, side.y)));
  if (open[0] && open[1]) return { threshold: null };
  if (value === DungeonCell.Corridor || (!open[0] && !open[1])) return null;

  const threshold = open[0] ? sides[1] : sides[0];
  if (!within(layout, threshold)) return null;
  if (cellAt(layout, threshold.x, threshold.y) !== DungeonCell.Rock) return null;
  if (touchesSealed(layout, threshold, sealed)) return null;
  return { threshold };
}

/** Inside the board and off its outer wall, which is the one wall a dungeon keeps. */
function within(layout: DungeonLayout, cell: DungeonPoint): boolean {
  return cell.x > 0 && cell.y > 0 && cell.x < layout.width - 1 && cell.y < layout.height - 1;
}

function touchesSealed(layout: DungeonLayout, cell: DungeonPoint, sealed: ReadonlySet<number>): boolean {
  return NEIGHBOURS.some(([dx, dy]) => {
    const x = cell.x + dx;
    const y = cell.y + dy;
    return inBounds(layout, x, y) && sealed.has(y * layout.width + x);
  });
}

/**
 * The doors that fill an opening: one for every door's width of it, halved where it is a pair.
 *
 * An opening no wider than the door takes the one door. A wider one - the wall of a room a
 * passage runs along, shut cell by cell - takes a row of them, each turned against the last.
 */
function leavesOf(doorway: Doorway, width: number, pair: boolean): DungeonDoorLeaf[] {
  const leaves: DungeonDoorLeaf[] = [];
  let hung = 0;
  for (let start = 0; start < doorway.cells.length; start += width, hung++) {
    const span = Math.min(width, doorway.cells.length - start);
    if (pair && span % 2 === 0) {
      leaves.push(leafOf(doorway, start, span / 2, false), leafOf(doorway, start + span / 2, span / 2, true));
      continue;
    }
    leaves.push(leafOf(doorway, start, span, hung > 0));
  }
  return leaves;
}

function leafOf(doorway: Doorway, start: number, span: number, mirrored: boolean): DungeonDoorLeaf {
  const from = doorway.cells[start];
  const rect: DungeonRect =
    doorway.across === 'x' ? { x: from.x, y: from.y, w: 1, h: span } : { x: from.x, y: from.y, w: span, h: 1 };
  return { ...rect, across: doorway.across, rooms: [...doorway.rooms], locked: doorway.locked, mirrored };
}
