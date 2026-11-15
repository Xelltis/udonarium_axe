import { orbLookOf } from '@axe/domain/effect/dark-looks';
import type { Choreography } from '@axe/domain/effect/scene/choreography';
import { drawEclipse } from '@axe/domain/effect/scene/dark/eclipse';
import { drawOrb } from '@axe/domain/effect/scene/dark/orb';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/** A black sun: a sphere that clamps onto its target and bursts, and at the highest grade an eclipse hung over the table. */
export const darkorb: Choreography = {
  lingerS: SCENE_LINGER_S.darkorb ?? 1.6,
  draw: (stage) => (orbLookOf(stage.preset) === 'eclipse' ? drawEclipse(stage) : drawOrb(stage)),
};

/** What a shot or a blade that lands in a black sun lands in: the bursting of its sphere, whatever its grade. */
export const struckOrb: Choreography = { lingerS: darkorb.lingerS, draw: drawOrb };
