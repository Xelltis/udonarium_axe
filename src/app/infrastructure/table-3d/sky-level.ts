import { Matrix3, Matrix4, Vector3 } from 'three/webgpu';

/**
 * How far below the middle of the view the horizon of the sky is drawn when the table is looked
 * steeply down on, as a share of the way from the middle to the bottom edge.
 */
const HORIZON_BELOW_MIDDLE = 0.2;
/** How steeply the table is looked down on, in radians, before the sky is drawn as level all the way. */
const LEVEL_FROM = (24 * Math.PI) / 180;

const across = new Vector3();
const turn = new Matrix4();

/**
 * The pitch the sky is drawn at for a camera at a pitch, in radians, up positive: looking at or over
 * the horizon, the pitch it is at, so the sky stands where the ground meets it; looking down, more and
 * more the pitch that puts the horizon low in the view, and at that once the table is looked steeply
 * down on, so the sky of the hour fills the view past the board however far down the camera looks.
 */
export function skyPitchFor(pitch: number, halfViewRadians: number): number {
  const level = Math.atan(HORIZON_BELOW_MIDDLE * Math.tan(halfViewRadians));
  if (pitch >= 0) return pitch;
  const share = Math.min(1, -pitch / LEVEL_FROM);
  const eased = share * share * (3 - 2 * share);
  return pitch + (level - pitch) * eased;
}

/**
 * The turn that takes the way the eye looks at a point of the sky to the way the sky is drawn there:
 * about the camera's sideways axis laid level, from the pitch it looks at to the pitch the sky is
 * drawn at. None for a camera turned on its side, with no level sideways axis to turn about.
 */
export function skyLevelTurn(forward: Vector3, sideways: Vector3, halfViewRadians: number, into: Matrix3): Matrix3 {
  const pitch = Math.asin(Math.max(-1, Math.min(1, forward.y)));
  across.set(sideways.x, 0, sideways.z);
  if (across.lengthSq() < 1e-8) return into.identity();
  across.normalize();
  return into.setFromMatrix4(turn.makeRotationAxis(across, skyPitchFor(pitch, halfViewRadians) - pitch));
}
