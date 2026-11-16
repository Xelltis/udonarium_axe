import { quakeLookOf } from '@axe/domain/effect/earth-looks';
import type { Choreography, Stage, Staged } from '@axe/domain/effect/scene/choreography';
import { earthTonesOf } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawCaughtQuake, drawEarthquake } from '@axe/domain/effect/scene/earth/earthquake';
import { drawRift } from '@axe/domain/effect/scene/earth/rift';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/** How long a quake lingers after its playback, in seconds, while the cracks cool and the dust settles. */
const LINGER_S = SCENE_LINGER_S.quake ?? 1.8;

function drawQuake(stage: Stage, landing: boolean): Staged {
  const tones = earthTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  if (landing || quakeLookOf(stage.preset) === 'rift') return drawRift(stage, tones, LINGER_S, landing);
  return stage.index === 0 ? drawEarthquake(stage, tones, LINGER_S) : drawCaughtQuake(stage, tones, LINGER_S);
}

/**
 * A quake: a rift torn from the caster to each target below the highest grade, and at the highest over
 * an area the ground of all of it heaving three times; see {@link quakeLookOf}.
 */
export const quake: Choreography = { lingerS: LINGER_S, draw: (stage) => drawQuake(stage, false) };

/** What a shot or a blade that lands in a quake lands in: a rift torn open close before the target, whatever its grade. */
export const struckQuake: Choreography = { lingerS: LINGER_S, draw: (stage) => drawQuake(stage, true) };
