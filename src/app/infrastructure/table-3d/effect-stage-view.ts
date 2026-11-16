import type { EffectLight } from '@axe/domain/effect/effect-light';
import type { EffectStageOptions } from '@axe/infrastructure/table-3d/table-3d-port';

/** How far above level the board is looked at from, and how far round, in degrees, as the table is by default. */
const LOOK_DOWN_DEG = 40;
const LOOK_ROUND_DEG = 10;
/** How wide the camera of a small stage sees, top to bottom, in degrees. */
export const STAGE_FIELD_OF_VIEW = 30;
/** How strong the stage's own soft light is, which its effects' lamps are measured against. */
export const STAGE_LIGHT = 1.6;
/** How much of the board's width the camera takes in, so that the board runs a little past the edges. */
const BOARD_SHARE = 0.85;
/** How high over the middle of the board the camera looks, in cells: a little over a stand-in's middle. */
const LOOK_AT_CELLS = 0.45;
/** How tall a stand-in stands and how far out it reaches from its middle, in cells, as the stage draws it. */
const STAND_IN_CELLS = { tall: 0.9, reach: 0.3 };
/** How much air over the stand-in an effect plays on is kept in sight, in cells. */
const HEADROOM_CELLS = 2;
/** How far towards the edge of the box what is kept in sight may come, as a share of the way from its middle. */
const KEPT_WITHIN = 0.9;

type Vector = readonly [number, number, number];

/** Where the camera of a small stage stands and the point it looks at, in the stage's own space, y up. */
export interface StageCameraPlace {
  readonly position: Vector;
  readonly lookAt: Vector;
}

/**
 * Where the camera of a small stage stands in a box of this shape: looking down at the board from
 * the side as the table is seen by default, at a little over the middle of the stand-in in the
 * middle, far enough off for the board to run just past the box's sides, and further off where the
 * box is too wide and short for that to keep every stand-in and the air over the one the effect plays
 * on in sight, as many times further again as told for a larger effect.
 */
export function stageCameraPlace(
  options: Pick<EffectStageOptions, 'cellPx' | 'across' | 'figures'>,
  aspect: number,
  zoomOut: number
): StageCameraPlace {
  const { cellPx, across, figures } = options;
  const lookAt: Vector = [0, cellPx * LOOK_AT_CELLS, 0];
  const halfView = Math.tan(((STAGE_FIELD_OF_VIEW / 2) * Math.PI) / 180);
  const toEye = eyeward();
  const boardFit = (((across * cellPx) / 2) * BOARD_SHARE) / halfView / aspect;
  const keptFit = Math.max(
    0,
    ...keptInSight(figures, cellPx).map((point) => fitOf(point, lookAt, toEye, halfView, aspect))
  );
  const distance = Math.max(boardFit, keptFit) * zoomOut;
  return {
    position: [lookAt[0] + toEye[0] * distance, lookAt[1] + toEye[1] * distance, lookAt[2] + toEye[2] * distance],
    lookAt,
  };
}

/**
 * How a lamp of an effect lights a small stage: as one lights the table, falling to nothing at its
 * reach rather than off with the distance, and as strong against the stage's own light as a lamp is
 * against the table's.
 */
export function stageLampOf(light: Pick<EffectLight, 'strength' | 'reachPx'>): {
  intensity: number;
  distance: number;
  decay: number;
} {
  return { intensity: light.strength * STAGE_LIGHT, distance: Math.max(1, light.reachPx), decay: 0 };
}

/** The way from the point looked at to the eye, one long. */
function eyeward(): Vector {
  const down = (LOOK_DOWN_DEG * Math.PI) / 180;
  const round = (LOOK_ROUND_DEG * Math.PI) / 180;
  return [Math.sin(round) * Math.cos(down), Math.sin(down), Math.cos(round) * Math.cos(down)];
}

/** The points the camera keeps in sight: the corners of every stand-in, and the air over the one in full. */
function keptInSight(figures: EffectStageOptions['figures'], cellPx: number): Vector[] {
  const reach = cellPx * STAND_IN_CELLS.reach;
  const tall = cellPx * STAND_IN_CELLS.tall;
  const points: Vector[] = [];
  for (const figure of figures) {
    for (const across of [-reach, reach]) {
      for (const deep of [-reach, reach]) {
        for (const high of [0, tall]) points.push([figure.x + across, high, figure.y + deep]);
      }
    }
    if (!figure.dim) points.push([figure.x, cellPx * HEADROOM_CELLS, figure.y]);
  }
  return points;
}

/** How far off the camera has to stand for a point to lie inside the box, as far towards its edge as is kept. */
function fitOf(point: Vector, lookAt: Vector, toEye: Vector, halfView: number, aspect: number): number {
  const forward: Vector = [-toEye[0], -toEye[1], -toEye[2]];
  const right = normalized(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const offset: Vector = [point[0] - lookAt[0], point[1] - lookAt[1], point[2] - lookAt[2]];
  const ahead = dot(offset, forward);
  return Math.max(
    Math.abs(dot(offset, right)) / (KEPT_WITHIN * halfView * aspect) - ahead,
    Math.abs(dot(offset, up)) / (KEPT_WITHIN * halfView) - ahead
  );
}

function dot(a: Vector, b: Vector): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vector, b: Vector): Vector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalized(a: Vector): Vector {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
}
