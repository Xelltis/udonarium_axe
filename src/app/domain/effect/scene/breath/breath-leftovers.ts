import { type BreathTiming } from '@axe/domain/effect/breath-timing';
import { chestOf } from '@axe/domain/effect/scene/breath/breath-cone';
import { type BreathLook } from '@axe/domain/effect/scene/breath/breath-looks';
import { drawSandDrift } from '@axe/domain/effect/scene/breath/breath-sand';
import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  billowingSmoke,
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  drawEmber,
  drawSpark,
  DUST,
  risingEmbers,
  SMOKE,
  STONE,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, glow, haze, type Point, smokePuff, type Thrower } from '@axe/domain/effect/scene/parts';
import { lightningRibbons } from '@axe/domain/effect/scene/storm/lightning';

/*
 * What a breath leaves on and about each piece it blows over, from the moment the stream reaches the
 * piece until the floor has cleared: fire leaves little fires burning on a scorch that cools; ice a
 * frost creeping out over the floor and a mist lying on it; poison stains where its drops fall and a
 * fog that clings; thunder forks leaping from the piece to the floor and to its neighbours, a scorch
 * and sparks; wind the dust and grit it tears off the floor downwind; sand a drift piled against the
 * piece's feet, heaps of it about and dust and grit scoured off it; darkness a disc of shadow and
 * black embers rising; and the breath that heals a ring of light, motes settling and rising again.
 */

/** A place on the floor near a target where something is left, and when. */
interface Spot {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** How large what is left there is, in cells. */
  readonly size: number;
  /** When it is left there, in seconds of the breath. */
  readonly at: number;
  readonly variant: number;
}

/** Everything a breath leaves about one target, thrown once. */
export interface Leftovers {
  readonly clouds: readonly Cloud[];
  readonly embers: readonly ThrownMote[];
  readonly sparks: readonly ThrownMote[];
  readonly bits: readonly Bit[];
  readonly spots: readonly Spot[];
}

/** What a target's leftovers are thrown and drawn with. */
export interface LeftoverSetting {
  readonly look: BreathLook;
  readonly timing: BreathTiming;
  readonly ramp: readonly string[];
  /** When the breath and all it leaves is gone, in seconds. */
  readonly ends: number;
  /** Which way the breath blows over the target, across the table, of length one. */
  readonly downwind: { readonly x: number; readonly y: number };
}

const INK = '#07030c';
const SICKLY = '#7fbf2a';

