import type { Choreography, Stage, Staged } from '@axe/domain/effect/scene/choreography';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawCrush } from '@axe/domain/effect/scene/strike/crush';
import { drawJab } from '@axe/domain/effect/scene/strike/jab';
import { drawSwing } from '@axe/domain/effect/scene/strike/swing';
import { strikeLookOf } from '@axe/domain/effect/strike-looks';

/*
 * A strike: a blow of a fist or of a blunt weapon, drawn by its grade as a jab, a swing or a crushing
 * blow; see `strike-looks`.
 */

/** How long a strike lingers after its playback while its dust settles, in seconds. */
const LINGER_S = SCENE_LINGER_S.bash ?? 0.6;

function drawBash(stage: Stage): Staged {
  switch (strikeLookOf(stage.preset)) {
    case 'jab':
      return drawJab(stage, LINGER_S);
    case 'swing':
      return drawSwing(stage, LINGER_S);
    default:
      return drawCrush(stage, LINGER_S);
  }
}

/** A strike, drawn by its grade: see the head of this file. */
export const bash: Choreography = { lingerS: LINGER_S, draw: drawBash };
