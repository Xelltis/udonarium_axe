import { standsWet, type WaterCell } from '@axe/domain/tabletop/water/water-cells';
import { flowVectorOf } from '@axe/domain/tabletop/water/water-flow';

/** Water flowing under a block, which turns what dips into it, as the wheel of a watermill. */
export interface WaterCurrent {
  /** Which way it runs across the table, as a unit step: x to the right, y down. */
  readonly towardX: number;
  readonly towardY: number;
  /** How high its surface stands, in table pixels. */
  readonly surfacePx: number;
}

/** How long the flows of the cells summed have to come to, each as fast as it flows, to tell a way they run. */
const LEAST_RUN = 0.01;

/**
 * The water flowing in some cells as one current: the ways the cells flow summed, each as fast as
 * it flows, and the highest surface among them. Null where no water stands in them that flows, or
 * where the ways they flow cancel out.
 */
export function currentOf(cells: Iterable<WaterCell>): WaterCurrent | null {
  let x = 0;
  let y = 0;
  let surfacePx = Number.NEGATIVE_INFINITY;
  for (const cell of cells) {
    if (cell.flowSpeed <= 0 || !standsWet(cell)) continue;
    const step = flowVectorOf(cell.flowDirection);
    x += step.x * cell.flowSpeed;
    y += step.y * cell.flowSpeed;
    surfacePx = Math.max(surfacePx, cell.surfacePx);
  }
  const run = Math.hypot(x, y);
  if (run < LEAST_RUN) return null;
  return { towardX: x / run, towardY: y / run, surfacePx };
}
