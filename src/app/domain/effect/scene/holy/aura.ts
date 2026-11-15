import { breaksOutAsAura } from '@axe/domain/effect/effect-shake';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { drawBreakout } from '@axe/domain/effect/scene/holy/aura-breakout';
import {
  auraDetailOf,
  auraTonesOf,
  drawPebbles,
  drawUpdraft,
  layAuraCracks,
  layAuraFlames,
  layAuraHoop,
  layAuraRing,
  ringOfFlames,
} from '@axe/domain/effect/scene/holy/aura-parts';
import { glow, haze } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An aura of fighting spirit. It catches all at once: the floor cracks under the piece and a ring
 * races out from it, and flames of spirit spring up in a ring about it and stream upwards, gold at
 * their hearts, a column of light in the middle of them. Pebbles lift off the floor and hang in the
 * air. As its sound surges the flames leap, a hoop of light runs up the body and a ring runs out over
 * the floor. Then the flames draw in and sink, and the pebbles are let fall.
 */

const LINGER_S = SCENE_LINGER_S.aura ?? 1;
/** When the aura surges, in seconds, each at the most a share of the playback: as its sound does. */
const SURGES_AT: readonly (readonly [number, number])[] = [
  [0.84, 0.41],
  [1.14, 0.56],
  [1.5, 0.74],
];
/** How long a surge takes to die away, in seconds. */
const SURGE_S = 0.26;
/** How long the flames take to spring up, and to sink at the end, in seconds. */
const CATCHES_S = 0.2;
const SINKS_S = 0.4;

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
  const caught = outCubic(within(t, 0, CATCHES_S));
  const sunk = within(t, duration - SINKS_S, duration);
  const burns = caught * (1 - sunk);
  const leaving = 1 - within(t, duration, ends);

  layAuraCracks(drawn, floor, cell * 1.8 * outCubic(within(t, 0, 0.16)), tones, leaving, burns, stage.seed);
  layAuraRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.22, tones, within(t, 0, 0.4));
  for (const at of surges) {
    layAuraRing(drawn, floor, cell * 0.4, cell * 2.2, cell * 0.16, tones, within(t, at, at + 0.4));
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
    const tall = (stage.tall + cell * 1.7) * (0.3 + 0.7 * caught) * (1 + 0.3 * surge) * (1 - 0.7 * sunk);
    const drawnIn = 1 - 0.45 * sunk;
    const detail = auraDetailOf(stage.targets.length);
    const outer = ringOfFlames(
      Math.round(10 * detail),
      cell * 0.46 * drawnIn,
      tall,
      cell * 0.52 * drawnIn,
      0.55,
      0.4,
      t,
      stage.seed
    );
    const inner = ringOfFlames(
      Math.round(5 * detail),
      cell * 0.22 * drawnIn,
      tall * 1.25,
      cell * 0.52 * drawnIn,
      0.85,
      0.75,
      t,
      stage.seed + 3
    );
    layAuraFlames(drawn, floor, [...outer, ...inner], tones, t, Math.min(1, burns * 1.6));
    const body = { ...floor, z: floor.z + stage.tall * 0.55 };
    drawn.motes.push(haze(body, cell * 1.7, tones.rim, 0.22 * burns, forward));
    drawn.motes.push(glow(body, cell * (1.4 + 0.6 * surge), tones.gold, (0.14 + 0.3 * surge) * burns, forward));
    drawn.lights.push({ ...body, color: tones.body, strength: (0.75 + 0.7 * surge) * burns, reachPx: cell * 2.6 });
  }
  if (t < 0.12)
    drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.4 }, cell * 3, '#ffffff', 0.8 * (1 - t / 0.12), forward));
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
