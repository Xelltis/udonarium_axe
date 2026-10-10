export interface CameraView {
  rotateX: number;
  rotateZ: number;
  positionX: number;
  positionY: number;
  positionZ: number;
}

/**
 * How far to move the view so that a point on the table comes to the middle of the screen.
 *
 * The move allows for how the view is turned and tilted, and is to be added to the view as it
 * stands.
 */
export function glideTransform(
  focus: { x: number; y: number },
  center: { x: number; y: number },
  view: CameraView
): { x: number; y: number; z: number } {
  const movedX = focus.x - center.x;
  const movedY = focus.y - center.y;
  const rotateZRad = (view.rotateZ / 180) * Math.PI;
  const rotatedMovedX = movedX * Math.cos(rotateZRad) - movedY * Math.sin(rotateZRad);
  const zRotatedMovedY = movedX * Math.sin(rotateZRad) + movedY * Math.cos(rotateZRad);
  const rotateXRad = (view.rotateX / 180) * Math.PI;
  const rotatedMovedY = zRotatedMovedY * Math.cos(rotateXRad);
  const rotatedMovedZ = zRotatedMovedY * Math.sin(rotateXRad);
  return {
    x: 100 - rotatedMovedX - view.positionX,
    y: -rotatedMovedY - view.positionY,
    z: -rotatedMovedZ - view.positionZ,
  };
}
