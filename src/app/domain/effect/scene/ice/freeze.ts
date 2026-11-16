import { type FreezeTiming, freezeTimingOf } from '@axe/domain/effect/ice-looks';
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
  layFrostRun,
  layIceBeat,
  layRime,
  leaningWay,
  rimeAt,
  type Spire,
  twinkleAt,
} from '@axe/domain/effect/scene/ice/ice-parts';
import {
  drawGrain,
  drawShard,
  type Grain,
  type Shard,
  throwGrains,
  throwShards,
} from '@axe/domain/effect/scene/ice/ice-shards';
import { haze, keptFor, type Point, stageKey, type Thrower, throwerFor } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * Ice that freezes its target. Ferns of frost race in over the floor from every side and rime
 * creeps out under it; then crystals burst up in a crown about it in one cold white beat, a ring of
 * frost and a breath of mist thrown out; the crown stands, glinting, the target held in a blue
 * chill within it, low crystals at its feet and the tall ones leaning out, so it is seen between
 * them. Then cracks climb the crystals, they break from their tops, their shards falling to lie on
 * the rime, and the rime draws back from its edge as the mist thins.
 *
 * Landed by a shot it is a lesser crown, as large as a shot is.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.frost ?? 1.2;
/** How long the white beat lasts as the crystals burst up, in seconds. */
const BEAT_S = 0.1;
/** How long before it clears everything left starts to fade, in seconds. */
const CLEARS_S = 0.5;
/** How clear the sheath of ice over the target is: it is seen through it. */
const SHEATH_ALPHA = 0.36;
/**
 * How far round to the near side of the target a crystal stands for it to be the shorter, as the sine
 * of its bearing, and how much shorter it is: the tall ones stand behind the target and beside it.
 */
const NEAR_FROM = 0.3;
const NEAR_SHORTER = 0.5;
/** How far the rime reaches, in cells. */
const RIME_CELLS = 2.1;

/** A fern of frost that races in to the target: from where to where, and when it sets out. */
interface FrostRun {
  readonly from: Point;
  readonly to: Point;
  readonly startsAt: number;
  readonly seed: number;
}

interface FreezeThrow {
  readonly spires: readonly Spire[];
  readonly runs: readonly FrostRun[];
  readonly mist: readonly Cloud[];
  readonly shards: readonly Shard[];
  readonly grains: readonly Grain[];
}

const freezeByStage = new Map<string, FreezeThrow>();

/** A ring of crystals about a foot, each leaning out from it: those on its far side dimmer, as in its shadow, and those on its near side shorter. */
function ringOf(
  th: Thrower,
  floor: Point,
  count: number,
  how: {
    readonly out: readonly [number, number];
    readonly tall: readonly [number, number];
    readonly wide: readonly [number, number];
    readonly lean: readonly [number, number];
    readonly risesAt: number;
    readonly over: number;
    /** How much further out they stand for the target's width, in table pixels. */
    readonly clear: number;
  }
): Spire[] {
  const turned = th.range(0, Math.PI * 2);
  return Array.from({ length: count }, (_unused, index) => {
    const bearing = turned + ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
    const out = th.range(how.out[0], how.out[1]) * th.cell + how.clear;
    return {
      root: { x: floor.x + Math.cos(bearing) * out, y: floor.y + Math.sin(bearing) * out, z: floor.z },
      way: leaningWay(bearing, th.range(how.lean[0], how.lean[1])),
      tall: th.range(how.tall[0], how.tall[1]) * (Math.sin(bearing) > NEAR_FROM ? NEAR_SHORTER : 1),
      wide: th.range(how.wide[0], how.wide[1]),
      risesAt: how.risesAt + (index / count) * how.over,
      breaksAfter: th.range(0, 0.22),
      variant: th.range(0, 6),
      dim: Math.sin(bearing) < -0.2 ? 0.45 : 0,
    };
  });
}