/** Throws what a breath leaves about the target of a stage. */
export function throwLeftovers(th: Thrower, stage: Stage, setting: LeftoverSetting): Leftovers {
  const { look, timing, downwind } = setting;
  const U = th.cell;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = chestOf({ ...stage, widthPx: U });
  const blown: readonly [number, number] = [timing.reachesAt, timing.spentAt];
  const spotsRound = (count: number, near: number, far: number, size: readonly [number, number]): Spot[] =>
    Array.from({ length: count }, (_unused, index) => {
      const way = th.outward();
      const out = th.range(near, far) * U;
      return {
        x: floor.x + way.cos * out,
        y: floor.y + way.sin * out,
        z: floor.z,
        size: th.range(size[0], size[1]),
        at: timing.reachesAt + 0.15 + ((timing.failsAt - timing.reachesAt) * index) / count + th.range(0, 0.1),
        variant: th.range(0, 6),
      };
    });
  switch (look.element) {
    case 'fire':
      return {
        clouds: look.fiery
          ? billowingSmoke(th, { ...floor, z: floor.z + 0.5 * U }, th.count(6), {
              bornAt: [timing.spentAt - 0.2, timing.spentAt + 0.9],
              life: [1.2, 1.8],
            })
          : [],
        embers: risingEmbers(th, { ...floor, z: floor.z + 0.3 * U }, th.count(14), [blown[0], blown[1] + 0.6], 0.5),
        sparks: thrownSparks(th, chest, th.count(16), [3, 7], blown),
        bits: [],
        spots: spotsRound(4, 0.45, 1.05, [0.16, 0.24]),
      };
    case 'ice':
      return {
        clouds: lyingMist(th, floor, th.count(8), blown, mixColor(setting.ramp[5], '#ffffff', 0.5)),
        embers: [],
        sparks: [],
        bits: [],
        spots: spotsRound(look.carries ? 6 : 0, 0.3, 1.1, [0.1, 0.16]),
      };
    case 'poison':
      return { clouds: [], embers: [], sparks: [], bits: [], spots: spotsRound(6, 0.35, 1.2, [0.15, 0.35]) };
    case 'thunder':
      return {
        clouds: [],
        embers: [],
        sparks: thrownSparks(th, chest, th.count(24), [3, 8], blown),
        bits: [],
        spots: spotsRound(3, 0.9, 1.7, [0.1, 0.1]),
      };
    case 'wind':
      return {
        clouds: blownDust(th, floor, th.count(10), blown, downwind),
        embers: [],
        sparks: [],
        bits: blownGrit(th, floor, th.count(8), blown, downwind),
        spots: [],
      };
    case 'sand':
      return {
        clouds: blownDust(th, floor, th.count(12), blown, downwind),
        embers: [],
        sparks: [],
        bits: blownGrit(th, floor, th.count(14), blown, downwind),
        spots: spotsRound(7, 0.35, 1.1, [0.2, 0.36]),
      };
    case 'dark':
      return {
        clouds: [],
        embers: risingEmbers(th, { ...floor, z: floor.z + 0.2 * U }, th.count(12), [blown[0], blown[1] + 0.8], 0.45),
        sparks: [],
        bits: [],
        spots: [],
      };
    case 'holy':
      return {
        clouds: [],
        embers: [
          ...settlingMotes(th, floor, th.count(16), blown),
          ...risingEmbers(th, { ...floor, z: floor.z + 0.2 * U }, th.count(12), [blown[1], blown[1] + 0.5], 0.5),
        ],
        sparks: [],
        bits: [],
        spots: [],
      };
  }
}

/** A mist lying low over the floor about a foot, drifting out slowly. */
function lyingMist(th: Thrower, floor: Point, count: number, blown: readonly [number, number], color: string): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const bornAt = th.range(blown[0] + 0.1, blown[1] + 0.5);
    return {
      mote: th.mote({
        x: floor.x + way.cos * th.range(0.1, 0.7) * U,
        y: floor.y + way.sin * th.range(0.1, 0.7) * U,
        z: floor.z + th.range(0.15, 0.3) * U,
        vx: way.cos * th.range(0.15, 0.5) * U,
        vy: way.sin * th.range(0.15, 0.5) * U,
        vz: 0,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.4),
        gravity: 0,
        drag: 0.6,
        bounce: 0,
      }),
      size: th.range(0.55, 0.85),
      color,
      alpha: 0.35,
    };
  });
}

/** Dust torn off the floor at a foot and carried away downwind. */
function blownDust(
  th: Thrower,
  floor: Point,
  count: number,
  blown: readonly [number, number],
  downwind: { readonly x: number; readonly y: number }
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const bornAt = th.range(blown[0], blown[1] + 0.2);
    const fast = th.range(2, 5) * U;
    const aside = th.range(-0.8, 0.8) * U;
    return {
      mote: th.mote({
        x: floor.x + th.range(-0.3, 0.3) * U,
        y: floor.y + th.range(-0.3, 0.3) * U,
        z: floor.z + th.range(0.08, 0.25) * U,
        vx: downwind.x * fast - downwind.y * aside,
        vy: downwind.y * fast + downwind.x * aside,
        vz: th.range(0.1, 0.7) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.8, 1.4),
        gravity: -0.15 * U,
        drag: 2,
        bounce: 0,
      }),
      size: th.range(0.45, 0.7),
      color: DUST,
      alpha: 0.3,
    };
  });
}

