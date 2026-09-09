export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * A segment that stands between a bottom and a top.
 *
 * Left out, `heightPx` reaches high enough to stop anything: the edge of the table, and
 * anything whose height nobody has said. Left out, `basePx` stands on the floor.
 */
export interface TallSegment extends Segment {
  heightPx?: number;
  basePx?: number;
}

/** Whether a segment hangs clear of the floor, with a way through underneath it. */
export function segmentFloats(seg: TallSegment): boolean {
  return seg.basePx !== undefined && seg.basePx > 0;
}

/**
 * The segments that still stand in the way of an eye at this height.
 *
 * Anything an eye is above is behind it once it is looked over, and a character who has
 * climbed a tower is above most of what stood in the way on the ground.
 */
/**
 * The answers are held against the list they were drawn from, so a scene that is asked the same
 * question by every piece on it pays for it once. A list is built whole and never added to
 * afterwards, and the answers go when it does.
 */
const aboveByList = new WeakMap<readonly TallSegment[], Map<number, readonly TallSegment[]>>();

/** Well above the handful of eye heights one scene holds, and a guard against an unbounded map. */
const ABOVE_MEMO_LIMIT = 64;

export function segmentsAbove(segments: readonly TallSegment[], eyeZ: number): readonly TallSegment[] {
  if (!(eyeZ > 0)) return segments;

  let byEye = aboveByList.get(segments);
  if (!byEye) {
    byEye = new Map();
    aboveByList.set(segments, byEye);
  }
  const remembered = byEye.get(eyeZ);
  if (remembered) return remembered;

  // Level with the top is not above it: an eye at the height of a wall sees none of the far
  // side, and a character standing on something is above it by its own eye height anyway.
  const above = segments.filter((seg) => seg.heightPx === undefined || seg.heightPx >= eyeZ || segmentFloats(seg));
  if (byEye.size >= ABOVE_MEMO_LIMIT) byEye.clear();
  byEye.set(eyeZ, above);
  return above;
}

export function rectangleSegments(x: number, y: number, width: number, height: number, rotateDeg: number): Segment[] {
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const halfW = width / 2;
  const halfH = height / 2;
  const local: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH },
  ];
  const corners = local.map((p) => ({ x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos }));
  const segments: Segment[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % corners.length];
    segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}

export function perimeterSegments(widthPx: number, heightPx: number): Segment[] {
  return rectangleSegments(0, 0, widthPx, heightPx, 0);
}

function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
}

export function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * How far along AB the two segments meet, or nothing if they do not.
 *
 * The same crossing test, keeping the number it already worked out rather than throwing it
 * away: it is what says how high a line of sight has risen where something stands in it.
 */
export function crossingAlong(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): number | null {
  const d1 = cross(cx, cy, dx, dy, ax, ay);
  const d2 = cross(cx, cy, dx, dy, bx, by);
  const d3 = cross(ax, ay, bx, by, cx, cy);
  const d4 = cross(ax, ay, bx, by, dx, dy);
  const crosses = ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  if (!crosses) return null;
  return d1 / (d1 - d2);
}

/**
 * Whether a line of sight from one height to another clears everything standing in it.
 *
 * A wall stops a look only where the look passes through it: a head on a roof is seen over the
 * parapet from far enough back and not from the foot of it, and a look that ducks under a
 * bridge comes out the far side.
 */
export function segmentBlocks(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  seg: TallSegment
): boolean {
  const at = crossingAlong(ax, ay, bx, by, seg.x1, seg.y1, seg.x2, seg.y2);
  if (at === null) return false;
  const z = az + (bz - az) * at;
  if (seg.basePx !== undefined && z < seg.basePx) return false;
  if (seg.heightPx === undefined) return true;
  return seg.heightPx >= z;
}

export function segmentClearBetween(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  segments: readonly TallSegment[]
): boolean {
  for (const seg of segments) {
    if (segmentBlocks(ax, ay, az, bx, by, bz, seg)) return false;
  }
  return true;
}

export function segmentClear(ax: number, ay: number, bx: number, by: number, segments: readonly Segment[]): boolean {
  for (const seg of segments) {
    if (segmentsCross(ax, ay, bx, by, seg.x1, seg.y1, seg.x2, seg.y2)) return false;
  }
  return true;
}
