import { type CoffinTiming, coffinTimingOf } from '@axe/domain/effect/ice-looks';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  clearOf,
  coldMist,
  crystal,
  drawSpire,
  glint,
  type IceTones,
  iceTonesOf,
  layIceBeat,
  layRime,
  leaningWay,
  type Spire,
  twinkleAt,
} from '@axe/domain/effect/scene/ice/ice-parts';
import {
  drawGrain,
  drawShard,
  type Grain,
  icePowder,
  type Shard,
  throwGrains,
  throwShards,
} from '@axe/domain/effect/scene/ice/ice-shards';
import { floorMark, glow, haze, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * A pillar of ice that closes its target in. Rime draws in over the floor to its feet, and slabs of
 * ice slam up about it one after another, round it like the staves of a cask; then one great
 * crystal closes over all of it in a white beat. The target stands inside, seen through the ice
 * before it, the slabs at its back dark behind it. It holds, glinting, cold pouring off its foot;
 * cracks run through it one at a time, each with a snap of light, and then it bursts: the pillar
 * gone in an instant into great shards thrown every way, powder and a ring of frost. The shards and
 * the rime are left, and the rime draws back.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.frost ?? 1.2;
/** How long each white beat lasts, in seconds. */
const BEAT_S = 0.1;
/** How long before it clears everything left starts to fade, in seconds. */
const CLEARS_S = 0.5;
/** How many slabs close about the target. */
const SLABS = 6;
/** How clear the ice before the target is: it is seen through it. */
const CLEAR = 0.36;
/** How tall the pillar stands at the least, in cells, and against how tall its target stands. */
const TALL_CELLS = 2.5;
const TALL_BY_TARGET = 1.9;
/** How wide the pillar is, and how far out its slabs stand, in cells. */
const WIDE_CELLS = 1.75;
const SLABS_OUT_CELLS = 0.78;

interface CoffinThrow {
  readonly slabs: readonly Spire[];
  readonly shards: readonly Shard[];
  readonly grains: readonly Grain[];
  readonly clouds: readonly Cloud[];
  /** Where on the pillar each crack snaps, as a share of its height and of its width to either side. */
  readonly snaps: readonly { readonly up: number; readonly aside: number }[];
}

const coffinByStage = new Map<string, CoffinThrow>();

function throwCoffin(
  stage: Stage,
  floor: Point,
  tones: IceTones,
  timing: CoffinTiming,
  ends: number,
  tall: number
): CoffinThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const high = tall / cell;
  const closes = Math.max(timing.sealsAt - 0.14, 0.02);
  const clear = clearOf(stage);
  const turned = th.range(0, Math.PI * 2);
  const slabs = Array.from({ length: SLABS }, (_unused, index) => {
    const bearing = turned + (index / SLABS) * Math.PI * 2;
    return {
      root: {
        x: floor.x + Math.cos(bearing) * (cell * SLABS_OUT_CELLS + clear),
        y: floor.y + Math.sin(bearing) * (cell * SLABS_OUT_CELLS + clear),
        z: floor.z,
      },
      way: leaningWay(bearing, th.range(-0.1, 0.06)),
      tall: high * th.range(0.72, 0.96),
      wide: th.range(0.52, 0.66),
      risesAt: closes * (0.2 + (0.8 * ((index * 5) % SLABS)) / SLABS),
      breaksAfter: th.range(0, 0.05),
      variant: th.range(0, 6),
      dim: Math.sin(bearing) < -0.2 ? 0.5 : 0,
    };
  }).sort((a, b) => a.root.y - b.root.y);
  const fromAll: [number, number] = [0.15, high];
  const shards = [
    ...throwShards(th, floor, th.count(9), {
      long: [0.6, 1.15],
      slim: [0.3, 0.42],
      up: [1, 7],
      out: [1.5, 6],
      bornAt: [timing.shattersAt, timing.shattersAt + 0.04],
      from: 0.4,
      high: fromAll,
    }),
    ...throwShards(th, floor, th.count(12), {
      long: [0.18, 0.36],
      up: [1, 8],
      out: [1.5, 7.5],
      bornAt: [timing.shattersAt, timing.shattersAt + 0.05],
      from: 0.4,
      high: fromAll,
    }),
  ];
  const grains = [
    ...throwGrains(th, floor, th.count(26), {
      size: [0.05, 0.12],
      up: [1, 9],
      out: [1.5, 9],
      bornAt: [timing.shattersAt, timing.shattersAt + 0.05],
      from: 0.4,
      high: fromAll,
    }),
    ...timing.cracksAt.flatMap((at) =>
      throwGrains(th, floor, 4, {
        size: [0.04, 0.08],
        up: [0, 3],
        out: [1.5, 4],
        bornAt: [at, at + 0.03],
        from: 0.5,
        high: fromAll,
      })
    ),
  ];
  const clouds = [
    ...coldMist(th, floor, th.count(9), tones.mist, {
      speed: [1.6, 4.4],
      size: [0.55, 0.85],
      bornAt: [timing.sealsAt, timing.sealsAt + 0.05],
      life: [0.7, 1.2],
      alpha: 0.5,
    }),
    ...coldMist(th, floor, th.count(9), tones.mist, {
      speed: [0.25, 0.9],
      size: [0.6, 0.9],
      bornAt: [timing.sealsAt + 0.2, Math.max(timing.sealsAt + 0.3, timing.shattersAt - 0.2)],
      from: 0.9,
      life: [1.1, 1.9],
      alpha: 0.36,
    }),
    ...coldMist(th, floor, th.count(12), tones.mist, {
      speed: [1, 4.5],
      size: [0.7, 1.1],
      bornAt: [timing.shattersAt, timing.shattersAt + 0.1],
      life: [1.1, 2],
      alpha: 0.5,
    }),
    ...[0.25, 0.55, 0.85].flatMap((up) =>
      icePowder(
        th,
        { ...floor, z: floor.z + tall * up },
        th.count(5),
        tones.pale,
        [timing.shattersAt, timing.shattersAt + 0.05],
        [0.5, 0.9]
      )
    ),
  ];
  const snaps = timing.cracksAt.map(() => ({ up: th.range(0.3, 0.8), aside: th.range(-0.3, 0.3) }));
  return { slabs, shards, grains, clouds, snaps };
}

