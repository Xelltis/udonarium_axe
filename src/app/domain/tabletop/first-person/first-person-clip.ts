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
