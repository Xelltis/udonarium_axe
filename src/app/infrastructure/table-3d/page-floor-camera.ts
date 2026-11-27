import { fieldOfViewDeg } from '@axe/infrastructure/table-3d/engine-rules';
import type { EffectOverlayView } from '@axe/infrastructure/table-3d/table-3d-port';
import { type PerspectiveCamera, Vector3 } from 'three/webgpu';

const ACROSS = new Vector3(1, 0, 0);

/**
 * Stands a camera to see a floor as the page sees one it draws in 3D, in the floor's own measure (x
 * east, y up, z south): where the page's eye is, a perspective's length in front of the middle of the
 * box, brought into the floor by undoing its growing and its tipping. That eye stands close to the
 * floor, so the camera sees from very near to far beyond it.
 */
export function seePageFloor(camera: PerspectiveCamera, view: EffectOverlayView): void {
  const width = Math.max(1, view.width);
  const height = Math.max(1, view.height);
  const scale = Math.max(view.scale, 0.01);
  const tipped = ((90 - view.tiltDeg) * Math.PI) / 180;
  camera.quaternion.setFromAxisAngle(ACROSS, -tipped);
  camera.position
    .set(width / 2 - view.originX, view.originY - height / 2, view.perspectivePx)
    .divideScalar(scale)
    .applyQuaternion(camera.quaternion);
  camera.fov = fieldOfViewDeg(height, view.perspectivePx);
  camera.aspect = width / height;
  camera.near = (view.perspectivePx * 0.02) / scale;
  camera.far = (view.perspectivePx * 20) / scale;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
