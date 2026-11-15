import { healLookOf } from '@axe/domain/effect/blessing-looks';
import { type Choreography } from '@axe/domain/effect/scene/choreography';
import { drawPurge, drawWash } from '@axe/domain/effect/scene/holy/cleanse';
import { drawGrace } from '@axe/domain/effect/scene/holy/heal-grace';
import { drawMend } from '@axe/domain/effect/scene/holy/heal-mend';
import { drawRain } from '@axe/domain/effect/scene/holy/heal-rain';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

const LINGER_S = SCENE_LINGER_S.heal ?? 1.2;

/**
 * A healing, drawn as the look its grade and its particles choose: life welling up into its target,
 * light poured down on it, a dome of light raised over all it takes in, or what ails it driven out
 * of it or washed off it.
 */
export const heal: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    switch (healLookOf(stage.preset)) {
      case 'rain':
        return drawRain(stage, LINGER_S);
      case 'grace':
        return drawGrace(stage, LINGER_S);
      case 'purge':
        return drawPurge(stage, LINGER_S);
      case 'wash':
        return drawWash(stage, LINGER_S);
      default:
        return drawMend(stage, LINGER_S);
    }
  },
};
