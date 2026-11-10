import { type Choreography, nothingStaged, outCubic, within } from '@axe/domain/effect/scene/choreography';
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
  thrownRocks,
  thrownSparks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * What strikes the ground: an impact, a flash where it lands and a shock ring and dust thrown out,
 * grit and sparks flying; rubble, great rocks falling out of the air onto the target and bursting
 * into stones and dust as they strike; and an upheaval, spikes of stone bursting up out of the floor
 * round the target, standing a moment, and crumbling away into rocks and dust over cracked ground.
 */

interface GroundThrow {
  readonly dust: readonly Cloud[];
  readonly bits: readonly Bit[];
  readonly sparks: readonly ThrownMote[];
}

const impactByStage = new Map<string, GroundThrow>();

/** An impact: see the header. */
export const impact: Choreography = {
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
    layShockRing(drawn, floor, cell * 0.25, cell * 2, cell * 0.12, ramp[5], t, 0.3);
    layDustBand(drawn, floor, cell * 1.8, cell * 0.15, ramp, t, 0.45);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
    for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
    drawFlashDisc(drawn, struck, cell * 0.8, ramp, t, 0.06);
    if (t < 0.1) drawn.lights.push({ ...struck, color: ramp[5], strength: 1.2 * (1 - t / 0.1), reachPx: cell * 2 });
    return drawn;
  },
};

interface RubbleThrow extends GroundThrow {
  readonly boulders: readonly {
    readonly from: Point;
    readonly size: number;
    readonly spin: number;
    readonly delay: number;
  }[];
}
const rubbleByStage = new Map<string, RubbleThrow>();

/** Rubble: see the header. */
export const rubble: Choreography = {
  lingerS: 1,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell } = stage;
    const lands = stage.blowsAt[0] ?? stage.duration * 0.08;
    const t = stage.seconds;
    const since = t - lands;
    const ends = stage.duration + 1;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const stone = mixColor(STONE, ramp[1], 0.2);
    const forward = cell * 0.5;
    const thrown = keptFor(rubbleByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      return {
        boulders: Array.from({ length: th.count(4) }, (_unused, index) => ({
          from: {
            x: floor.x + th.range(-0.5, 0.5) * cell,
            y: floor.y + th.range(-0.5, 0.5) * cell,
            z: floor.z + cell * th.range(4, 6),
          },
          size: th.range(0.45, 0.75),
          spin: th.range(-6, 6),
          delay: index * 0.06,
        })),
        dust: [...rollingDust(th, floor, th.count(12), [2, 5], [0.6, 0.9]), ...dustColumn(th, floor, th.count(5))],
        bits: [...thrownRocks(th, floor, th.count(12), [3, 6]), ...thrownGrit(th, floor, th.count(30))],
        sparks: [],
      };
    });
    // The boulders falling out of the air, each striking a moment after the one before.
    for (const boulder of thrown.boulders) {
      const falling = within(t, lands - 0.35 + boulder.delay, lands + boulder.delay);
      if (falling <= 0 || falling >= 1) continue;
      const at = {
        x: boulder.from.x,
        y: boulder.from.y,
        z: boulder.from.z + (floor.z + cell * boulder.size * 0.4 - boulder.from.z) * falling * falling,
      };
      drawn.motes.push({
        ...ball(at, cell * boulder.size, stone, 1, forward, boulder.spin),
        shape: 'chunk',
        spin: boulder.spin * t,
      });
    }
    if (since < 0) return drawn;
    drawn.floor.push(
      floorMark(
        'cracks',
        floor,
        cell * 1.3 * Math.min(1, since / 0.08),
        0.3,
        DUST,
        0.7 * (1 - within(t, ends - 0.4, ends)),
        'color',
        stage.seed % 89,
        stage.seed
      )
    );
    layShockRing(drawn, floor, cell * 0.3, cell * 2.4, cell * 0.14, mixColor(ramp[4], '#ffffff', 0.3), since, 0.35);
    layDustBand(drawn, floor, cell * 2.4, cell * 0.25, ramp, since, 0.6);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, since, cell, forward);
    for (const bit of thrown.bits)
      drawBit(drawn, { ...bit, color: mixColor(bit.color, ramp[1], 0.15) }, since, cell, ramp, forward);
    return drawn;
  },
};