function throwFreeze(
  stage: Stage,
  floor: Point,
  tones: IceTones,
  timing: FreezeTiming,
  ends: number,
  lesser: boolean
): FreezeThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const size = lesser ? 0.72 : 1;
  const few = lesser ? 0.6 : 1;
  const clear = clearOf(stage);
  const spires = [
    ...ringOf(th, floor, th.count(8 * few), {
      out: [0.64, 0.9],
      tall: [1.25 * size, 2.1 * size],
      wide: [0.36 * size, 0.52 * size],
      lean: [0.25, 0.55],
      risesAt: timing.burstsAt,
      over: 0.1,
      clear,
    }),
    ...ringOf(th, floor, th.count(10 * few), {
      out: [1.05, 1.6],
      tall: [0.5 * size, 1 * size],
      wide: [0.2 * size, 0.3 * size],
      lean: [0.3, 0.75],
      risesAt: timing.burstsAt + 0.05,
      over: 0.14,
      clear,
    }),
    ...ringOf(th, floor, th.count(4 * few), {
      out: [0.3, 0.42],
      tall: [0.26 * size, 0.4 * size],
      wide: [0.14 * size, 0.18 * size],
      lean: [0.5, 0.85],
      risesAt: timing.burstsAt,
      over: 0.06,
      clear,
    }),
  ].sort((a, b) => a.root.y - b.root.y);
  const gathers = Math.max(timing.burstsAt, 0.001);
  const runs = Array.from({ length: lesser ? 0 : 6 }, (_unused, index) => {
    const bearing = ((index + th.range(-0.3, 0.3)) / 6) * Math.PI * 2;
    const far = th.range(1.7, 2.3) * cell;
    return {
      from: { x: floor.x + Math.cos(bearing) * far, y: floor.y + Math.sin(bearing) * far, z: floor.z },
      to: { x: floor.x + Math.cos(bearing) * cell * 0.35, y: floor.y + Math.sin(bearing) * cell * 0.35, z: floor.z },
      startsAt: th.range(0, gathers * 0.35),
      seed: Math.floor(th.range(0, 9000)),
    };
  });
  const mist = [
    ...coldMist(th, floor, th.count(8), tones.mist, {
      speed: [1.6, 4.2],
      size: [0.5, 0.8],
      bornAt: [timing.burstsAt, timing.burstsAt + 0.05],
      life: [0.7, 1.3],
      alpha: 0.5,
    }),
    ...coldMist(th, floor, th.count(7), tones.mist, {
      speed: [0.2, 0.8],
      size: [0.6, 0.95],
      bornAt: [timing.burstsAt + 0.2, Math.max(timing.burstsAt + 0.3, timing.cracksAt)],
      from: 1.1,
      life: [1.2, 2],
      alpha: 0.34,
    }),
    ...coldMist(th, floor, th.count(8), tones.pale, {
      speed: [0.5, 1.8],
      size: [0.45, 0.75],
      bornAt: [timing.breaksAt, timing.fallenAt],
      from: 0.9,
      life: [0.9, 1.6],
      alpha: 0.5,
    }),
  ];
  const shards: Shard[] = [];
  const grains: Grain[] = [];
  for (const spire of spires) {
    if (spire.tall < 0.5) continue;
    const top = {
      x: spire.root.x + spire.way.x * spire.tall * cell * 0.7,
      y: spire.root.y + spire.way.y * spire.tall * cell * 0.7,
      z: floor.z,
    };
    const breaks = timing.breaksAt + spire.breaksAfter;
    const high: [number, number] = [spire.tall * 0.45, spire.tall * 0.9];
    shards.push(
      ...throwShards(th, top, 2, {
        long: [0.3 * size, 0.62 * size],
        up: [-0.5, 3],
        out: [0.5, 3],
        bornAt: [breaks + 0.02, breaks + 0.24],
        from: 0.1,
        high,
      })
    );
    grains.push(
      ...throwGrains(th, top, 3, {
        size: [0.06, 0.13],
        up: [0, 3.5],
        out: [0.5, 3.4],
        bornAt: [breaks, breaks + 0.26],
        from: 0.1,
        high,
      })
    );
  }
  grains.push(
    ...throwGrains(th, floor, th.count(22 * few), {
      size: [0.06, 0.13],
      up: [3, 9],
      out: [1.5, 6],
      bornAt: [timing.burstsAt, timing.burstsAt + 0.04],
      from: 0.7,
      high: [0.1, 0.6],
    })
  );
  return { spires, runs, mist, shards, grains };
}

