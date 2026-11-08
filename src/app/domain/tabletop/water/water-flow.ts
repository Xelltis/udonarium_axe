/** The eight ways water can be set to flow, in degrees clockwise from the top of the table. */
export const FLOW_DIRECTIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/** How many cells a second flowing water carries what floats on it at the top of the scale. */
const FASTEST_CELLS_PER_SECOND = 2.2;
/** How many cells a second the slowest flow that moves at all carries it. */
const SLOWEST_CELLS_PER_SECOND = 0.25;

/** Which way water flows across the table, as a unit step in table pixels: x to the right, y down. */
export function flowVectorOf(directionDeg: number): { x: number; y: number } {
  const turn = (directionDeg * Math.PI) / 180;
  return { x: round(Math.sin(turn)), y: round(-Math.cos(turn)) };
}

/**
 * Water flowing past the eye as the eye sees it, in cells a second: how fast it runs across the
 * view to the right, and how fast it comes at the eye (running away from it where negative).
 */
export interface SeenCurrent {
  readonly across: number;
  readonly toward: number;
}

/**
 * Water flowing past the eye as the eye sees it, given which way the eye looks along the ground
 * (`hx`, `hy`) and its right (`rx`, `ry`), as unit steps in table pixels; or null for still water.
 */
export function currentSeenFrom(
  eye: { readonly hx: number; readonly hy: number; readonly rx: number; readonly ry: number },
  directionDeg: number,
  cellsPerSecond: number
): SeenCurrent | null {
  if (!(cellsPerSecond > 0)) return null;
  const turn = (directionDeg * Math.PI) / 180;
  const x = Math.sin(turn);
  const y = -Math.cos(turn);
  return {
    across: round((x * eye.rx + y * eye.ry) * cellsPerSecond),
    toward: round(-(x * eye.hx + y * eye.hy) * cellsPerSecond),
  };
}

/** How many cells a second water flowing this fast carries what floats on it; nothing for still water. */
export function flowCellsPerSecond(speed: number): number {
  if (!(speed > 0)) return 0;
  return SLOWEST_CELLS_PER_SECOND + (FASTEST_CELLS_PER_SECOND - SLOWEST_CELLS_PER_SECOND) * Math.min(speed, 1);
}

function round(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return rounded === 0 ? 0 : rounded;
}
