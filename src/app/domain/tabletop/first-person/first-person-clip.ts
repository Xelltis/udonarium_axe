import { FirstPersonPose, headingVector } from '@axe/domain/tabletop/first-person/first-person-lattice';
import { CellPoint } from '@axe/domain/tabletop/fog/cell-grid';

/**
 * Where the eye stands and which way it looks: the heading along the ground and the right of it,
 * and how far the camera tips up (positive) or down from level.
 */
export interface EyeFrame {
  x: number;
  y: number;
  z: number;
  hx: number;
  hy: number;
  rx: number;
  ry: number;
  cosPitch: number;
  sinPitch: number;
}

/** A pose seen through a camera tipped up (positive) or down from level, in degrees. */
export type FirstPersonCamera = FirstPersonPose & { pitch?: number };

/** A point in the table's space, its height in pixels above the ground. */
export interface SpacePoint {
  x: number;
  y: number;
  z: number;
}

/** How wide and how tall the view opens either side of its middle, as tangents of the half-angles. */
export interface ViewOpening {
  tanHalfWidth: number;
  /** Left out where the view is not cut above and below, as a level view need not be. */
  tanHalfHeight?: number;
}

/** What is kept of a wall cut at the eye: along it from `t0` to `t1`, up it from `lowPx` to `highPx`. */
export interface WallCut {
  t0: number;
  t1: number;
  lowPx: number;
  highPx: number;
  /** The kept outline, along the wall (0 to 1) and up it; null where it is the whole of that box. */
  outline: { t: number; z: number }[] | null;
}

export function eyeFrameOf(camera: FirstPersonCamera): EyeFrame {
  const heading = headingVector(camera.yaw);
  const pitch = ((camera.pitch ?? 0) * Math.PI) / 180;
  return {
    x: camera.x,
    y: camera.y,
    z: camera.z,
    hx: heading.x,
    hy: heading.y,
    rx: -heading.y,
    ry: heading.x,
    cosPitch: pitch === 0 ? 1 : Math.cos(pitch),
    sinPitch: pitch === 0 ? 0 : Math.sin(pitch),
  };
}

/** How far ahead of the eye a point lies along the ground, whichever way the camera tips. */
export function depthOf(frame: EyeFrame, point: CellPoint): number {
  return (point.x - frame.x) * frame.hx + (point.y - frame.y) * frame.hy;
}

export function lateralOf(frame: EyeFrame, point: CellPoint): number {
  return (point.x - frame.x) * frame.rx + (point.y - frame.y) * frame.ry;
}

/** How far in front of the camera a point at a height lies, square to the way the camera looks. */
export function viewDepthOf(frame: EyeFrame, point: CellPoint, zPx: number): number {
  return depthOf(frame, point) * frame.cosPitch + (zPx - frame.z) * frame.sinPitch;
}

/**
 * Cuts a level shape lying at a height to what lies in front of the camera's near plane. However the
 * camera tips, the cut across a level shape is a straight line square to the heading; how far ahead
 * it falls depends on the height.
 */
export function clipPolygonToEye(
  frame: EyeFrame,
  points: readonly CellPoint[],
  nearPx: number,
  zPx = frame.z
): CellPoint[] {
  const threshold = (nearPx - (zPx - frame.z) * frame.sinPitch) / frame.cosPitch;
  const kept = clipConvex(
    points,
    (point) => depthOf(frame, point) - threshold,
    (from, to, along) => ({ x: from.x + (to.x - from.x) * along, y: from.y + (to.y - from.y) * along })
  );
  return kept.length >= 3 ? kept : [];
}

/**
 * Cuts an upright wall from `a` to `b`, standing from `basePx` to `topPx`, to what lies in front of
 * the camera's near plane. A level camera cuts it along its length only; a tipped one cuts across it
 * on a slant, which the outline gives. Null where nothing of it is left.
 */