/** Ice that freezes its target, bursting up at the moment its stage lands its blow: see the header. */
export function drawFreeze(stage: Stage, lesser = false): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const timing = freezeTimingOf(duration, stage.blowsAt[0]);
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const tones = iceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const thrown = keptFor(freezeByStage, stageKey(stage, ends) + (lesser ? '|lesser' : ''), () =>
    throwFreeze(stage, floor, tones, timing, ends, lesser)
  );
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const since = t - timing.burstsAt;
  const forward = cell * 0.3;
  const reach = cell * RIME_CELLS * (lesser ? 0.7 : 1);

  const crept = 0.6 * within(t, 0, Math.max(timing.burstsAt, 0.001));
  const rime = rimeAt(t, timing.burstsAt, 0.22, timing.fallenAt + 0.15, ends);
  layRime(drawn, floor, reach * Math.max(crept, rime.spread), since < 0 ? 0.75 : rime.thick, tones, 1, stage.seed);
  for (const run of thrown.runs) {
    const ran = outCubic(within(t, run.startsAt, Math.max(timing.burstsAt, run.startsAt + 0.08)));
    if (ran <= 0) continue;
    const head = {
      x: run.from.x + (run.to.x - run.from.x) * ran,
      y: run.from.y + (run.to.y - run.from.y) * ran,
      z: run.from.z,
    };
    layFrostRun(drawn, run.from, head, cell * 0.035, tones, since < 0 ? 1 : 1 - within(since, 0.1, 0.5), run.seed);
  }
  if (since < 0) return drawn;

  layShockRing(drawn, floor, cell * 0.4, cell * 3.2, cell * 0.34, tones.light, since, 0.4);
  layShockRing(drawn, floor, cell * 0.3, cell * 2.4, cell * 0.2, tones.rime, since - 0.05, 0.4);
  for (const cloud of thrown.mist) drawCloud(drawn, cloud, t, cell, forward);
  const standing = 1 - within(t, timing.breaksAt, timing.fallenAt);
  drawn.motes.push(
    haze({ ...floor, z: floor.z + stage.tall * 0.5 }, cell * 1.7, tones.shade, 0.24 * standing * clearing, forward)
  );
  for (const spire of thrown.spires)
    drawSpire(drawn, spire, t, timing.cracksAt, timing.breaksAt, cell, tones, clearing);
  const sheathed = 1 - within(t, timing.breaksAt, timing.breaksAt + 0.12);
  if (sheathed > 0 && !lesser)
    drawn.motes.push(
      crystal(
        floor,
        { x: 0, y: 0, z: 1 },
        Math.max(stage.tall * 1.2, cell * 0.8) * outCubic(within(since, 0, 0.14)),
        cell * 0.72 + clearOf(stage) * 2,
        tones,
        SHEATH_ALPHA * sheathed,
        { variant: (stage.seed % 60) / 10, cracks: within(t, timing.cracksAt, timing.breaksAt) * 0.95, over: forward }
      )
    );
  for (const shard of thrown.shards) drawShard(drawn, shard, t, cell, tones, clearing);
  for (const grain of thrown.grains) drawGrain(drawn, grain, t, cell, tones, clearing, forward);

  thrown.spires.forEach((spire, index) => {
    if (spire.tall < 0.5) return;
    const shows = twinkleAt(t, index, 6) * standing * within(since, 0.1, 0.2);
    if (shows <= 0) return;
    const high = cell * spire.tall * 0.62;
    const at = {
      x: spire.root.x + spire.way.x * high,
      y: spire.root.y + spire.way.y * high,
      z: spire.root.z + spire.way.z * high,
    };
    drawn.motes.push(glint(at, cell * 0.34, shows, forward * 2, index));
  });

  if (since < BEAT_S)
    layIceBeat(drawn, floor, { ...floor, z: floor.z + cell * 0.6 }, reach, cell * 1.1, tones, 1 - since / BEAT_S);
  if (since < 0.3)
    drawn.lights.push({
      ...floor,
      z: floor.z + cell,
      color: tones.light,
      strength: 1.8 * (1 - since / 0.3),
      reachPx: cell * 3.4,
    });
  return drawn;
}