/** Grit torn off the floor at a foot and thrown downwind, tumbling. */
function blownGrit(
  th: Thrower,
  floor: Point,
  count: number,
  blown: readonly [number, number],
  downwind: { readonly x: number; readonly y: number }
): Bit[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const bornAt = th.range(blown[0], blown[1]);
    const fast = th.range(3, 6) * U;
    const aside = th.range(-1, 1) * U;
    return {
      mote: th.mote({
        x: floor.x + th.range(-0.3, 0.3) * U,
        y: floor.y + th.range(-0.3, 0.3) * U,
        z: floor.z + 0.05 * U,
        vx: downwind.x * fast - downwind.y * aside,
        vy: downwind.y * fast + downwind.x * aside,
        vz: th.range(1.5, 3.5) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.8, 1.4),
        gravity: th.fall,
        drag: 0.8,
        bounce: 0.3,
      }),
      size: th.range(0.05, 0.1),
      color: STONE,
      turnRate: th.range(-14, 14),
      variant: th.range(0, 6),
    };
  });
}

/** Motes of light let fall from over a foot, settling slowly down about it. */
function settlingMotes(th: Thrower, floor: Point, count: number, blown: readonly [number, number]): ThrownMote[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const out = th.range(0.1, 0.75) * U;
    const bornAt = th.range(blown[0], blown[1]);
    return th.mote({
      x: floor.x + way.cos * out,
      y: floor.y + way.sin * out,
      z: floor.z + th.range(1.1, 1.6) * U,
      vx: way.cos * th.range(0, 0.2) * U,
      vy: way.sin * th.range(0, 0.2) * U,
      vz: -th.range(0.5, 0.9) * U,
      bornAt,
      life: th.lifeOf(bornAt, 1.2, 1.8),
      gravity: 0.2 * U,
      drag: 0.4,
      bounce: 0,
    });
  });
}

