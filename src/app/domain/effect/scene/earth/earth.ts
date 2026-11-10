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
import {
  acrossOf,
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
 * What strikes the ground: an impact, a flash where it lands and a shock ring and dust thrown out,
 * grit and sparks flying; rubble, the ground bursting open under the target and blowing earth, stones
 * and boulders up out of it; and an upheaval, hard blades of stone bursting up out of the floor round
 * the target, standing a moment, and crumbling away into rocks and dust over cracked ground.
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
 * Rubble: the ground under the target shakes and cracks open, then bursts up through two or three
 * vents one after another, each a column of earth and dust with stones and boulders shot up out of
 * it, the cracks glowing with its colour; the stones fall back, bounce and lie, and the dust rolls out
 * over the ground and settles.
 */
export const rubble: Choreography = {
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
      ].slice(0, Math.max(1, Math.min(3, th.count(3))));
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
      // The ground shaking before it bursts: cracks running out and dust shaken off it.
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
      const count = th.count(7);
      const spikes = Array.from({ length: count }, (_unused, index) => {
        const turn = ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
        const outer = index % 3 === 2;
        const out = (outer ? th.range(0.9, 1.3) : th.range(0.15, 0.7)) * cell;
        const tilt = outer ? th.range(0.3, 0.6) : th.range(0.1, 0.4);
        return {
          at: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
          lean: { x: Math.cos(turn) * tilt, y: Math.sin(turn) * tilt, z: 1 },
          tall: outer ? th.range(0.8, 1.2) : th.range(1.3, 2.1),
          wide: outer ? th.range(0.3, 0.42) : th.range(0.42, 0.6),
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
    layShockRing(drawn, floor, cell * 0.3, cell * 2.8, cell * 0.18, hueOf(ramp), t, 0.45);
    drawn.motes.push(
      ...starBurst({ ...floor, z: floor.z + cell * 0.4 }, cell * 2, hueOf(ramp), t / 0.25, forward * 1.4, 6, stage.seed)
    );
    // The cracks glow with its colour as the stone bursts up.
    if (t < 0.8)
      drawn.floor.push(
        floorMark('cracks', floor, cell * 1.5, 0.14, hueOf(ramp), 1 - t / 0.8, 'light', stage.seed % 89, stage.seed)
      );
    for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
    // The spikes of stone: bursting up past their height and settling, standing, then sinking away
    // as they crumble. Each is a hard blade of rock seen face on: its body in shadow, its lit face
    // and a bright edge down one side, so it reads as stone.
    const crumbling = within(t, crumbles, crumbles + 0.3);
    if (crumbling < 1) {
      for (const spike of thrown.spikes) {
        const shooting = within(t, spike.delay, spike.delay + 0.12);
        if (shooting <= 0) continue;
        const grown = Math.min(1.12, outCubic(shooting) + 0.12 * Math.sin(Math.PI * shooting));
        const tall = cell * spike.tall * grown * (1 - crumbling * 0.75);
        const width = cell * spike.wide;
        const length = Math.hypot(spike.lean.x, spike.lean.y, 1);
        const way = { x: spike.lean.x / length, y: spike.lean.y / length, z: 1 / length };
        const { side } = acrossOf(way);
        const along = (share: number, aside: number): Point => ({
          x: spike.at.x + way.x * tall * share + side.x * aside,
          y: spike.at.y + way.y * tall * share + side.y * aside,
          z: spike.at.z + way.z * tall * share + side.z * aside,
        });
        const alpha = 1 - crumbling;
        drawn.ribbons.push(
          {
            points: [along(-0.05, 0), along(0.45, 0), along(1, 0)],
            widths: [width, width * 0.7, 0],
            color: mixColor(stone, '#000000', 0.28),
            alpha,
            blend: 'color',
          },
          {
            points: [along(-0.05, width * 0.22), along(0.45, width * 0.16), along(0.97, width * 0.02)],
            widths: [width * 0.5, width * 0.36, 0],
            color: mixColor(stone, '#ffffff', 0.42),
            alpha,
            blend: 'color',
          },
          {
            points: [along(0, width * 0.46), along(1, 0)],
            widths: [width * 0.07, 0],
            color: mixColor(stone, '#ffffff', 0.7),
            alpha: alpha * 0.9,
            blend: 'color',
          }
        );
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