export function clipWallToEye(
  frame: EyeFrame,
  a: CellPoint,
  b: CellPoint,
  basePx: number,
  topPx: number,
  nearPx: number
): WallCut | null {
  const fromDepth = depthOf(frame, a);
  const toDepth = depthOf(frame, b);
  const ahead = (corner: { t: number; z: number }) =>
    (fromDepth + (toDepth - fromDepth) * corner.t) * frame.cosPitch + (corner.z - frame.z) * frame.sinPitch - nearPx;
  const corners = [
    { t: 0, z: basePx },
    { t: 1, z: basePx },
    { t: 1, z: topPx },
    { t: 0, z: topPx },
  ];
  const kept = clipConvex(corners, ahead, (from, to, along) => ({
    t: from.t + (to.t - from.t) * along,
    z: from.z + (to.z - from.z) * along,
  }));
  if (kept.length < 3) return null;
  const t0 = Math.min(...kept.map((point) => point.t));
  const t1 = Math.max(...kept.map((point) => point.t));
  const lowPx = Math.min(...kept.map((point) => point.z));
  const highPx = Math.max(...kept.map((point) => point.z));
  if (t1 - t0 <= 0 || highPx - lowPx <= 0) return null;
  const onBox = (point: { t: number; z: number }) =>
    (nearlyEqual(point.t, t0) || nearlyEqual(point.t, t1)) &&
    (nearlyEqual(point.z, lowPx) || nearlyEqual(point.z, highPx));
  const whole = kept.length === 4 && kept.every(onBox);
  return { t0, t1, lowPx, highPx, outline: whole ? null : kept };
}

/**
 * Cuts a board standing square to the camera's heading, from `lowPx` to `highPx` high, to what lies in
 * front of the near plane. Every point of such a board lies equally far ahead along the ground, so only
 * its height decides: looking up cuts it from below, looking down from above. Null where none is left.
 */
export function clipBillboardToEye(
  frame: EyeFrame,
  centre: CellPoint,
  lowPx: number,
  highPx: number,
  nearPx: number
): { lowPx: number; highPx: number } | null {
  const level = depthOf(frame, centre) * frame.cosPitch;
  if (Math.abs(frame.sinPitch) < 1e-6) return level >= nearPx ? { lowPx, highPx } : null;
  const cut = frame.z + (nearPx - level) / frame.sinPitch;
  const kept = frame.sinPitch > 0 ? { lowPx: Math.max(lowPx, cut), highPx } : { lowPx, highPx: Math.min(highPx, cut) };
  return kept.highPx > kept.lowPx ? kept : null;
}

/**
 * Whether any of a shape could show in the view: it is left out only when every one of its points lies
 * past the same edge of the view, or behind the camera.
 */
export function inViewOpening(frame: EyeFrame, points: readonly SpacePoint[], opening: ViewOpening): boolean {
  let behind = true;
  let left = true;
  let right = true;
  let below = true;
  let above = true;
  for (const point of points) {
    const along = depthOf(frame, point);
    const rise = point.z - frame.z;
    const ahead = along * frame.cosPitch + rise * frame.sinPitch;
    const up = rise * frame.cosPitch - along * frame.sinPitch;
    const side = lateralOf(frame, point);
    if (ahead > 0) behind = false;
    if (side >= -ahead * opening.tanHalfWidth) left = false;
    if (side <= ahead * opening.tanHalfWidth) right = false;
    if (opening.tanHalfHeight === undefined) {
      below = false;
      above = false;
      continue;
    }
    if (up >= -ahead * opening.tanHalfHeight) below = false;
    if (up <= ahead * opening.tanHalfHeight) above = false;
  }
  return !behind && !left && !right && !below && !above;
}

/**
 * Cuts a convex outline to the part where `aheadOf` gives zero or more, putting a corner in where an
 * edge crosses over, `between` giving the point that far along it: the one cut every shape here is
 * given, whatever its points are measured in.
 */
function clipConvex<T>(
  points: readonly T[],
  aheadOf: (point: T) => number,
  between: (from: T, to: T, along: number) => T
): T[] {
  const ahead = points.map(aheadOf);
  const kept: T[] = [];
  const count = points.length;
  for (let index = 0; index < count; index++) {
    const before = (index + count - 1) % count;
    const crossing = () => between(points[before], points[index], ahead[before] / (ahead[before] - ahead[index]));
    if (ahead[index] >= 0) {
      if (ahead[before] < 0) kept.push(crossing());
      kept.push(points[index]);
    } else if (ahead[before] >= 0) {
      kept.push(crossing());
    }
  }
  return kept;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}
