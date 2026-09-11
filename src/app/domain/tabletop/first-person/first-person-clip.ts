import { FirstPersonPose, headingVector } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { CellPoint } from '@axe/domain/tabletop/fog/cell-grid';

export interface EyeFrame {
  x: number;
  y: number;
  hx: number;
  hy: number;
  rx: number;
  ry: number;
}

export function eyeFrameOf(pose: FirstPersonPose): EyeFrame {
  const heading = headingVector(pose.yaw);
  return { x: pose.x, y: pose.y, hx: heading.x, hy: heading.y, rx: -heading.y, ry: heading.x };
}

export function depthOf(frame: EyeFrame, point: CellPoint): number {
  return (point.x - frame.x) * frame.hx + (point.y - frame.y) * frame.hy;
}

export function lateralOf(frame: EyeFrame, point: CellPoint): number {
  return (point.x - frame.x) * frame.rx + (point.y - frame.y) * frame.ry;
}

export function clipSpanToEye(
  frame: EyeFrame,
  a: CellPoint,
  b: CellPoint,
  nearPx: number
): { t0: number; t1: number } | null {
  const from = depthOf(frame, a) - nearPx;
  const to = depthOf(frame, b) - nearPx;
  if (from >= 0 && to >= 0) return { t0: 0, t1: 1 };
  if (from < 0 && to < 0) return null;
  const crossing = from / (from - to);
  return from < 0 ? { t0: crossing, t1: 1 } : { t0: 0, t1: crossing };
}

export function clipPolygonToEye(frame: EyeFrame, points: readonly CellPoint[], nearPx: number): CellPoint[] {
  const kept: CellPoint[] = [];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const current = points[index];
    const previous = points[(index + count - 1) % count];
    const currentAhead = depthOf(frame, current) - nearPx;
    const previousAhead = depthOf(frame, previous) - nearPx;
    if (currentAhead >= 0) {
      if (previousAhead < 0) kept.push(crossingOf(previous, current, previousAhead, currentAhead));
      kept.push(current);
    } else if (previousAhead >= 0) {
      kept.push(crossingOf(previous, current, previousAhead, currentAhead));
    }
  }
  return kept.length >= 3 ? kept : [];
}

function crossingOf(from: CellPoint, to: CellPoint, fromAhead: number, toAhead: number): CellPoint {
  const along = fromAhead / (fromAhead - toAhead);
  return { x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along };
}
