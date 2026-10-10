import { seededRandom } from '@axe/core/util/seeded-random';
import { dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import {
  Quat,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatMultiply,
  UP,
  Vec3,
} from '@axe/domain/dice/dice-3d/rotation';
import { Tray } from '@axe/domain/dice/dice-3d/throw-validation';

/** A die laid down without being thrown. */
export interface RestingPose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

/**
 * The rotation that leaves a face of a die on top, or a corner for a d4, turned about the upright
 * by a yaw in radians.
 */
export function restingRotation(shape: DieShape, target: number, yaw: number): Quat {
  const poly = polyhedronOf(shape);
  const up = poly.readsCorners ? poly.vertices[target] : poly.normals[target];
  return quatMultiply(quatFromAxisAngle(UP, yaw), quatFromUnitVectors(up, UP));
}

/**
 * Dice laid out side by side showing their faces, for a screen that has motion turned off: in rows
 * across the middle of the tray, each a little askew so they read as dice set down by hand rather
 * than a grid.
 */
export function restingLayout(
  dice: readonly { shape: DieShape; target: number }[],
  tray: Tray,
  seed: number
): RestingPose[] {
  const random = seededRandom(seed);
  const pitch = 2 * Math.max(...dice.map((die) => dieRadiusOf(die.shape))) + 0.2;
  const perRow = Math.max(1, Math.floor((tray.halfWidth * 2) / pitch));
  const rows = Math.ceil(dice.length / perRow);
  return dice.map((die, index) => {
    const row = Math.floor(index / perRow);
    const inRow = Math.min(perRow, dice.length - row * perRow);
    const column = index - row * perRow;
    const x = (column - (inRow - 1) / 2) * pitch + (random() - 0.5) * 0.3;
    const y = ((rows - 1) / 2 - row) * pitch + (random() - 0.5) * 0.3;
    const radius = dieRadiusOf(die.shape);
    const z = polyhedronOf(die.shape).inradius * radius;
    const yaw = (random() - 0.5) * 1.2;
    return { position: [x, y, z], rotation: restingRotation(die.shape, die.target, yaw) };
  });
}
