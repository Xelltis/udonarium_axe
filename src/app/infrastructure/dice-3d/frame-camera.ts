import type { Tray } from '@axe/domain/dice/dice-3d/throw-validation';
import { PerspectiveCamera, Vector3 } from 'three';

/** How the frame's camera looks at the tray: its field of view, and how high above the floor it stands. */
const FRAME_FOV = 18;
const FRAME_ELEVATION = (72 * Math.PI) / 180;
/** How high the tallest die stands as it rests, so one against the far wall keeps its top in the frame. */
const TALLEST_DIE = 2;
/** How many times the distance is halved between the nearest and the farthest it could be. */
const SEARCH_STEPS = 40;
const NEAREST = 1;
const FARTHEST = 400;
/** How many trays and aspects the distances found are kept for before they are forgotten. */
const KEPT_DISTANCES = 64;

/** The line the frame's camera stands back along from the middle of the tray. */
const DIRECTION = new Vector3(0, -Math.cos(FRAME_ELEVATION), Math.sin(FRAME_ELEVATION));
/** The camera the distance is searched with, standing as the frame's does. */
const probe = new PerspectiveCamera(FRAME_FOV, 1, 0.5, FARTHEST);
probe.up.set(0, 0, 1);
const corners = Array.from({ length: 8 }, () => new Vector3());
const projected = new Vector3();
/** The distances found, by tray and aspect, so a throw drawn frame after frame searches once. */
const distances = new Map<string, number>();

/**
 * How far back the frame's camera stands from the middle of the tray, looking down at it, for the
 * whole floor and the dice resting against its walls to fit a frame of the aspect: the nearest
 * distance, to the precision of forty halvings, at which every corner of the tray's floor and of a
 * die's height above it projects into the frame.
 */
export function frameCameraDistance(tray: Tray, aspect: number): number {
  const key = `${tray.halfWidth}|${tray.halfDepth}|${aspect}`;
  const kept = distances.get(key);
  if (kept !== undefined) return kept;

  probe.aspect = aspect;
  let at = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const z of [0, TALLEST_DIE]) corners[at++].set(sx * tray.halfWidth, sy * tray.halfDepth, z);
    }
  }
  let near = NEAREST;
  let far = FARTHEST;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const distance = (near + far) / 2;
    probe.position.copy(DIRECTION).multiplyScalar(distance);
    probe.lookAt(0, 0, 0);
    probe.updateMatrixWorld();
    probe.updateProjectionMatrix();
    const fits = corners.every((corner) => {
      projected.copy(corner).project(probe);
      return Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1;
    });
    if (fits) far = distance;
    else near = distance;
  }

  if (distances.size >= KEPT_DISTANCES) distances.clear();
  distances.set(key, far);
  return far;
}

/**
 * Sets the frame's camera high above the tray and a little in front of it, looking down at it, as
 * far back as {@link frameCameraDistance} finds it needs to be. The tray is the frame's own shape,
 * so its walls stand about at the frame's edges.
 */
export function placeFrameCamera(camera: PerspectiveCamera, tray: Tray, aspect: number): void {
  const distance = frameCameraDistance(tray, aspect);
  camera.aspect = aspect;
  camera.fov = FRAME_FOV;
  camera.position.copy(DIRECTION).multiplyScalar(distance);
  camera.lookAt(0, 0, 0);
  camera.near = Math.max(0.5, distance * 0.2);
  camera.far = distance * 3;
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}
