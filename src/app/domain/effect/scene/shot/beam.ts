import { beamLookOf } from '@axe/domain/effect/beam-looks';
import { drawColossal } from '@axe/domain/effect/scene/beam/colossal';
import { GREAT_BEAM } from '@axe/domain/effect/scene/beam/great-beam';
import { drawLaser, LASER_LINGER_S } from '@axe/domain/effect/scene/beam/laser';
import { PRISM_BEAM } from '@axe/domain/effect/scene/beam/prism-beam';
import { type Choreography } from '@axe/domain/effect/scene/choreography';

/*
 * The beams poured from the caster onto the target: the great beam, a colossal body of light that
 * gathers, is let go and washes through its target and on beyond it, drawn as one body of its colour
 * or, where its particles say so, as a braid of many hues; and the laser, a thin searing line that
 * cuts its way along the floor to its target and burns there.
 */

/** How long what a great beam leaves stays after its playback, in seconds: its embers drifting, its trench cooling. */
const GREAT_LINGER_S = 2.2;

/** A great beam: 極太ビーム, and as a braid of many hues 極彩ビーム. */
export const beam: Choreography = {
  lingerS: GREAT_LINGER_S,
  draw: (stage) => drawColossal(stage, beamLookOf(stage.preset) === 'prism' ? PRISM_BEAM : GREAT_BEAM, GREAT_LINGER_S),
};

/** A laser: レーザー照射. */
export const raybeam: Choreography = { lingerS: LASER_LINGER_S, draw: drawLaser };
