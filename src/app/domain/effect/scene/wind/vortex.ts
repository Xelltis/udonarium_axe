import { isBlizzard } from '@axe/domain/effect/ice-looks';
import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { drawBlizzard } from '@axe/domain/effect/scene/ice/blizzard';
import { drawGust } from '@axe/domain/effect/scene/wind/gust';
import { drawStorm } from '@axe/domain/effect/scene/wind/storm';
import { drawTornado } from '@axe/domain/effect/scene/wind/tornado';
import { isStormWind, windLookOf } from '@axe/domain/effect/wind-looks';

/**
 * A whirlwind: the least of them a gust thrown from its caster onto the target, and any other a
 * tornado standing over it; see {@link windLookOf}. One that carries frost is a blizzard, whatever
 * its grade; see {@link isBlizzard}; and one that carries lightning a storm; see {@link isStormWind}.
 */
export const vortex: Choreography = {
  lingerS: 1.2,
  draw: (stage) =>
    isBlizzard(stage.preset)
      ? drawBlizzard(stage)
      : isStormWind(stage.preset)
        ? drawStorm(stage)
        : windLookOf(stage.preset) === 'gust'
          ? drawGust(stage)
          : drawTornado(stage),
};
