import { type Choreography } from '@axe/domain/effect/scene/choreography';
import { BOLT_LINGER_S, detailOf } from '@axe/domain/effect/scene/storm/bolt-parts';
import { drawSnap } from '@axe/domain/effect/scene/storm/bolt-snap';
import { drawStorm } from '@axe/domain/effect/scene/storm/bolt-storm';
import { drawStrike } from '@axe/domain/effect/scene/storm/bolt-strike';
import { boltLookOf } from '@axe/domain/effect/thunder-looks';

/*
 * Lightning made to strike, drawn by its grade: a snap from the caster's hand, a strike out of the
 * sky, and a storm that stands a column of lightning on its target.
 */

/** A bolt of lightning: see the header. */
export const bolt: Choreography = {
  lingerS: BOLT_LINGER_S,
  draw: (stage) => {
    const look = boltLookOf(stage.preset);
    return look === 'snap' ? drawSnap(stage) : look === 'storm' ? drawStorm(stage) : drawStrike(stage);
  },
};

/**
 * The bolt a shot of lightning lands in: the least of them, dropped a short way out of the air onto
 * where the shot struck, however high the grade of the shot, and the plainer the more shots of a
 * volley land together.
 */
export const shotBolt: Choreography = {
  lingerS: BOLT_LINGER_S,
  draw: (stage) => drawSnap({ ...stage, origin: null }, detailOf(stage) / stage.preset.shotCount),
};
