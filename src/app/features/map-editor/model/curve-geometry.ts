export interface BezierSegment {
  c1x: number;
  c1y: number;
  c2x: number;
  c2y: number;
  x: number;
  y: number;
}

/**
 * Turns a flat x,y point list into the cubic Bézier segments of a Catmull-Rom curve through every
 * point.
 *
 * The segments start from the first point, one per gap between points. An open curve repeats its
 * end points to shape the first and last segments; a closed one wraps round and adds a segment back
 * to the start. Fewer than two points give no segments.
 */
export function catmullRomSegments(points: number[], closed: boolean): BezierSegment[] {
  const n = Math.floor(points.length / 2);
  if (n < 2) return [];

  const xAt = (i: number): number => {
    if (closed) return points[(((i % n) + n) % n) * 2];
    return points[Math.max(0, Math.min(n - 1, i)) * 2];
  };
  const yAt = (i: number): number => {
    if (closed) return points[(((i % n) + n) % n) * 2 + 1];
    return points[Math.max(0, Math.min(n - 1, i)) * 2 + 1];
  };

  const segments: BezierSegment[] = [];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const p0x = xAt(i - 1);
    const p0y = yAt(i - 1);
    const p1x = xAt(i);
    const p1y = yAt(i);
    const p2x = xAt(i + 1);
    const p2y = yAt(i + 1);
    const p3x = xAt(i + 2);
    const p3y = yAt(i + 2);

    segments.push({
      c1x: p1x + (p2x - p0x) / 6,
      c1y: p1y + (p2y - p0y) / 6,
      c2x: p2x - (p3x - p1x) / 6,
      c2y: p2y - (p3y - p1y) / 6,
      x: p2x,
      y: p2y,
    });
  }
  return segments;
}

/**
 * Flattens the curve through the points into a polyline with a fixed number of steps per segment,
 * so a curve can be hit-tested like a line.
 *
 * With fewer than two points the points come back as they were given.
 */
export function sampleCurvePoints(points: number[], closed: boolean, stepsPerSegment = 16): number[] {
  const segments = catmullRomSegments(points, closed);
  if (segments.length === 0) return points.slice();

  const result: number[] = [points[0], points[1]];
  let startX = points[0];
  let startY = points[1];
  const steps = Math.max(1, Math.floor(stepsPerSegment));

  for (const seg of segments) {
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      result.push(
        a * startX + b * seg.c1x + c * seg.c2x + d * seg.x,
        a * startY + b * seg.c1y + c * seg.c2y + d * seg.y
      );
    }
    startX = seg.x;
    startY = seg.y;
  }
  return result;
}
