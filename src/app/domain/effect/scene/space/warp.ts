import { type Choreography, nothingStaged } from '@axe/domain/effect/scene/choreography';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawBlink } from '@axe/domain/effect/scene/space/blink';
import { drawSummon } from '@axe/domain/effect/scene/space/summon';
import { warpLookOf } from '@axe/domain/effect/space-looks';

/** A warp: a blink out of where a piece stands and back below the highest grade, and a summoning at it. */
export const warp: Choreography = {
  lingerS: SCENE_LINGER_S.warp ?? 1,
  draw: (stage) => {
    if (stage.seconds < 0) return nothingStaged();
    return warpLookOf(stage.preset) === 'summon' ? drawSummon(stage) : drawBlink(stage);
  },
};
