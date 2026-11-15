import { shadowLookOf } from '@axe/domain/effect/dark-looks';
import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { drawAbyss } from '@axe/domain/effect/scene/dark/abyss';
import { drawSpikes } from '@axe/domain/effect/scene/dark/spike';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/** What rises out of a shadow: spikes stabbing up through the target, and at the highest grade a mire of hands. */
export const shadow: Choreography = {
  lingerS: SCENE_LINGER_S.shadow ?? 1.6,
  draw: (stage) => (shadowLookOf(stage.preset) === 'abyss' ? drawAbyss(stage) : drawSpikes(stage)),
};

/** What a shot or a blade that lands in shadow lands in: its spikes, whatever its grade. */
export const struckShadow: Choreography = { lingerS: shadow.lingerS, draw: drawSpikes };
