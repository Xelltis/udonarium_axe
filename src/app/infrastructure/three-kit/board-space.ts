import { Matrix4, Vector3 } from 'three/webgpu';

/**
 * The board's axes as the scene's: the board runs x to the east, y to the south and z up, and the
 * scene x to the east, y up and z to the south, which is the board's space seen in a mirror and so
 * the right-handed space a graphics library works in.
 */
export const BOARD_TO_SCENE = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);

/** A point or direction of the board's space as the scene's, whose axes run east, up and south. */
export function sceneDirection(v: { x: number; y: number; z: number }): Vector3 {
  return new Vector3(v.x, v.z, v.y);
}
