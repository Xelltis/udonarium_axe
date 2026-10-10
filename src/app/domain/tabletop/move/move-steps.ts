/**
 * How finely a move is counted.
 *
 * A reach used to be counted in whole cells, because every cell cost at least one: ground could
 * be dearer to cross but never cheaper. A road is cheaper, so the counting has to be finer than
 * the thing being counted, and the whole of the move layer counts in halves.
 *
 * Only the reckoning is in halves. What a sheet says, what a room sets and what a reader is
 * shown are all in cells, and cross this line through {@link stepsFor} and {@link cellsFrom}.
 */
export const STEPS_PER_CELL = 2;

/** What a distance in cells comes to in steps, rounded to the nearest step. */
export function stepsFor(cells: number): number {
  return Math.round(cells * STEPS_PER_CELL);
}

/** What a count of steps comes to in cells, which is not always a whole number. */
export function cellsFrom(steps: number): number {
  return steps / STEPS_PER_CELL;
}
