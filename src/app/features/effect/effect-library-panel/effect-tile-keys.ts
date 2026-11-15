/** Where a tile of the list is drawn: its left and top edges, in any one unit. */
export interface TileBox {
  readonly left: number;
  readonly top: number;
}

/** How far apart two tops may be for their tiles to count as standing in one row. */
const SAME_ROW = 1;

/** The keys that move from one tile of the list to another. */
const MOVING_KEYS: ReadonlySet<string> = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Whether a key moves from one tile of the list to another. */
export function movesBetweenTiles(key: string): boolean {
  return MOVING_KEYS.has(key);
}

/**
 * Which tile a key moves to from the one at an index, the tiles given in the order they are read.
 *
 * Left and right step to the tile before and after, through the ends of rows and from one family to
 * the next. Up and down go to the nearest row above or below, a family's row or another's, and in it
 * to the tile standing closest under or over this one. Home and End go to the first tile and the last.
 * Where there is nowhere to go, and for any other key, it is the tile it started from.
 */
export function tileAfterKey(boxes: readonly TileBox[], from: number, key: string): number {
  const here = boxes[from];
  if (!here) return from;
  switch (key) {
    case 'ArrowLeft':
      return Math.max(from - 1, 0);
    case 'ArrowRight':
      return Math.min(from + 1, boxes.length - 1);
    case 'Home':
      return 0;
    case 'End':
      return boxes.length - 1;
    case 'ArrowUp':
      return nearestInRow(boxes, from, -1);
    case 'ArrowDown':
      return nearestInRow(boxes, from, 1);
    default:
      return from;
  }
}

/** The tile closest across in the nearest row above (-1) or below (1) the one at an index, or that one where there is no such row. */
function nearestInRow(boxes: readonly TileBox[], from: number, direction: -1 | 1): number {
  const here = boxes[from];
  let found = from;
  let rowGap = Infinity;
  let across = Infinity;
  boxes.forEach((box, index) => {
    const gap = (box.top - here.top) * direction;
    if (gap <= SAME_ROW) return;
    const offset = Math.abs(box.left - here.left);
    if (gap < rowGap - SAME_ROW || (Math.abs(gap - rowGap) <= SAME_ROW && offset < across)) {
      found = index;
      rowGap = Math.min(gap, rowGap);
      across = offset;
    }
  });
  return found;
}

/** The keys that move up and down a column of rows: the index of families, or the items of the menu. */
const COLUMN_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End']);

/** Whether a key moves up or down a column of rows. */
export function movesAlongColumn(key: string): boolean {
  return COLUMN_KEYS.has(key);
}

/**
 * Which row of a column a key moves to from the one at an index: up and down step to the row before
 * and after and stop at the ends, Home and End go to the first row and the last. For any other key,
 * and from an index outside the column, it is the row it started from.
 */
export function rowAfterKey(count: number, from: number, key: string): number {
  if (from < 0 || from >= count) return from;
  switch (key) {
    case 'ArrowUp':
      return Math.max(from - 1, 0);
    case 'ArrowDown':
      return Math.min(from + 1, count - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return from;
  }
}
