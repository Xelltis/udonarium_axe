import { type Choreography } from '@axe/domain/effect/scene/choreography';
import { drawChain } from '@axe/domain/effect/scene/shot/chain';
import { CURRENT_LINGER_S, drawCurrent } from '@axe/domain/effect/scene/shot/current';

/**
 * A current of lightning from the caster: on one target it holds between the two for as long as it
 * is held, and on two or more it chains, leaping from each to the next.
 */
export const arc: Choreography = {
  lingerS: CURRENT_LINGER_S,
  draw: (stage) => (stage.targets.length >= 2 ? drawChain(stage) : drawCurrent(stage)),
};
