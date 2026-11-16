import { breaksOutAsAura } from '@axe/domain/effect/effect-shake';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { layBlaze, layBurstSparks } from '@axe/domain/effect/scene/holy/aura-blaze';
import { drawBreakout } from '@axe/domain/effect/scene/holy/aura-breakout';
import {
  auraDetailOf,
  auraTonesOf,
  drawPebbles,
  drawUpdraft,
  layAuraHoop,
  layAuraRing,
} from '@axe/domain/effect/scene/holy/aura-parts';
import { floorMark, glow, lightBall } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An aura of fighting spirit. It breaks out all at once: the floor cracks under the piece, a ring
 * races out from it, sparks are flung up out of it, and a blaze of spirit leaps up about its body,
 * tongues of it standing close about the piece and licking straight up past its head, dark at their
 * rims, deep and full in their colour and gold within; tongues break off their tips and rise burning,
 * and pebbles lift off the floor and hang in the air. As its sound surges the blaze leaps again,
 * throwing sparks, a hoop of light runs up the body and a ring runs out over the floor. Then the blaze
 * draws in and sinks, and the pebbles are let fall.
 */

const LINGER_S = SCENE_LINGER_S.aura ?? 1;
/** When the aura surges, in seconds, each at the most a share of the playback: as its sound does. */
const SURGES_AT: readonly (readonly [number, number])[] = [
  [0.84, 0.41],
  [1.14, 0.56],
  [1.5, 0.74],
];
/** How long a surge takes to die away, and how long the leap it breaks out in, in seconds. */
const SURGE_S = 0.26;
const BREAKS_OUT_S = 0.35;
/** How long the blaze takes to spring up, and to sink at the end, in seconds. */
const CATCHES_S = 0.16;
const SINKS_S = 0.4;
/** How many tongues the blaze is made of where it keeps all its detail. */
const TONGUES = 16;

/** An aura of fighting spirit: see the header. */
function drawSpirit(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t < 0 || t >= ends) return drawn;
  const tones = auraTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.25;
  const surges = SURGES_AT.map(([seconds, share]) => Math.min(seconds, duration * share));
  const surge = surges.reduce((most, at) => (t < at ? most : Math.max(most, Math.exp(-(t - at) / SURGE_S))), 0);
  const breakout = Math.exp(-Math.max(0, t - CATCHES_S) / BREAKS_OUT_S);
  const caught = outCubic(within(t, 0, CATCHES_S));
  const sunk = within(t, duration - SINKS_S, duration);
  const burns = caught * (1 - sunk);
  const leaving = 1 - within(t, duration, ends);
  const spokes = (stage.seed % 17) / 17;
  const cracked = cell * 1.8 * outCubic(within(t, 0, 0.16));

  if (cracked > 1 && leaving > 0.01) {
    drawn.floor.push(floorMark('cracks', floor, cracked, 0.32, '#1d120c', 0.9 * leaving, 'color', spokes));
    drawn.floor.push(
      floorMark('cracks', floor, cracked * 0.97, 0.17, tones.rim, 0.9 * leaving * burns, 'color', spokes)
    );
    drawn.floor.push(floorMark('cracks', floor, cracked * 0.94, 0.1, tones.pale, leaving * burns, 'light', spokes));
  }
  layAuraRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.26, tones, within(t, 0, 0.4));
  layBurstSparks(drawn, floor, cell, t - 0.02, 26, stage.seed, tones);
  for (const [index, at] of surges.entries()) {
    layAuraRing(drawn, floor, cell * 0.4, cell * 2.2, cell * 0.16, tones, within(t, at, at + 0.4));
    layBurstSparks(drawn, floor, cell, t - at, 14, stage.seed + index + 1, tones);
    const climbed = within(t, at, at + 0.3);
    if (climbed > 0 && climbed < 1)
      layAuraHoop(
        drawn,
        { ...floor, z: floor.z + (stage.tall + cell * 0.6) * climbed },
        cell * (0.62 - 0.2 * climbed),
        cell * 0.09,
        tones,
        1 - climbed
      );
  }

  if (burns > 0.01) {
    const drawnIn = 1 - 0.45 * sunk;
    const leaps = 1 + 0.6 * breakout + 0.32 * surge;
    layBlaze(
      drawn,
      {
        foot: floor,
        cell,
        out: cell * 0.42 * drawnIn,
        tall: (stage.tall + cell * 1.2) * (0.35 + 0.65 * caught) * leaps * (1 - 0.7 * sunk),
        wide: cell * 0.4 * drawnIn,
        tongues: Math.round(TONGUES * auraDetailOf(stage.targets.length)),
        alpha: Math.min(1, burns * 1.6),
        seconds: t,
        seed: stage.seed,
      },
      tones
    );
    const body = { ...floor, z: floor.z + stage.tall * 0.55 };
    drawn.motes.push(glow(body, cell * (0.9 + 0.5 * surge), tones.gold, (0.12 + 0.3 * surge) * burns, forward));
    drawn.lights.push({ ...body, color: tones.body, strength: (0.8 + 0.7 * surge) * burns, reachPx: cell * 2.6 });
  }
  if (t < 0.12) {
    const heart = { ...floor, z: floor.z + cell * 0.5 };
    drawn.motes.push(lightBall(heart, cell * 0.9 * (1 - t / 0.12), tones.pale, 1 - t / 0.12, forward + 1));
    drawn.motes.push(glow(heart, cell * 2, '#ffffff', 0.7 * (1 - t / 0.12), forward));
  }
  drawUpdraft(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    14,
    [cell * 0.25, cell * 0.8],
    stage.tall + cell * 1.8,
    tones,
    burns,
    forward
  );
  drawPebbles(
    drawn,
    stage.seed,
    floor,
    cell,
    t,
    {
      count: 12,
      out: [cell * 0.55, cell * 1.35],
      high: [cell * 0.35, cell * 1.3],
      lifts: [0.05, 0.5],
      risesFor: 0.55,
      drops: duration - SINKS_S * 0.6,
      ends,
    },
    tones,
    forward
  );
  return drawn;
}

/** An aura: flames of spirit about a piece, or at the highest grade on its own the one that gathers and breaks out. */
export const aura: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (breaksOutAsAura(stage.preset) ? drawBreakout(stage, LINGER_S) : drawSpirit(stage)),
};
