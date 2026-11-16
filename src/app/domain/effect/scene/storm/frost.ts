import { frostLookOf } from '@axe/domain/effect/ice-looks';
import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { drawCoffin } from '@axe/domain/effect/scene/ice/coffin';
import { drawFreeze } from '@axe/domain/effect/scene/ice/freeze';
import { drawHail } from '@axe/domain/effect/scene/ice/hail';
import { drawZero } from '@axe/domain/effect/scene/ice/zero';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/**
 * Cold made to strike, drawn as the ice its preset is; see {@link frostLookOf}. Landed by a shot it
 * is the lesser for it, and landed by a great blade it is as great as the blade.
 */
export const frost: Choreography = {
  lingerS: SCENE_LINGER_S.frost ?? 1.2,
  draw: (stage) => {
    switch (frostLookOf(stage.preset)) {
      case 'hail':
        return drawHail(stage);
      case 'zero':
        return drawZero(stage);
      case 'coffin':
        return drawCoffin(stage);
      default:
        return drawFreeze(stage, stage.preset.effectKind === 'projectile' || stage.preset.effectKind === 'ballistic');
    }
  },
};
