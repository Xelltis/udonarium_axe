import type { Stage } from '@axe/domain/effect/scene/choreography';
import type { Point } from '@axe/domain/effect/scene/parts';

/*
 * The two ends of what pours from the caster to the target: a beam, a current of lightning, a
 * draining.
 */

/** Where the stream leaves the caster, or above and behind the target for one cast from nowhere. */
export function originOf(stage: Stage): Point {
  return stage.origin ?? { x: stage.x - stage.cell * 3, y: stage.y + stage.cell * 3, z: stage.z + stage.cell * 2 };
}

/** The chest of the target, where a stream strikes it. */
export function chestOf(stage: Stage): Point {
  return { x: stage.x, y: stage.y, z: stage.z + stage.cell * 0.55 };
}
