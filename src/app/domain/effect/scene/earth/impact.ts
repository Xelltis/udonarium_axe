import { type Choreography, nothingStaged, outCubic, type Stage, within } from '@axe/domain/effect/scene/choreography';
import { earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import {
  bearingOf,
  drawSlab,
  earthTonesOf,
  layCrescent,
  layDent,
  layFissure,
  type Slab,
  throwSlabs,
} from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, drawCloud, drawSpark, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, lightBall, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An impact: the ground stamped on at a point. A flat white flash lies over the floor for an instant;
 * crescents of force race out along it, the greater on the way the blow was struck and the lesser
 * back, each kicking dust up behind it; the paving about the point is levered up in slabs as they
 * pass and falls back tilted; rocks, the heavy ones low, and grit fan out, bounce once and lie; earth
 * stands up in a column and sifts down. What is left is a dent with a raised rim, the cracks run out
 * from it glowing and going cold, and the rubble, until the look clears.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.impact ?? 1.2;
/** How far the greater crescent races, in cells, how long it takes, and how wide either side of its way it is bowed, in radians. */
export const IMPACT_FRONT = { reach: 2.4, lastsS: 0.6, spread: 1.05 } as const;
/** The lesser crescent, thrown back the other way a moment later. */
const BACK_FRONT = { reach: 1.7, lastsS: 0.5, spread: 0.85, afterS: 0.04 } as const;
/** How long the flat white flash lies on the floor, in seconds. */
const FLASH_S = 0.07;
/** How long the cracks take to go cold, and how long before it clears everything left starts to fade, in seconds. */
const COOLS_S = 1.6;
const CLEARS_S = 0.5;
/** How many of each an impact of the middle grade throws. */
export const IMPACT_THROWS = {
  rocks: 16,
  heavy: 5,
  grit: 100,
  slabs: 9,
  dust: 22,
  column: 16,
  skirt: 10,
  sparks: 14,
  jets: 16,
} as const;

interface ImpactThrow {
  readonly rocks: readonly Rock[];
  readonly slabs: readonly Slab[];
  readonly dust: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly fissures: readonly { readonly turn: number; readonly long: number; readonly seed: number }[];
}

const impactByStage = new Map<string, ImpactThrow>();

/** The way an impact is struck, in radians over the floor: away from its caster, or a bearing of its own with none. */
function struckToward(stage: Stage): number {
  return bearingOf(stage.origin, stage, stage.cell * 0.3) ?? ((stage.seed % 360) * Math.PI) / 180;
}

function throwImpact(stage: Stage, floor: Point, toward: number, ends: number): ImpactThrow {
  const th = throwerFor(stage, ends);
  const tones = earthTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const fan = { toward, spread: IMPACT_FRONT.spread, share: 0.72 };
  const speed = IMPACT_FRONT.reach / IMPACT_FRONT.lastsS;
  return {
    rocks: [
      ...throwRocks(th, floor, th.count(IMPACT_THROWS.heavy), {
        size: [0.3, 0.46],
        up: [2.2, 3.6],
        out: [1.6, 3],
        bornAt: [0, 0.04],
        fan,
        bounce: 0.3,
      }),
      ...throwRocks(th, floor, th.count(IMPACT_THROWS.rocks), {
        size: [0.13, 0.26],
        up: [3, 6.5],
        out: [1.2, 4.2],
        bornAt: [0, 0.05],
        fan,
      }),
      ...throwRocks(th, floor, th.count(IMPACT_THROWS.grit), {
        size: [0.04, 0.08],
        up: [2, 7.5],
        out: [0.8, 5.2],
        bornAt: [0, 0.06],
        fan,
        bounce: 0.25,
      }),
    ],
    slabs: [
      ...throwSlabs(th, floor, th.count(IMPACT_THROWS.slabs * 0.6), [0.62, 1.05], 0, speed * 1.6, {
        toward,
        spread: IMPACT_FRONT.spread,
      }),
      ...throwSlabs(th, floor, th.count(IMPACT_THROWS.slabs * 0.4), [0.55, 0.85], BACK_FRONT.afterS, speed * 1.6, {
        toward: toward + Math.PI,
        spread: BACK_FRONT.spread,
      }),
    ],
    dust: [
      ...kickedDust(th, floor, th.count(IMPACT_THROWS.dust * 0.6), tones.dust, {
        speed: [3, 7.5],
        size: [0.5, 0.8],
        bornAt: [0, 0.1],
        fan: { toward, spread: IMPACT_FRONT.spread },
      }),
      ...kickedDust(th, floor, th.count(IMPACT_THROWS.dust * 0.4), tones.dust, {
        speed: [2.4, 5.5],
        size: [0.45, 0.7],
        bornAt: [BACK_FRONT.afterS, 0.12],
        fan: { toward: toward + Math.PI, spread: BACK_FRONT.spread },
      }),
      ...kickedDust(th, floor, th.count(IMPACT_THROWS.jets), tones.sand, {
        speed: [6, 12],
        size: [0.3, 0.5],
        bornAt: [0, 0.03],
        rise: [0.5, 3.5],
        from: 0.2,
        alpha: 0.75,
        life: [0.3, 0.55],
        jet: 1.5,
      }),
      ...kickedDust(th, floor, th.count(IMPACT_THROWS.skirt), tones.dust, {
        speed: [0.8, 2.2],
        size: [0.55, 0.85],
        bornAt: [0, 0.1],
        alpha: 0.5,
      }),
      ...earthPlumes(th, floor, th.count(IMPACT_THROWS.column), tones.dust, {
        rise: [4, 9],
        bornAt: [0, 0.14],
        long: 1.7,
      }),
    ],
    sparks: thrownSparks(
      th,
      { ...floor, z: floor.z + stage.cell * 0.1 },
      th.count(IMPACT_THROWS.sparks),
      [3, 8],
      [0, 0.02]
    ),
    fissures: Array.from({ length: 5 }, (_unused, index) => ({
      turn: toward + (index === 0 ? 0 : (index / 5) * Math.PI * 2 + th.range(-0.35, 0.35)),
      long: index === 0 ? th.range(1.9, 2.3) : th.range(0.9, 1.6),
      seed: stage.seed + index * 31,
    })),
  };
}

/** An impact: see the header. */
export const impact: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const lands = stage.blowsAt[0] ?? 0;
    const t = stage.seconds - lands;
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const tones = earthTonesOf(ramp);
    if (t < 0) {
      const gathering = within(stage.seconds, Math.max(0, lands - 0.12), lands);
      if (gathering > 0)
        drawn.floor.push(
          floorMark('disc', floor, cell * (1.5 - gathering), 1, tones.earth, 0.35 * gathering, 'color', 0)
        );
      return drawn;
    }
    const ends = stage.duration + LINGER_S - lands;
    const toward = struckToward(stage);
    const thrown = keptFor(impactByStage, stageKey(stage, ends), () => throwImpact(stage, floor, toward, ends));
    const clearing = 1 - within(t, ends - CLEARS_S, ends);
    const heat = Math.pow(Math.max(0, 1 - t / COOLS_S), 1.5);

    const run = outCubic(within(t, 0, 0.12));
    for (const fissure of thrown.fissures) {
      const far = cell * fissure.long * run;
      const to = { x: floor.x + Math.cos(fissure.turn) * far, y: floor.y + Math.sin(fissure.turn) * far, z: floor.z };
      layFissure(drawn, floor, to, cell * 0.13, tones, heat, clearing, fissure.seed);
    }
    layDent(drawn, floor, cell * 0.72 * Math.min(1, t / 0.05 + 0.3), tones, clearing, stage.seed);
    if (heat > 0.02) drawn.floor.push(floorMark('disc', floor, cell * 0.9, 1, tones.glow, 0.5 * heat, 'light', 0));
    for (const slab of thrown.slabs) drawSlab(drawn, slab, t, cell, tones, clearing);

    const racing = within(t, 0, IMPACT_FRONT.lastsS);
    if (racing < 1) {
      layCrescent(
        drawn,
        floor,
        toward,
        IMPACT_FRONT.spread,
        cell * (0.3 + (IMPACT_FRONT.reach - 0.3) * outCubic(racing)),
        cell * 0.5 * (1 - racing * 0.5),
        tones,
        Math.min(1, (1 - racing) * 1.8),
        t * 6 + (stage.seed % 13)
      );
    }
    const back = within(t, BACK_FRONT.afterS, BACK_FRONT.afterS + BACK_FRONT.lastsS);
    if (back > 0 && back < 1) {
      layCrescent(
        drawn,
        floor,
        toward + Math.PI,
        BACK_FRONT.spread,
        cell * (0.3 + (BACK_FRONT.reach - 0.3) * outCubic(back)),
        cell * 0.38 * (1 - back * 0.5),
        tones,
        Math.min(1, (1 - back) * 1.8),
        t * 6 + (stage.seed % 7)
      );
    }
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, 0);
    for (const rock of thrown.rocks) drawRock(drawn, rock, t, cell, tones);
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, 0);

    if (t < FLASH_S) {
      const left = 1 - t / FLASH_S;
      const struck = { ...floor, z: floor.z + cell * 0.12 };
      drawn.floor.push(floorMark('disc', floor, cell * (1.3 + 0.6 * (1 - left)), 1, '#ffffff', 0.7 * left, 'light', 0));
      drawn.floor.push(floorMark('disc', floor, cell * 0.8, 1, '#ffffff', left, 'light', 0));
      drawn.motes.push(lightBall(struck, cell * 0.7 * (0.7 + 0.3 * left), '#ffffff', left, cell * 0.4));
      drawn.motes.push({ ...glow(struck, cell * 0.5, '#fff4dc', left, cell * 0.4), shape: 'flare', trail: 7, spin: 0 });
      drawn.motes.push({
        ...glow({ ...struck, z: struck.z + cell * 0.3 }, cell * 0.22, '#ffffff', left, cell * 0.4),
        shape: 'flare',
        trail: 4,
        spin: Math.PI / 2,
      });
    }
    if (t < 0.3)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 0.6,
        color: tones.hot,
        strength: 1.4 * (1 - t / 0.3),
        reachPx: cell * 2.6,
      });
    return drawn;
  },
};
