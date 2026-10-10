import { upAlignment } from '@axe/domain/dice/dice-3d/die-symmetry';
import { dieRadiusOf, DieShape, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { Quat, Vec3 } from '@axe/domain/dice/dice-3d/rotation';

/** The floor the dice are thrown onto: a rectangle about the origin, walled in on every side. */
export interface Tray {
  /** Half its width along x. */
  readonly halfWidth: number;
  /** Half its depth along y. */
  readonly halfDepth: number;
}

/** Where a die came to rest. */
export interface RestingDie {
  readonly shape: DieShape;
  readonly position: Vec3;
  readonly rotation: Quat;
}

/** What spoils a throw, so it is thrown again with another seed. */
export type ThrowFault = 'unsettled' | 'outside' | 'stacked' | 'cocked';

/** How squarely a die has to sit to be read without doubt, about eighteen degrees of lean. */
export const LEVEL_ENOUGH = 0.95;

/**
 * Why a throw cannot be shown, or null when it can: the dice did not settle in time, one left the
 * tray, one came to rest on another, or one leans against something without sitting flat.
 *
 * The face a die shows is set afterwards whatever it landed on, so throwing again for any of these
 * never leans the result one way or another.
 */
export function throwFaultOf(dice: readonly RestingDie[], tray: Tray, settled: boolean): ThrowFault | null {
  if (!settled) return 'unsettled';
  for (const die of dice) {
    const poly = polyhedronOf(die.shape);
    const radius = dieRadiusOf(die.shape);
    const [x, y, z] = die.position;
    if (Math.abs(x) > tray.halfWidth || Math.abs(y) > tray.halfDepth) return 'outside';
    if (z > (poly.inradius + 0.2) * radius) return 'stacked';
  }
  for (const die of dice) {
    if (upAlignment(polyhedronOf(die.shape), die.rotation) < LEVEL_ENOUGH) return 'cocked';
  }
  return null;
}
