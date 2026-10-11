/** A point on the table, in pixels. */
export interface ZonePoint {
  readonly x: number;
  readonly y: number;
}

/** The ground a zone covers: a circle of a radius, or a square of a side, about its centre, in pixels. */
export interface ZoneShape {
  readonly centre: ZonePoint;
  readonly square: boolean;
  /** The radius of a circle, or half the side of a square. */
  readonly reach: number;
}

/** How far a point may stand outside an edge, in pixels, and still be on it: the edge counts as inside. */
const ON_EDGE_PX = 1e-6;

/** Whether a point lies in a zone, its edge included. */
export function zoneCovers(shape: ZoneShape, point: ZonePoint): boolean {
  const dx = Math.abs(point.x - shape.centre.x);
  const dy = Math.abs(point.y - shape.centre.y);
  if (shape.square) return dx <= shape.reach + ON_EDGE_PX && dy <= shape.reach + ON_EDGE_PX;
  return Math.hypot(dx, dy) <= shape.reach + ON_EDGE_PX;
}

/** The point half way between two others. */
export function midpointOf(a: ZonePoint, b: ZonePoint): ZonePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** How far apart two points are, in pixels. */
export function distanceBetween(a: ZonePoint, b: ZonePoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Where `count` tokens stand gathered about a centre, so each can still be seen and grabbed.
 *
 * One stands on the centre itself; more stand evenly round a ring of `ringPx`, the first at the
 * top. The points are the middles of the tokens.
 */
export function gatheredAbout(centre: ZonePoint, count: number, ringPx: number): ZonePoint[] {
  if (count <= 0) return [];
  if (count === 1) return [{ ...centre }];
  const points: ZonePoint[] = [];
  for (let index = 0; index < count; index++) {
    const turn = -Math.PI / 2 + (index * 2 * Math.PI) / count;
    points.push({ x: centre.x + Math.cos(turn) * ringPx, y: centre.y + Math.sin(turn) * ringPx });
  }
  return points;
}
