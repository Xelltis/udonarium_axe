import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { drawGust } from '@axe/domain/effect/scene/wind/gust';
import { drawTornado } from '@axe/domain/effect/scene/wind/tornado';
import { windLookOf } from '@axe/domain/effect/wind-looks';

/**
 * A whirlwind: the least of them a gust thrown from its caster onto the target, and any other a
 * tornado standing over it; see {@link windLookOf}.
 */
export const vortex: Choreography = {
  lingerS: 1.2,
  draw: (stage) => (windLookOf(stage.preset) === 'gust' ? drawGust(stage) : drawTornado(stage)),
};
