import { Point, Segment } from '@axe/domain/tabletop/los/segments';

const TWO_PI = Math.PI * 2;
const ANGLE_EPSILON = 1e-4;

function raySegmentDistance(ox: number, oy: number, dx: number, dy: number, seg: Segment): number | null {
  const sdx = seg.x2 - seg.x1;
  const sdy = seg.y2 - seg.y1;
  const denom = dx * sdy - dy * sdx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((seg.x1 - ox) * sdy - (seg.y1 - oy) * sdx) / denom;
  const u = ((seg.x1 - ox) * dy - (seg.y1 - oy) * dx) / denom;
  if (t >= 0 && u >= -1e-6 && u <= 1 + 1e-6) return t;
  return null;
}

/**
 * The outline of what can be seen from a point, cut short by the segments and by a greatest radius.
 *
 * Rays are cast at and just either side of every segment end, plus `sampleCount` evenly spread rays
 * so that open ground comes out round. The points come back ordered by angle.
 */
export function computeVisibilityPolygon(
  ox: number,
  oy: number,
  segments: readonly Segment[],
  maxRadius: number,
  sampleCount = 0
): Point[] {
  const minX = ox - maxRadius;
  const maxX = ox + maxRadius;
  const minY = oy - maxRadius;
  const maxY = oy + maxRadius;
  const culled = segments.filter(
    (s) =>
      Math.min(s.x1, s.x2) <= maxX &&
      Math.max(s.x1, s.x2) >= minX &&
      Math.min(s.y1, s.y2) <= maxY &&
      Math.max(s.y1, s.y2) >= minY
  );

  const angles: number[] = [];
  for (const seg of culled) {
    for (const [px, py] of [
      [seg.x1, seg.y1],
      [seg.x2, seg.y2],
    ]) {
      const base = Math.atan2(py - oy, px - ox);
      angles.push(base - ANGLE_EPSILON, base, base + ANGLE_EPSILON);
    }
  }
  for (let i = 0; i < sampleCount; i++) {
    angles.push((i / sampleCount) * TWO_PI - Math.PI);
  }

  const points: { angle: number; x: number; y: number }[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = maxRadius;
    for (const seg of culled) {
      const t = raySegmentDistance(ox, oy, dx, dy, seg);
      if (t !== null && t < best) best = t;
    }
    points.push({ angle, x: ox + dx * best, y: oy + dy * best });
  }

  points.sort((a, b) => a.angle - b.angle);
  return points.map((p) => ({ x: p.x, y: p.y }));
}
