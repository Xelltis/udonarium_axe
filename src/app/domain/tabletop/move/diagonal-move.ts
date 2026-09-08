/**
 * How a table counts a step taken across a corner.
 *
 * Every game that plays on squares answers this differently, and the answer changes what a
 * piece can reach, not merely what it looks like: a walk of five with corners at one apiece
 * covers a very different shape from the same five counted one, two, one, two.
 *
 * - `none` — corners are not steps at all. A piece walks along the sides only
 * - `equal` — a corner costs what a side costs
 * - `alternating` — the first corner of a walk costs one, the second two, and so on by turns
 * - `double` — every corner costs two
 *
 * A hex board has no corners to cut, so none of this reaches it.
 */
export const DIAGONAL_MOVES = ['none', 'equal', 'alternating', 'double'] as const;

export type DiagonalMove = (typeof DIAGONAL_MOVES)[number];

/** A corner costs what a side costs, which is what a table says unless it says otherwise. */
export const DEFAULT_DIAGONAL_MOVE: DiagonalMove = 'equal';

export function asDiagonalMove(value: unknown): DiagonalMove | null {
  return typeof value === 'string' && (DIAGONAL_MOVES as readonly string[]).includes(value)
    ? (value as DiagonalMove)
    : null;
}

/** Whether a piece may step across a corner at all. */
export function allowsDiagonal(move: DiagonalMove): boolean {
  return move !== 'none';
}

/**
 * Whether what a corner costs depends on how many have been cut already.
 *
 * Only the alternating rule looks back. It is what makes the price of a step depend on the way
 * taken to reach it, so a search for the cheapest way has to hold the count alongside the cell.
 */
export function countsDiagonals(move: DiagonalMove): boolean {
  return move === 'alternating';
}

/**
 * What the next corner costs, in steps, given how many have been cut on the way here.
 *
 * The answer multiplies what the ground costs rather than adding to it: a system that doubles
 * a corner doubles it over rough ground as well, which is how the rule reads wherever it is
 * written down.
 */
export function diagonalCost(move: DiagonalMove, cut: number): number {
  switch (move) {
    case 'none':
      return Number.POSITIVE_INFINITY;
    case 'double':
      return 2;
    case 'alternating':
      return cut % 2 === 0 ? 1 : 2;
    default:
      return 1;
  }
}
