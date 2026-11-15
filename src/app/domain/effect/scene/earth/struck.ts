import { clamp } from '@axe/core/util/clamp';
import { type Choreography, nothingStaged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  drawFlashDisc,
  drawSpark,
  DUST,
  dustColumn,
  layDustBand,
  layShockRing,
  rollingDust,
  STONE,
  thrownGrit,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * What a shot or a blade strikes the ground with, where it lands with an impact or with rubble: an
 * impact, a flash where it lands and a shock ring and dust thrown out, grit and sparks flying; and
 * rubble, the ground bursting open under the target and blowing earth and stones up out of it. Each is
 * small and soon over, as the landing of an arrow or a bullet is; the looks of earth cast on their own
 * are another matter, and are drawn by the looks beside this one.
 */

interface GroundThrow {
  readonly dust: readonly Cloud[];
  readonly bits: readonly Bit[];
  readonly sparks: readonly ThrownMote[];
}

const impactByStage = new Map<string, GroundThrow>();

/** The impact a shot lands with: see the header. */
export const struckImpact: Choreography = {
  lingerS: 0.8,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const lands = stage.blowsAt[0] ?? 0;
    const t = stage.seconds - lands;
    if (t < 0) return drawn;
    const ends = stage.duration + 0.8 - lands;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const struck = { x: stage.x, y: stage.y, z: stage.z + cell * 0.5 };
    const forward = cell * 0.5;
    const thrown = keptFor(impactByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        dust: [...rollingDust(th, floor, th.count(8), [1.5, 4], [0.45, 0.7]), ...dustColumn(th, floor, th.count(3))],
        bits: thrownGrit(th, floor, th.count(18), [2, 5]),
        sparks: thrownSparks(th, struck, th.count(16), [3, 7], [0, 0.02]),
      };
    });
    drawn.floor.push(
      floorMark(
        'cracks',
        floor,
        cell * 0.9 * Math.min(1, t / 0.06),
        0.25,
        DUST,
        0.6 * (1 - within(t, ends - 0.3, ends)),
        'color',
        stage.seed % 89,
        stage.seed
      )
    );
    layShockRing(drawn, floor, cell * 0.25, cell * 2.4, cell * 0.16, hueOf(ramp), t, 0.35);
    layDustBand(drawn, floor, cell * 1.8, cell * 0.15, ramp, t, 0.45);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
    for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
    drawFlashDisc(drawn, struck, cell * 0.8, ramp, t, 0.06);
    drawn.motes.push(haze(struck, cell * 2, hueOf(ramp), 0.45 * Math.max(0, 1 - t / 0.4), forward));
    drawn.motes.push(...starBurst(struck, cell * 1.8, hueOf(ramp), t / 0.25, forward * 1.4, 6, stage.seed));
    if (t < 0.1) drawn.lights.push({ ...struck, color: ramp[5], strength: 1.2 * (1 - t / 0.1), reachPx: cell * 2 });
    return drawn;
  },
};

/** A vent the ground bursts open at, and when it bursts after the first. */
interface Vent {
  readonly at: Point;
  readonly delay: number;
}

const rubbleByStage = new Map<string, GroundThrow & { readonly vents: readonly Vent[] }>();

/** Stones shot up out of a vent, steeply, tumbling, falling back and bouncing where they land. */
function ventStones(
  th: Thrower,
  vent: Vent,
  count: number,
  rise: readonly [number, number],
  out: readonly [number, number],
  size: readonly [number, number]
): Bit[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const fast = th.range(out[0], out[1]) * U;
    const bornAt = vent.delay + th.range(0, 0.06);
    return {
      mote: th.mote({
        x: vent.at.x + th.range(-0.15, 0.15) * U,
        y: vent.at.y + th.range(-0.15, 0.15) * U,
        z: th.floorZ + 0.05 * U,
        vx: way.cos * fast,
        vy: way.sin * fast,
        vz: th.range(rise[0], rise[1]) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.4),
        gravity: th.fall,
        drag: 0.3,
        bounce: 0.3,
      }),
      size: th.range(size[0], size[1]),
      color: [mixColor(STONE, '#ffffff', 0.2), STONE, mixColor(STONE, '#000000', 0.3)][Math.floor(th.range(0, 2.99))],
      turnRate: th.range(-14, 14),
      variant: th.range(0, 6),
    };
  });
}

