import type { FreePlan } from '@axe/application/tabletop/free-move-plan.service';
import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { readMovingPoints } from '@axe/domain/tabletop/move/moving-points';

/** What the overlay draws of the move being worked out here, in table pixels. */
export interface OwnFreePath {
  /** The settled legs, as an SVG `points` list. */
  readonly settled: string;
  /** The leg drawn ahead of the pointer, or null where there is none. */
  readonly ahead: string | null;
  /** How far the move still reaches from the last corner, or null where it has ended. */
  readonly reach: { readonly cx: number; readonly cy: number; readonly r: number } | null;
}

/** What the overlay draws: the move worked out here, and the ways everybody else is drawing. */
export interface FreePathOverlayModel {
  readonly own: OwnFreePath | null;
  readonly others: readonly string[];
}

/** A way as an SVG `points` list. */
function svgPoints(points: readonly MovePoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

/**
 * Reads a way another peer sent, as `x,y` points joined by spaces, leaving out what cannot be read;
 * a way of fewer than two points is no way.
 */
export function parseMovingPoints(text: string): MovePoint[] {
  const points = readMovingPoints(text);
  return points.length > 1 ? points : [];
}

/** What to draw, from the move worked out here and the ways the other peers sent. */
export function freePathOverlayModelOf(plan: FreePlan | null, sent: readonly string[]): FreePathOverlayModel {
  const others = sent
    .map(parseMovingPoints)
    .filter((points) => points.length > 1)
    .map(svgPoints);
  if (!plan) return { own: null, others };
  const last = plan.settled[plan.settled.length - 1];
  const left = Math.max(0, plan.budgetPx - plan.spentPx);
  return {
    own: {
      settled: svgPoints(plan.settled),
      ahead: plan.ahead.length > 1 ? svgPoints(plan.ahead) : null,
      reach: !plan.ended && left > 0 ? { cx: last.x, cy: last.y, r: left } : null,
    },
    others,
  };
}