interface Spike {
  readonly at: Point;
  readonly lean: Point;
  readonly tall: number;
  readonly wide: number;
  readonly delay: number;
}
interface UpheavalThrow extends GroundThrow {
  readonly spikes: readonly Spike[];
}
const upheavalByStage = new Map<string, UpheavalThrow>();

/** An upheaval: see the header. */
export const upheaval: Choreography = {
  lingerS: 1,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const bursts = stage.blowsAt[0] ?? duration * 0.12;
    const t = stage.seconds - bursts;
    const ends = duration + 1 - bursts;
    const crumbles = Math.max(0.6, duration * 0.65 - bursts);
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const stone = mixColor(STONE, ramp[1], 0.2);
    const forward = cell * 0.3;
    const thrown = keptFor(upheavalByStage, stageKey(stage, ends), () => {
      const th = throwerFor(stage, ends);
      const count = th.count(8);
      const spikes = Array.from({ length: count }, (_unused, index) => {
        const turn = ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
        const out = th.range(0.2, 0.7) * cell;
        const tilt = th.range(0.1, 0.45);
        return {
          at: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
          lean: { x: Math.cos(turn) * tilt, y: Math.sin(turn) * tilt, z: 1 },
          tall: th.range(0.7, 1.5),
          wide: th.range(0.25, 0.42),
          delay: th.range(0, 0.15),
        };
      });
      return {
        spikes,
        dust: [...rollingDust(th, floor, th.count(12), [1.5, 4], [0.6, 0.9]), ...dustColumn(th, floor, th.count(4))],
        bits: [...thrownRocks(th, floor, th.count(10), [2.5, 5]), ...thrownGrit(th, floor, th.count(26))].map(
          (bit) => ({ ...bit, mote: { ...bit.mote, bornAt: bit.mote.bornAt + crumbles } })
        ),
        sparks: [],
      };
    });
    if (t < 0) {
      // The ground trembling before it breaks: dust shaken up and cracks opening.
      const shaking = within(stage.seconds, 0, bursts);
      drawn.floor.push(
        floorMark('cracks', floor, cell * 1.2 * shaking, 0.2, DUST, 0.6 * shaking, 'color', stage.seed % 89, stage.seed)
      );
      return drawn;
    }
    const clearing = 1 - within(t, ends - 0.4, ends);
    drawn.floor.push(
      floorMark('cracks', floor, cell * 1.5, 0.3, DUST, 0.75 * clearing, 'color', stage.seed % 89, stage.seed)
    );
    layShockRing(drawn, floor, cell * 0.3, cell * 2.4, cell * 0.14, mixColor(ramp[4], '#ffffff', 0.3), t, 0.4);
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
    // The spikes of stone: bursting up, standing, then crumbling away.
    const crumbling = within(t, crumbles, crumbles + 0.25);
    if (crumbling < 1) {
      for (const [colour, wide, high] of [
        [mixColor(stone, '#000000', 0.45), 1.12, 1.03],
        [stone, 1, 1],
        [mixColor(stone, '#ffffff', 0.25), 0.5, 0.9],
      ] as const) {
        for (const spike of thrown.spikes) {
          const grown = outCubic(within(t, spike.delay, spike.delay + 0.1));
          if (grown <= 0) continue;
          const tall = cell * spike.tall * grown * high * (1 - crumbling * 0.7);
          const width = cell * spike.wide * wide;
          const reach = Math.max(tall - width, 2);
          const length = Math.hypot(spike.lean.x, spike.lean.y, 1);
          const way = { x: spike.lean.x / length, y: spike.lean.y / length, z: 1 / length };
          drawn.motes.push({
            x: spike.at.x + way.x * tall,
            y: spike.at.y + way.y * tall,
            z: spike.at.z + way.z * tall,
            size: width,
            color: colour,
            alpha: 1 - crumbling,
            blend: 'color',
            shape: 'tongue',
            velocity: { x: way.x * reach, y: way.y * reach, z: way.z * reach },
            trail: 1,
            variant: spike.tall * 7,
            forward,
          });
        }
      }
    }
    for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
    if (t < 0.12)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell,
        color: ramp[4],
        strength: 0.8 * (1 - t / 0.12),
        reachPx: cell * 2,
      });
    return drawn;
  },
};