/** Earth blown up out of a vent in a column, thinning as it rises and spreads. */
function ventPlume(th: Thrower, vent: Vent, count: number): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const bornAt = vent.delay + th.range(0, 0.12);
    return {
      mote: th.mote({
        x: vent.at.x + th.range(-0.15, 0.15) * U,
        y: vent.at.y + th.range(-0.15, 0.15) * U,
        z: th.floorZ + th.range(0.1, 0.3) * U,
        vx: th.range(-0.5, 0.5) * U,
        vy: th.range(-0.5, 0.5) * U,
        vz: th.range(9, 14) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.2, 2),
        gravity: -0.1 * U,
        drag: 2.2,
        bounce: 0,
      }),
      size: th.range(0.8, 1.25),
      color: mixColor(DUST, '#7a5a3a', 0.35),
      alpha: 0.7,
      plume: 2.4,
    };
  });
}

/**
 * The rubble a shot lands with: the ground under the target shakes and cracks open, then bursts up through two or three
 * vents one after another, each a column of earth and dust with stones and boulders shot up out of
 * it, the cracks glowing with its colour; the stones fall back, bounce and lie, and the dust rolls out
 * over the ground and settles.
 */
export const struckRubble: Choreography = {
  lingerS: 1,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const erupts = stage.blowsAt[0] ?? stage.duration * 0.08;
    const t = stage.seconds;
    const since = t - erupts;
    const ends = stage.duration + 1;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const forward = cell * 0.5;
    const thrown = keptFor(rubbleByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      const spots = [
        { x: 0, y: 0 },
        { x: 0.6, y: -0.35 },
        { x: -0.55, y: 0.4 },
      ].slice(0, clamp(th.count(3), 1, 3));
      const vents = spots.map((spot, index) => ({
        at: { x: floor.x + spot.x * cell, y: floor.y + spot.y * cell, z: floor.z },
        delay: index * 0.09,
      }));
      return {
        vents,
        dust: [
          ...vents.flatMap((vent) => ventPlume(th, vent, th.count(5))),
          ...rollingDust(th, floor, th.count(12), [1.5, 4], [0.6, 0.9]),
        ],
        bits: vents.flatMap((vent) => [
          ...ventStones(th, vent, th.count(7), [8, 12], [0.2, 1.1], [0.16, 0.3]),
          ...ventStones(th, vent, th.count(2), [5, 7], [0.3, 0.8], [0.34, 0.5]),
          ...ventStones(th, vent, th.count(5), [7, 12], [0.3, 1.6], [0.06, 0.1]),
        ]),
        sparks: [],
      };
    });
    if (since < 0) {
      const shaking = within(t, 0, erupts);
      drawn.floor.push(
        floorMark('cracks', floor, cell * 1.4 * shaking, 0.2, DUST, 0.6 * shaking, 'color', stage.seed % 89, stage.seed)
      );
      return drawn;
    }
    const clearing = 1 - within(t, ends - 0.4, ends);
    drawn.floor.push(
      floorMark('cracks', floor, cell * 1.6, 0.3, DUST, 0.75 * clearing, 'color', stage.seed % 89, stage.seed)
    );
    if (since < 0.9) {
      drawn.floor.push(
        floorMark('cracks', floor, cell * 1.6, 0.14, hueOf(ramp), 1 - since / 0.9, 'light', stage.seed % 89, stage.seed)
      );
    }
    for (const vent of thrown.vents) {
      const opened = since - vent.delay;
      if (opened < 0) continue;
      if (opened < 0.3) {
        drawn.motes.push(
          haze({ ...vent.at, z: vent.at.z + cell * 0.3 }, cell * 1.4, DUST, 0.7 * (1 - opened / 0.3), forward)
        );
        drawn.motes.push(
          glow({ ...vent.at, z: vent.at.z + cell * 0.15 }, cell * 0.9, ramp[4], 0.8 * (1 - opened / 0.3), forward)
        );
      }
      drawn.floor.push(
        floorMark(
          'scorch',
          vent.at,
          cell * 0.45,
          1,
          mixColor(DUST, '#000000', 0.45),
          0.7 * clearing,
          'color',
          stage.seed % 13
        )
      );
    }
    layShockRing(drawn, floor, cell * 0.3, cell * 2.6, cell * 0.16, hueOf(ramp), since, 0.4);
    layDustBand(drawn, floor, cell * 2.4, cell * 0.25, ramp, since, 0.6);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, since, cell, forward);
    for (const bit of thrown.bits) drawBit(drawn, bit, since, cell, ramp, forward);
    if (since < 0.15)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell,
        color: ramp[4],
        strength: 0.9 * (1 - since / 0.15),
        reachPx: cell * 2.4,
      });
    return drawn;
  },
};