/** A pillar of ice that closes its target in: see the header. */
export function drawCoffin(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const base = coffinTimingOf(duration, stage.blowsAt[0]);
  const timing = stage.blowsAt[1] === undefined ? base : { ...base, shattersAt: stage.blowsAt[1] };
  const tones = iceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const tall = Math.max(cell * TALL_CELLS, stage.tall * TALL_BY_TARGET);
  const thrown = keptFor(coffinByStage, stageKey(stage, ends) + `|${Math.round(tall)}`, () =>
    throwCoffin(stage, floor, tones, timing, ends, tall)
  );
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const since = t - timing.sealsAt;
  const burst = t - timing.shattersAt;
  const forward = cell * 0.3;
  const up = { x: 0, y: 0, z: 1 };

  const closing = within(t, 0, Math.max(timing.sealsAt, 0.001));
  const recedes = 1 - within(t, timing.shattersAt + 0.7, ends);
  layRime(
    drawn,
    floor,
    cell * (since < 0 ? 0.7 + 0.8 * closing : 1.5 + 0.9 * outCubic(within(since, 0, 0.2))),
    since < 0 ? 0.8 : Math.pow(recedes, 0.8),
    tones,
    1,
    stage.seed
  );
  if (since < 0) {
    const ring = cell * (2.4 - 1.7 * closing * closing);
    drawn.floor.push(floorMark('ring', floor, ring, 0.022, tones.rime, 0.8 * closing, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, ring * 0.7, 0.02, tones.rime, 0.6 * closing, 'color', 0));
  }
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);

  const cracks = timing.cracksAt.reduce((sum, at) => sum + outCubic(within(t, at, at + 0.08)), 0);
  const cracked = Math.min(0.95, (cracks / Math.max(1, timing.cracksAt.length)) * 0.95);
  const whole = burst < 0 ? 1 : 1 - within(burst, 0, 0.07);
  const risen = outCubic(within(since, 0, 0.12));
  const pillar = (dim: number, over: number | undefined, alpha: number) =>
    crystal(floor, up, tall * 1.12 * risen, cell * WIDE_CELLS + clearOf(stage) * 2, tones, alpha * whole * clearing, {
      variant: (stage.seed % 50) / 10 + 0.4,
      cracks: cracked,
      dim,
      over,
    });
  for (const slab of thrown.slabs) {
    const clear = (slab.dim > 0 ? 1 : CLEAR) * (1 - within(burst, 0.12, 0.4));
    drawSpire(
      drawn,
      slab,
      t,
      timing.cracksAt[0] ?? timing.shattersAt,
      timing.shattersAt,
      cell,
      tones,
      clear * clearing
    );
    const struck = t - slab.risesAt;
    if (struck >= 0 && struck < 0.25 && since < 0)
      layShockRing(drawn, slab.root, cell * 0.1, cell * 0.7, cell * 0.08, tones.light, struck, 0.25);
  }
  if (since >= 0 && whole > 0) {
    drawn.motes.push(
      haze({ ...floor, z: floor.z + tall * 0.5 }, cell * 1.5, tones.shade, 0.2 * whole * clearing, forward)
    );
    drawn.motes.push(pillar(0, cell * 0.6, CLEAR));
    for (let index = 0; index < 7; index++) {
      const shows = twinkleAt(t, index, 4.6) * whole * within(since, 0.12, 0.25);
      if (shows <= 0) continue;
      const at = {
        x: floor.x + cell * 0.5 * Math.sin(index * 2.4),
        y: floor.y,
        z: floor.z + tall * (0.2 + 0.75 * ((index * 0.37) % 1)),
      };
      drawn.motes.push(glint(at, cell * 0.42, shows, cell * 0.8, index));
    }
  }
  for (const shard of thrown.shards) drawShard(drawn, shard, t, cell, tones, clearing);
  for (const grain of thrown.grains) drawGrain(drawn, grain, t, cell, tones, clearing, forward);

  timing.cracksAt.forEach((at, index) => {
    const snapped = t - at;
    if (snapped < 0 || snapped >= 0.12 || burst >= 0) return;
    const left = 1 - snapped / 0.12;
    const where = thrown.snaps[index] ?? { up: 0.5, aside: 0 };
    const point = { x: floor.x + cell * where.aside, y: floor.y, z: floor.z + tall * where.up };
    drawn.motes.push({
      ...glow(point, cell * 0.5, '#ffffff', left, cell * 0.9),
      shape: 'flare',
      trail: 6,
      spin: 0.9 + index,
    });
    drawn.motes.push({
      ...glow(point, cell * 0.4, tones.pale, left, cell * 0.9),
      shape: 'flare',
      trail: 4,
      spin: index,
    });
    drawn.lights.push({ ...point, color: tones.light, strength: 0.8 * left, reachPx: cell * 2 });
  });
  layShockRing(drawn, floor, cell * 0.5, cell * 3, cell * 0.34, tones.light, since, 0.4);
  layShockRing(drawn, floor, cell * 0.6, cell * 4.4, cell * 0.44, tones.light, burst, 0.5);
  layShockRing(drawn, floor, cell * 0.4, cell * 3.2, cell * 0.26, tones.rime, burst - 0.07, 0.5);
  for (const [at, strength] of [
    [since, 0.9],
    [burst, 1],
  ] as const) {
    if (at < 0 || at >= BEAT_S) continue;
    const heart = { ...floor, z: floor.z + tall * 0.5 };
    layIceBeat(drawn, floor, heart, cell * 2.6, cell * 1.4, tones, (1 - at / BEAT_S) * strength);
  }
  const lit = since < 0 ? 0 : burst < 0 ? Math.max(0.4 * whole, 1.5 * (1 - since / 0.3)) : 1.8 * (1 - burst / 0.4);
  if (lit > 0.02)
    drawn.lights.push({ ...floor, z: floor.z + tall * 0.6, color: tones.light, strength: lit, reachPx: cell * 4 });
  return drawn;
}