/** Draws what a breath has left about the target of a stage at this moment of the target's own clock. */
export function drawLeftovers(drawn: Staged, stage: Stage, setting: LeftoverSetting, left: Leftovers): void {
  const { look, timing, ramp, ends } = setting;
  const { cell } = stage;
  const t = stage.seconds;
  if (t <= timing.reachesAt) return;
  const forward = cell * 0.4;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = chestOf({ ...stage, widthPx: cell });
  const blown = Math.min(
    within(t, timing.reachesAt, timing.reachesAt + 0.2),
    1 - within(t, timing.spentAt, timing.spentAt + 0.8)
  );
  const clearing = 1 - within(t, ends - 0.6, ends);
  const flicker = 0.85 + 0.15 * Math.sin(t * 29 + stage.seed);
  const mark = (stage.seed % 89) + 1;

  switch (look.element) {
    case 'fire': {
      const spread = cell * 0.85 * Math.min(1, (t - timing.reachesAt) / 0.5 + 0.3);
      const heat = Math.pow(1 - within(t, timing.spentAt, timing.spentAt + 1.4), 1.4);
      if (look.fiery) drawn.floor.push(floorMark('scorch', floor, spread, 1, SMOKE, 0.55 * clearing, 'color', mark));
      if (heat > 0) {
        drawn.floor.push(floorMark('disc', floor, cell * 2.2, 1, WARM, 0.3 * heat * flicker, 'light', 0));
        for (const [level, step] of [
          [0.1, 1],
          [0.4, 3],
          [0.75, 5],
        ] as const) {
          const share = 1.25 - level / heat;
          if (share > 0.05) {
            drawn.floor.push(
              floorMark('scorch', floor, spread * Math.min(1, share), 1, ramp[step], 0.8, 'light', mark)
            );
          }
        }
      }
      for (const spot of left.spots) drawLittleFire(drawn, spot, t, timing.spentAt + 1.5, cell, ramp, forward);
      break;
    }
    case 'ice': {
      const crept = within(t, timing.reachesAt, timing.failsAt);
      const reach = cell * (0.7 + 0.75 * crept);
      const frost = mixColor(ramp[4], '#ffffff', 0.6);
      drawn.floor.push(
        floorMark(
          'scorch',
          floor,
          reach,
          1,
          frost,
          0.5 * clearing * within(t, timing.reachesAt, timing.reachesAt + 0.3),
          'color',
          mark
        )
      );
      if (look.carries) {
        drawn.floor.push(floorMark('cracks', floor, reach * 1.15, 0.35, '#ffffff', 0.55 * clearing, 'color', mark));
      }
      drawn.floor.push(floorMark('disc', floor, cell * 1.4, 1, ramp[4], 0.08 * blown, 'light', 0));
      for (const spot of left.spots) {
        const glint = Math.sin(t * 7 + spot.variant * 4);
        if (t < spot.at || glint < 0.3) continue;
        drawn.motes.push({
          ...ball(
            { x: spot.x, y: spot.y, z: spot.z + cell * 0.06 },
            cell * spot.size,
            '#ffffff',
            glint * clearing,
            forward,
            0
          ),
          shape: 'star',
          spin: spot.variant,
        });
      }
      break;
    }
    case 'poison': {
      const stain = [mixColor(ramp[1], INK, 0.45), mixColor(SICKLY, INK, 0.5)];
      for (const [index, spot] of left.spots.entries()) {
        const falls = 0.25;
        if (t < spot.at - falls) continue;
        if (t < spot.at) {
          const fallen = (t - (spot.at - falls)) / falls;
          const drop = {
            x: chest.x + (spot.x - chest.x) * fallen,
            y: chest.y + (spot.y - chest.y) * fallen,
            z: chest.z + (spot.z - chest.z) * fallen * fallen,
          };
          drawn.motes.push(ball(drop, cell * 0.09, mixColor(SICKLY, ramp[2], 0.2), 1, forward, spot.variant));
          continue;
        }
        const spreads = within(t, spot.at, spot.at + 0.25);
        drawn.floor.push(
          floorMark(
            'scorch',
            spot,
            cell * spot.size * (0.5 + 0.5 * spreads),
            1,
            stain[index % 2],
            0.62 * clearing,
            'color',
            index + mark
          )
        );
      }
      const clings = Math.min(
        within(t, timing.reachesAt, timing.reachesAt + 0.3),
        1 - within(t, timing.spentAt + 1.2, timing.spentAt + 2),
        clearing
      );
      for (let puff = 0; clings > 0 && puff < 8; puff++) {
        const round = (puff / 8) * Math.PI * 2 + t * (puff % 2 === 0 ? 0.9 : -0.7) + stage.seed;
        const out = cell * (0.55 + 0.15 * Math.sin(t * 1.7 + puff));
        const at = {
          x: floor.x + Math.cos(round) * out,
          y: floor.y + Math.sin(round) * out,
          z: stage.z + cell * (0.3 + 0.09 * puff + 0.06 * Math.sin(t * 2.3 + puff * 2)),
        };
        const tone = puff % 3 === 0 ? mixColor(SICKLY, ramp[1], 0.3) : mixColor(ramp[1], ramp[2], 0.5);
        drawn.motes.push(smokePuff(at, cell * 0.75, tone, 0.42 * clings, forward));
      }
      break;
    }
    case 'thunder': {
      drawn.floor.push(floorMark('scorch', floor, cell * 0.55, 1, SMOKE, 0.5 * clearing, 'color', mark));
      const crackle = Math.floor(t / 0.05);
      const bright = 0.6 + 0.4 * Math.abs(Math.sin(crackle * 12.9898 + stage.seed));
      drawn.floor.push(floorMark('disc', floor, cell * 1.9, 1, ramp[4], 0.3 * blown * bright, 'light', 0));
      if (blown > 0.05) {
        drawn.motes.push(glow(chest, cell * 1.1, ramp[4], 0.4 * blown * bright, forward));
        const neighbour = stage.targets.find(
          (other) => other.index !== stage.index && Math.hypot(other.x - stage.x, other.y - stage.y) < cell * 4
        );
        for (const [fork, spot] of left.spots.entries()) {
          if (Math.sin(crackle * 7.13 + fork * 2.4 + stage.seed) < -0.2) continue;
          const to = fork === 0 && neighbour ? chestOf(neighbour) : { x: spot.x, y: spot.y, z: spot.z + cell * 0.05 };
          drawn.ribbons.push(
            ...lightningRibbons(
              chest,
              to,
              stage.seed + fork * 13,
              crackle,
              cell,
              ramp,
              0.75 * blown,
              stage.groundZ,
              0.45
            )
          );
        }
      }
      break;
    }
    case 'wind':
      break;
    case 'sand':
      drawSandDrift(drawn, floor, left.spots, t, [timing.reachesAt, timing.failsAt], cell, ramp, clearing, mark);
      break;
    case 'dark': {
      const shadowed = Math.min(
        within(t, timing.reachesAt, timing.reachesAt + 0.3),
        1 - within(t, timing.spentAt + 0.4, timing.spentAt + 1.4)
      );
      drawn.floor.push(floorMark('disc', floor, cell * 1.5, 1, '#000000', 0.55 * shadowed, 'color', 0));
      drawn.floor.push(floorMark('ring', floor, cell * 1.15, 0.08, ramp[2], 0.5 * blown, 'light', 0));
      break;
    }
    case 'holy': {
      const glowing = Math.min(
        within(t, timing.reachesAt, timing.reachesAt + 0.4),
        1 - within(t, timing.spentAt + 0.4, timing.spentAt + 1.4)
      );
      const breathing = 1 + 0.04 * Math.sin(t * 3.1);
      drawn.floor.push(floorMark('disc', floor, cell * 1.5, 1, ramp[3], 0.15 * glowing, 'light', 0));
      drawn.floor.push(floorMark('ring', floor, cell * 0.85 * breathing, 0.07, ramp[4], 0.5 * glowing, 'light', 0));
      drawn.motes.push(haze(chest, cell * 1.4, ramp[2], 0.12 * glowing, forward));
      drawn.motes.push(glow(chest, cell * 1.6, ramp[4], 0.12 * glowing, forward));
      break;
    }
  }

  for (const cloud of left.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of left.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  for (const [index, spark] of left.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  if (look.element === 'dark') {
    for (const ember of left.embers) {
      const at = moteAt(ember, t);
      if (!at) continue;
      drawn.motes.push(glow(at, cell * 0.2, ramp[2], 0.45 * (1 - at.age), forward));
      drawn.motes.push(ball(at, cell * 0.07, mixColor(INK, ramp[0], 0.3), 1 - at.age, forward, 1));
    }
    return;
  }
  for (const [index, ember] of left.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);
}

/** A little fire left burning on the floor from when it is left until it has burnt out: flames licking up and a glow under them. */
function drawLittleFire(
  drawn: Staged,
  spot: Spot,
  t: number,
  burntOutAt: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  if (t < spot.at || t >= burntOutAt) return;
  const burning = Math.min(within(t, spot.at, spot.at + 0.15), 1 - within(t, burntOutAt - 0.7, burntOutAt));
  drawn.motes.push(glow({ x: spot.x, y: spot.y, z: spot.z + cell * 0.1 }, cell * 0.7, WARM, 0.3 * burning, forward));
  for (let lick = 0; lick < 3; lick++) {
    const phase = (t * 2.3 + lick / 3 + spot.variant) % 1;
    const flame = {
      x: spot.x + (lick - 1) * cell * 0.05,
      y: spot.y,
      z: spot.z + cell * (0.05 + phase * 0.3),
    };
    const size = cell * spot.size * (1 - phase) * burning;
    if (size > cell * 0.02) {
      drawn.motes.push(
        ball(flame, size, ramp[Math.max(1, 5 - Math.floor(phase * 4))], 1, forward, lick + spot.variant)
      );
    }
  }
}
