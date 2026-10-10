/** How far up or down a piece can be sent, which is as far as the altitude slider reaches. */
export const ALTITUDE_LIMIT_CELLS = 12;

/** One turn of the wheel, in cells. */
export const ALTITUDE_STEP_CELLS = 1;

const NEARLY = 1e-6;

/**
 * The height one turn of the wheel puts a piece at.
 *
 * A piece already standing between two steps is taken to the step the wheel is heading for
 * rather than a step and a bit on from where it was, so a height set by hand comes back onto
 * whole cells at the first turn instead of carrying its remainder up the whole climb.
 */
export function steppedAltitude(current: number, isUp: boolean, step: number = ALTITUDE_STEP_CELLS): number {
  const size = step > 0 ? step : ALTITUDE_STEP_CELLS;
  const rungs = current / size;
  const next = isUp ? Math.floor(rungs + NEARLY) + 1 : Math.ceil(rungs - NEARLY) - 1;
  const wanted = Math.round(next * size * 1000) / 1000;
  return Math.min(ALTITUDE_LIMIT_CELLS, Math.max(-ALTITUDE_LIMIT_CELLS, wanted));
}

/** The heights the rungs of the guide are drawn at, from the ground up to where the piece is. */
export function altitudeRungs(altitude: number, step: number = ALTITUDE_STEP_CELLS): number[] {
  const size = step > 0 ? step : ALTITUDE_STEP_CELLS;
  const reach = Math.abs(altitude);
  const rungs: number[] = [];
  for (let at = size; at <= reach + NEARLY; at += size) {
    rungs.push(Math.round(at * 1000) / 1000);
  }
  return rungs;
}
