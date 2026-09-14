/**
 * Projects a direction in the world onto the screen.
 *
 * The board turns its children about the three axes in a fixed order, and a billboard
 * undoes that to face the camera. The same matrix applied to a vector gives its angle and apparent length on the screen,
 * which is what lets a projectile be drawn out along its flight.
 */

export interface ViewRotation {
  x: number;
  y: number;
  z: number;
}

export interface ScreenDirection {
  /** The angle on the screen, ready to be turned by. */
  angle: number;
  /** The length on the screen, shorter the more it points into it. */
  length: number;
}

export const DEFAULT_VIEW_ROTATION: ViewRotation = { x: 50, y: 0, z: 10 };

/**
 * The angle in degrees and apparent length on screen of a direction on the board, as seen
 * through the board's rotation.
 *
 * Without a rotation the default view is used. A direction pointing straight into the screen
 * has an angle of 0.
 */
export function projectDirection(
  dx: number,
  dy: number,
  dz: number,
  rotation: ViewRotation | null | undefined
): ScreenDirection {
  const view = rotation ?? DEFAULT_VIEW_ROTATION;
  const rz = toRadians(view.z);
  const rx = toRadians(view.x);
  const ry = toRadians(view.y);

  // rotateZ
  let x = dx * Math.cos(rz) - dy * Math.sin(rz);
  let y = dx * Math.sin(rz) + dy * Math.cos(rz);
  let z = dz;

  // rotateX
  const y1 = y * Math.cos(rx) - z * Math.sin(rx);
  z = y * Math.sin(rx) + z * Math.cos(rx);
  y = y1;

  // the turn about the vertical, after which the depth is dropped since only two axes reach the screen
  x = x * Math.cos(ry) + z * Math.sin(ry);

  const length = Math.hypot(x, y);
  return { angle: length < 1e-6 ? 0 : (Math.atan2(y, x) * 180) / Math.PI, length };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}
