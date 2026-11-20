/** One step across a board: how far along the columns, and how far down the rows. */
export type CellStep = readonly [number, number];

/** The four ways out of a square across its sides, clockwise from straight up. */
export const ORTHOGONAL_STEPS: readonly CellStep[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

const DIAGONAL_STEPS: readonly CellStep[] = [
  [1, -1],
  [1, 1],
  [-1, 1],
  [-1, -1],
];

/** All eight ways out of a square: its sides first, then its corners. */
export const SQUARE_STEPS_WITH_CORNERS: readonly CellStep[] = [...ORTHOGONAL_STEPS, ...DIAGONAL_STEPS];

/** A side of a square, by the way out of it: north, east, south or west. */
export type Side = 'n' | 'e' | 's' | 'w';

/** The step to the cell on each side of a square. */
export const SIDE_STEPS: Readonly<Record<Side, { readonly dx: number; readonly dy: number }>> = {
  n: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 },
  s: { dx: 0, dy: 1 },
  w: { dx: -1, dy: 0 },
};

/** The four sides of a square, clockwise from straight up. */
export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];

/** The side across from each. */
export const OPPOSITE_SIDE: Readonly<Record<Side, Side>> = { n: 's', s: 'n', e: 'w', w: 'e' };

/**
 * How far a piece made facing south is turned, clockwise as the board is looked down on, to face out
 * of each side of its cell. One with its back to a wall faces the side across from it.
 */
export const TURN_TO_FACE: Readonly<Record<Side, number>> = { s: 0, w: 90, n: 180, e: 270 };

/** A step across a side of a square, with the heading that is, in degrees clockwise from straight up. */
export type HeadedStep = readonly [number, number, number];

/** The four ways out of a square across its sides, each with its heading, clockwise from straight up. */
export const HEADED_ORTHOGONAL_STEPS: readonly HeadedStep[] = ORTHOGONAL_STEPS.map(
  ([dx, dy], side) => [dx, dy, side * 90] as const
);

const FLAT_TOP_EVEN_COLUMN_STEPS: readonly CellStep[] = [
  [0, -1],
  [1, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
  [-1, -1],
];

const FLAT_TOP_ODD_COLUMN_STEPS: readonly CellStep[] = [
  [0, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
];

const POINTY_TOP_EVEN_ROW_STEPS: readonly CellStep[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
];

const POINTY_TOP_ODD_ROW_STEPS: readonly CellStep[] = [
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function turnedBy(steps: readonly CellStep[], turns: number): readonly CellStep[] {
  return steps.map((_, side) => steps[(side + turns) % steps.length]);
}

// A flat-topped hex's first corner points straight along the row, so its first side faces two
// steps round from straight up; a pointy-topped hex's first side already faces up and to the right.
const FLAT_TOP_EVEN_COLUMN_SIDES = turnedBy(FLAT_TOP_EVEN_COLUMN_STEPS, 2);
const FLAT_TOP_ODD_COLUMN_SIDES = turnedBy(FLAT_TOP_ODD_COLUMN_STEPS, 2);

function isOdd(value: number): boolean {
  return Math.abs(value % 2) === 1;
}

/**
 * The six ways out of a hex, in the order a move has always tried them.
 *
 * Which six depends on whether the cell's column (flat-topped) or row (pointy-topped) is one of
 * the shifted ones, negative numbers included.
 */
export function hexStepsAt(isFlatTop: boolean, col: number, row: number): readonly CellStep[] {
  if (isFlatTop) return isOdd(col) ? FLAT_TOP_ODD_COLUMN_STEPS : FLAT_TOP_EVEN_COLUMN_STEPS;
  return isOdd(row) ? POINTY_TOP_ODD_ROW_STEPS : POINTY_TOP_EVEN_ROW_STEPS;
}

/**
 * The step across each side of a hex, side `i` running from corner `i` to corner `i + 1` as the
 * hex's corners are numbered for drawing.
 *
 * This is how an outline tells whether the cell on the far side of an edge is one of its own.
 */
export function hexSideStepsAt(isFlatTop: boolean, col: number, row: number): readonly CellStep[] {
  if (isFlatTop) return isOdd(col) ? FLAT_TOP_ODD_COLUMN_SIDES : FLAT_TOP_EVEN_COLUMN_SIDES;
  return isOdd(row) ? POINTY_TOP_ODD_ROW_STEPS : POINTY_TOP_EVEN_ROW_STEPS;
}
