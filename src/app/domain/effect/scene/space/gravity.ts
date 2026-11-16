import { type Choreography, nothingStaged } from '@axe/domain/effect/scene/choreography';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawCrush } from '@axe/domain/effect/scene/space/crush';
import { drawSingularity } from '@axe/domain/effect/scene/space/singularity';
import { gravityLookOf } from '@axe/domain/effect/space-looks';

/** Gravity: a crush under a lens of black below the highest grade, and a singularity at it. */
export const gravity: Choreography = {
  lingerS: SCENE_LINGER_S.gravity ?? 1.5,
  draw: (stage) => {
    if (stage.seconds < 0) return nothingStaged();
    return gravityLookOf(stage.preset) === 'singularity' ? drawSingularity(stage) : drawCrush(stage);
  },
};
