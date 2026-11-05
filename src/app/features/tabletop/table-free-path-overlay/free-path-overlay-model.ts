import type { FreePlan } from '@axe/application/tabletop/free-move-plan.service';
import type { MovePoint } from '@axe/domain/tabletop/move/blocked-path';
import { readMovingPoints } from '@axe/domain/tabletop/move/moving-points';
import type { FloorMark } from '@axe/ui/tabletop/floor-marks';

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

/** The colours the ways are drawn in: everybody else's, how far the move still reaches, its settled legs and the leg ahead. */
const OTHERS_COLOUR = '#38bdf8';
const REACH_COLOUR = '#38bdf8';
const SETTLED_COLOUR = '#0ea5e9';
const AHEAD_COLOUR = '#7dd3fc';

/**
 * The marks the ways are drawn with on the floor: everybody else's dashed and thin, and of the move
 * worked out here, how far it still reaches as a faint disc, the settled legs, and the leg ahead of
 * the pointer dashed.
 */
export function freePathFloorMarksOf(model: FreePathOverlayModel): FloorMark[] {
  const marks: FloorMark[] = model.others.map((way) => ({
    kind: 'line',
    points: readMovingPoints(way),
    stroke: { colour: OTHERS_COLOUR, widthPx: 2, dash: [8, 6], round: true },
  }));
  const own = model.own;
  if (!own) return marks;
  if (own.reach) {
    marks.push({
      kind: 'circle',
      x: own.reach.cx,
      y: own.reach.cy,
      r: own.reach.r,
      fill: { colour: REACH_COLOUR, opacity: 0.08 },
      stroke: { colour: REACH_COLOUR, widthPx: 2, opacity: 0.5 },
    });
  }
  marks.push({
    kind: 'line',
    points: readMovingPoints(own.settled),
    stroke: { colour: SETTLED_COLOUR, widthPx: 4, round: true },
  });
  if (own.ahead) {
    marks.push({
      kind: 'line',
      points: readMovingPoints(own.ahead),
      stroke: { colour: AHEAD_COLOUR, widthPx: 4, dash: [10, 6], round: true },
    });
  }
  return marks;
}
