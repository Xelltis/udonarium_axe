import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type FireBall, SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  fallPointAt,
  fallShareAt,
  fallSpeedAt,
  type MeteorFall,
  rockSizeAt,
} from '@axe/domain/effect/scene/meteor/meteor-fall';
import { fireTongue } from '@axe/domain/effect/scene/meteor/meteor-rock';
import { acrossOf, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * What a meteor sheds as it falls, left behind it along its way: gouts of flame torn off the rock,
 * swelling as they cool, half of them turning to smoke that hangs where the rock passed; sparks flung
 * aside, which fall and bounce; and embers that drift up and die. Each is thrown once, at the moment
 * the rock is where it is shed, from the seed of the cast.
 */

/** How many of each a meteor of the middle grade sheds in a second of its fall. */
export const METEOR_SHEDS_A_SECOND = { gouts: 48, sparks: 36, embers: 18 } as const;
/** The share of the gouts that turn to smoke. */
const SMOKES = 0.5;

/** All a meteor sheds over its fall, on the effect's own clock. */
export interface MeteorShed {
  readonly gouts: readonly FireBall[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
}

/**
 * Throws all a meteor sheds over its fall, `thin` of what one alone sheds: the meteors of a volley
 * fall together and each sheds the less for it.
 */
export function shedAlong(th: Thrower, fall: MeteorFall, thin: number): MeteorShed {
  const U = fall.unit;
  const lasts = Math.max(fall.landsAt - fall.fallsAt, 0.001);
  const { side, lift } = acrossOf(fall.way);
  /** The moments `count` things are shed at, spread evenly over the fall and each a little off its turn. */
  const moments = (count: number) =>
    Array.from({ length: count }, (_unused, index) => fall.fallsAt + (lasts * (index + th.range(0, 1))) / count);
  /** What is shed at a moment: from the rock's tail, dragged a share of the rock's own pace along and flung aside. */
  const shedAt = (bornAt: number, dragged: number, aside: number) => {
    const along = fallShareAt(fall, bornAt);
    const rock = rockSizeAt(fall, along);
    const from = fallPointAt(fall, along);
    const round = th.range(0, Math.PI * 2);
    const out = { cos: Math.cos(round), sin: Math.sin(round) };
    const pace = fallSpeedAt(fall, bornAt) * dragged;
    const behind = rock * th.range(0.1, 0.5);
    return {
      rock,
      x: from.x - fall.way.x * behind + (side.x * out.cos + lift.x * out.sin) * rock * 0.3,
      y: from.y - fall.way.y * behind + (side.y * out.cos + lift.y * out.sin) * rock * 0.3,
      z: from.z - fall.way.z * behind + (side.z * out.cos + lift.z * out.sin) * rock * 0.3,
      vx: fall.way.x * pace + (side.x * out.cos + lift.x * out.sin) * aside,
      vy: fall.way.y * pace + (side.y * out.cos + lift.y * out.sin) * aside,
      vz: fall.way.z * pace + (side.z * out.cos + lift.z * out.sin) * aside,
    };
  };

  const gouts = moments(th.count(METEOR_SHEDS_A_SECOND.gouts * lasts * thin)).map((bornAt): FireBall => {
    const shed = shedAt(bornAt, th.range(0.12, 0.35), th.range(0.3, 1.6) * U);
    const smokes = th.chance(SMOKES);
    const { rock, ...thrown } = shed;
    return {
      mote: th.mote({
        ...thrown,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 0.9 : 0.42, smokes ? 1.5 : 0.8),
        gravity: -th.range(0.8, 2) * U,
        drag: 3.2,
        bounce: 0,
      }),
      size: (rock / U) * th.range(0.45, 0.8),
      burns: smokes ? th.range(0.4, 0.55) : 1,
      variant: th.range(0, 6),
      taper: -0.5,
    };
  });
  const sparks = moments(th.count(METEOR_SHEDS_A_SECOND.sparks * lasts * thin)).map((bornAt) => {
    const { rock: _rock, ...thrown } = shedAt(bornAt, 0.25, th.range(1.2, 3.5) * U);
    return th.mote({
      ...thrown,
      bornAt,
      life: th.lifeOf(bornAt, 0.25, 0.55),
      gravity: th.fall,
      drag: 2,
      bounce: 0.4,
    });
  });
  const embers = moments(th.count(METEOR_SHEDS_A_SECOND.embers * lasts * thin)).map((bornAt) => {
    const { rock: _rock, ...thrown } = shedAt(bornAt, 0.1, th.range(0.3, 1.2) * U);
    return th.mote({
      ...thrown,
      bornAt,
      life: th.lifeOf(bornAt, 0.8, 1.5),
      gravity: -th.range(0.2, 0.8) * U,
      drag: 2.2,
      bounce: 0,
    });
  });
  return { gouts, sparks, embers };
}

/**
 * Draws the gouts of flame a meteor has shed at a moment: each a tongue streaming back the way the
 * rock came and rising as it burns, a deep colour laid for all of them before the hotter one, so
 * they run together into the rock's wake; one that turns to smoke fades into a shred of it that
 * swells and rises where the rock passed.
 */
export function drawShedFire(
  drawn: Staged,
  gouts: readonly FireBall[],
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number,
  back: Point
): void {
  for (const pass of [0, 1]) {
    for (const gout of gouts) {
      const now = moteAt(gout.mote, t);
      if (!now) continue;
      const age = now.age;
      const flowed = (t - gout.mote.bornAt) * 5 + gout.variant * 7;
      if (age < gout.burns) {
        const burnt = age / gout.burns;
        const size = cell * gout.size * (1 + 0.6 * burnt);
        const lean = { x: back.x, y: back.y, z: back.z + 0.5 + burnt };
        const far = Math.hypot(lean.x, lean.y, lean.z);
        const way = { x: lean.x / far, y: lean.y / far, z: lean.z / far };
        const root = { x: now.x - way.x * size * 0.5, y: now.y - way.y * size * 0.5, z: now.z - way.z * size * 0.5 };
        const alpha = gout.burns < 1 ? 1 - within(burnt, 0.6, 1) : 1 - burnt * burnt * burnt;
        if (pass === 0) {
          const color = ramp[burnt < 0.5 ? 2 : 1];
          drawn.motes.push(
            fireTongue(root, way, size * 1.25, size * 2.8, flowed, color, undefined, alpha, forward, gout.variant)
          );
        } else if (burnt < 0.6) {
          const color = ramp[burnt < 0.25 ? 4 : 3];
          drawn.motes.push(
            fireTongue(root, way, size * 0.8, size * 1.9, flowed, color, undefined, alpha, forward, gout.variant)
          );
        }
      }
      if (pass > 0 || gout.burns >= 1 || age < gout.burns * 0.6) continue;
      const smoked = within(age, gout.burns * 0.6, 1);
      const size = cell * gout.size * (1.1 + 1.3 * smoked);
      const alpha = Math.min(within(smoked, 0, 0.2), 1 - smoked) * 0.6;
      const up = { x: back.x * 0.3, y: back.y * 0.3, z: 0.95 };
      drawn.motes.push({
        ...fireTongue(
          now,
          up,
          size,
          size * 2.2,
          flowed * 0.4,
          mixColor(SMOKE, ramp[0], 0.25),
          undefined,
          alpha,
          forward,
          gout.variant
        ),
        shape: 'wisp',
      });
    }
  }
}
