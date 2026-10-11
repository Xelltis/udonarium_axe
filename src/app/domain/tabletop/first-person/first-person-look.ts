import { FirstPersonCamera } from '@axe/domain/tabletop/first-person/first-person-clip';
import { FirstPersonPose, signedTurnDeg } from '@axe/domain/tabletop/first-person/first-person-lattice';

/**
 * How far this seat looks away from where its piece faces: turned right (positive) or left, and
 * tipped up (positive) or down, in degrees. It belongs to the screen alone and is never shared.
 */
export interface FirstPersonLook {
  readonly yaw: number;
  readonly pitch: number;
}

/** Looking where the piece faces, level. */
export const LOOK_REST: FirstPersonLook = { yaw: 0, pitch: 0 };

/** How far up or down the eye may look, in degrees: short of straight up and straight down. */
export const LOOK_PITCH_LIMIT_DEG = 85;

/**
 * The camera a pose is drawn through while the eye looks away: turned and tipped by the look, but
 * standing where the pose stands, so looking about never moves the eye.
 */
export function cameraOf(pose: FirstPersonPose, look: FirstPersonLook): FirstPersonCamera {
  return { ...pose, yaw: pose.yaw + look.yaw, pitch: look.pitch };
}

/**
 * Where a drag of the pointer leaves the look it started from: turned towards where the pointer went
 * and tipped up as it goes up the screen, `degPerPx` for each pixel, no further up or down than the
 * limit.
 */
export function lookDragged(start: FirstPersonLook, dxPx: number, dyPx: number, degPerPx: number): FirstPersonLook {
  const pitch = start.pitch - dyPx * degPerPx;
  return {
    yaw: start.yaw + dxPx * degPerPx,
    pitch: Math.min(LOOK_PITCH_LIMIT_DEG, Math.max(-LOOK_PITCH_LIMIT_DEG, pitch)),
  };
}

/** The same look with its turn brought within half a turn either way, so going back takes the short way. */
export function homeward(look: FirstPersonLook): FirstPersonLook {
  return { yaw: signedTurnDeg(look.yaw), pitch: look.pitch };
}

/** Where a look going back to rest stands after `t` of the way (0 to 1), easing as it arrives. */
export function lookEased(from: FirstPersonLook, t: number): FirstPersonLook {
  const left = Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
  return { yaw: from.yaw * left, pitch: from.pitch * left };
}

/** Whether the eye looks where its piece faces, level. */
export function isAtRest(look: FirstPersonLook): boolean {
  return look.yaw === 0 && look.pitch === 0;
}
