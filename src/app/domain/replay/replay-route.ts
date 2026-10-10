export interface ReplayRoutePoint {
  x: number;
  y: number;
  z: number;
}

export const REPLAY_ROUTE_MAX_POINTS = 128;
export const REPLAY_ROUTE_MIN_STEP = 12;

/** Reads a recorded position as a route point. A coordinate that is missing or not a number reads as 0. */
export function toRoutePoint(value: unknown): ReplayRoutePoint {
  const record = (value ?? {}) as Record<string, unknown>;
  return { x: numberOf(record['x']), y: numberOf(record['y']), z: numberOf(record['z']) };
}

/** The straight-line distance between two points, height included. */
export function distanceBetween(a: ReplayRoutePoint, b: ReplayRoutePoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/**
 * Adds a point to the path a piece was dragged along.
 *
 * A point closer than `minStep` to the last one takes its place instead, and a path grown past
 * `maxPoints` is thinned evenly, keeping both ends.
 */
export function appendRoutePoint(
  path: readonly ReplayRoutePoint[],
  point: ReplayRoutePoint,
  maxPoints = REPLAY_ROUTE_MAX_POINTS,
  minStep = REPLAY_ROUTE_MIN_STEP
): ReplayRoutePoint[] {
  const last = path[path.length - 1];
  if (last && distanceBetween(last, point) < minStep) return [...path.slice(0, -1), point];

  const next = [...path, point];
  return next.length > maxPoints ? thinRoute(next, maxPoints) : next;
}

/**
 * An evenly spaced selection of a path's points, always keeping the first and last.
 *
 * A path already within the limit comes back whole.
 */
export function thinRoute(path: readonly ReplayRoutePoint[], maxPoints: number): ReplayRoutePoint[] {
  if (path.length <= maxPoints || maxPoints < 2) return [...path];

  const kept: ReplayRoutePoint[] = [];
  const stride = (path.length - 1) / (maxPoints - 1);
  for (let index = 0; index < maxPoints - 1; index++) kept.push(path[Math.round(index * stride)]);
  kept.push(path[path.length - 1]);
  return kept;
}

/**
 * The whole route of a move: from where it started, along the recorded path, to where it ended.
 *
 * A point that repeats the one before it is skipped.
 */
export function buildReplayRoute(
  from: ReplayRoutePoint,
  path: readonly ReplayRoutePoint[],
  to: ReplayRoutePoint
): ReplayRoutePoint[] {
  const points: ReplayRoutePoint[] = [from];
  for (const point of path) {
    const last = points[points.length - 1];
    if (distanceBetween(last, point) > 0) points.push(point);
  }
  if (distanceBetween(points[points.length - 1], to) > 0) points.push(to);
  return points;
}

/** The total length of a route, summed segment by segment. */
export function routeLength(points: readonly ReplayRoutePoint[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += distanceBetween(points[index - 1], points[index]);
  return total;
}

/**
 * The point a fraction of the way along a route, measured by distance rather than by points.
 *
 * The fraction is held between 0 and 1. An empty route gives the origin.
 */
export function pointAlongRoute(points: readonly ReplayRoutePoint[], progress: number): ReplayRoutePoint {
  if (points.length < 1) return { x: 0, y: 0, z: 0 };
  if (points.length < 2) return points[0];

  const clamped = Math.max(0, Math.min(1, progress));
  const target = routeLength(points) * clamped;
  if (target <= 0) return points[0];

  let travelled = 0;
  for (let index = 1; index < points.length; index++) {
    const segment = distanceBetween(points[index - 1], points[index]);
    if (travelled + segment >= target) {
      const ratio = segment > 0 ? (target - travelled) / segment : 1;
      return lerp(points[index - 1], points[index], ratio);
    }
    travelled += segment;
  }
  return points[points.length - 1];
}

/** Eases progress, held between 0 and 1, along a quadratic curve so a replayed move starts and stops gently. */
export function easeInOut(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped < 0.5 ? 2 * clamped * clamped : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
}

function lerp(a: ReplayRoutePoint, b: ReplayRoutePoint, ratio: number): ReplayRoutePoint {
  return {
    x: a.x + (b.x - a.x) * ratio,
    y: a.y + (b.y - a.y) * ratio,
    z: a.z + (b.z - a.z) * ratio,
  };
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
