/**
 * The geometry a range's cells are picked by: which side of an edge a point lies on, and whether
 * it lies within a circle.
 */

/**
 * How far past an edge a point may lie and still count as inside it, as the cross product of the
 * edge with the line to the point, to forgive the rounding of a turned corner.
 */
const EDGE_TOLERANCE = 0.01;

/**
 * Whether a point lies on the inner side of an edge from (p1x, p1y) to (p2x, p2y), or on it, where
 * the edges run clockwise seen from above the board: the cross product of the edge with the line to
 * the point is then positive.
 */
export function chkOuterProduct(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  pchkx: number,
  pchky: number
): boolean {
  const ax = p2x - p1x;
  const ay = p2y - p1y;
  const bx = pchkx - p1x;
  const by = pchky - p1y;
  return ax * by - ay * bx >= -EDGE_TOLERANCE;
}

/** Whether a point, relative to a circle's centre, lies inside or on a circle of that radius. */
export function chkInCircle(radius: number, pchkx: number, pchky: number): boolean {
  return radius * radius >= pchkx * pchkx + pchky * pchky;
}

/** Whether a point lies inside a convex polygon whose corners run clockwise, or on its edge. */
export function insideConvexPolygon(verts: readonly { x: number; y: number }[], px: number, py: number): boolean {
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!chkOuterProduct(a.x, a.y, b.x, b.y, px, py)) return false;
  }
  return true;
}
