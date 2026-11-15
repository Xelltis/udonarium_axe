import { type ZeroTiming, zeroTimingOf } from '@axe/domain/effect/ice-looks';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  clearOf,
  coldMist,
  drawSpire,
  glint,
  type IceTones,
  iceTonesOf,
  layFlake,
  layFrostRun,
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
import {
  floorMark,
  glow,
  haze,
  keptFor,
  lightBall,
  type Point,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * The cold that stills an area. The air over all of it turns blue and thickens: frost races in
 * from its edge, and the damp in the air whitens into motes that slow and stop. Then the cold breaks
 * out of its middle in one white beat, a front of frost sweeping to the edge, and everything it
 * reaches is frozen at its turn: spires burst up about each target, the greatest about the one at its
 * middle. All of it stands still, the dust of ice hanging and glittering over a sheet of rime; then
 * cracks run out over the sheet and the whole of it is let go at once, each spire shattering at its
 * target's turn, the hanging dust thrown down and mist rolling out low over the floor. Rime and
 * broken ice are left, and draw back.
 *
 * What is over the whole area is drawn with the first target of the cast; with each other target
 * only what stands about it.
 */

/** How long it lingers after its playback, in seconds. */
const LINGER_S = SCENE_LINGER_S.frost ?? 1.2;
/** How long each white beat lasts, in seconds. */
const BEAT_S = 0.11;
/** How long the front takes to sweep from the middle to the edge, in seconds. */
const SWEEPS_S = 0.4;
/** How long before it clears everything left starts to fade, in seconds. */
const CLEARS_S = 0.5;
/** How far it reaches where it is cast over no area, in cells. */
const REACH_CELLS = 2.6;
/** How large what stands about a target caught in it is drawn, against the cell it is given, which is that of a small blast. */
const CAUGHT_GROWN = 1.7;

/** How much shorter a spire on the near side of its target is, so the target is seen over it. */
const NEAR_SHORTER = 0.5;

/** A mote of ice hanging in the air: where it comes to rest, how far it drifts to get there, and how large it is, in cells. */
interface Mote {
  readonly rest: Point;
  readonly drift: Point;
  readonly size: number;
  readonly turned: number;
}

/** A fern of frost racing in from the edge. */
interface FrostRun {
  readonly from: Point;
  readonly to: Point;
  readonly startsAt: number;
  readonly seed: number;
}

interface ZeroThrow {
  readonly spires: readonly Spire[];
  readonly shards: readonly Shard[];
  readonly grains: readonly Grain[];
  readonly clouds: readonly Cloud[];
  readonly motes: readonly Mote[];
  readonly runs: readonly FrostRun[];
}

const zeroByStage = new Map<string, ZeroThrow>();

/** The spires about one target: tall ones leaning out round it, lesser ones between and beyond them. */
function spiresAbout(th: Thrower, floor: Point, unit: number, risesAt: number, great: boolean, clear: number): Spire[] {
  const U = unit / th.cell;
  const ring = (
    count: number,
    out: readonly [number, number],
    tall: readonly [number, number],
    wide: readonly [number, number],
    lean: readonly [number, number],
    after: number
  ): Spire[] => {
    const turned = th.range(0, Math.PI * 2);
    return Array.from({ length: count }, (_unused, index) => {
      const bearing = turned + ((index + th.range(-0.3, 0.3)) / count) * Math.PI * 2;
      const far = th.range(out[0], out[1]) * unit + clear;
      return {
        root: { x: floor.x + Math.cos(bearing) * far, y: floor.y + Math.sin(bearing) * far, z: floor.z },
        way: leaningWay(bearing, th.range(lean[0], lean[1])),
        tall: th.range(tall[0], tall[1]) * U * (Math.sin(bearing) > 0.3 ? NEAR_SHORTER : 1),
        wide: th.range(wide[0], wide[1]) * U,
        risesAt: risesAt + after + th.range(0, 0.05),
        breaksAfter: th.range(0, 0.1),
        variant: th.range(0, 6),
        dim: Math.sin(bearing) < -0.2 ? 0.45 : 0,
      };
    });
  };
  return great
    ? [
        ...ring(7, [0.7, 0.95], [1.7, 2.8], [0.4, 0.58], [0.2, 0.42], 0),
        ...ring(7, [1.2, 1.8], [0.8, 1.5], [0.28, 0.4], [0.3, 0.7], 0.04),
        ...ring(8, [1.9, 2.7], [0.4, 0.8], [0.18, 0.26], [0.3, 0.9], 0.09),
      ]
    : [
        ...ring(5, [0.62, 0.85], [1.4, 2.2], [0.34, 0.46], [0.2, 0.45], 0),
        ...ring(6, [0.95, 1.4], [0.45, 0.85], [0.18, 0.26], [0.3, 0.8], 0.04),
      ];
}

function throwZero(
  stage: Stage,
  floor: Point,
  tones: IceTones,
  timing: ZeroTiming,
  ends: number,
  leads: boolean,
  reach: number
): ZeroThrow {
  const th = throwerFor(stage, ends);
  const { cell } = stage;
  const unit = leads ? cell : cell * CAUGHT_GROWN;
  const lone = leads
    ? Array.from({ length: th.count(6) }, () => {
        const way = th.outward();
        const share = th.range(0.5, 0.98);
        return {
          root: { x: floor.x + way.cos * reach * share, y: floor.y + way.sin * reach * share, z: floor.z },
          way: leaningWay(th.range(0, Math.PI * 2), th.range(0.05, 0.3)),
          tall: th.range(1.1, 2.2),
          wide: th.range(0.3, 0.44),
          risesAt: timing.freezesAt + SWEEPS_S * share,
          breaksAfter: th.range(0, 0.1),
          variant: th.range(0, 6),
          dim: way.sin < -0.2 ? 0.45 : 0,
        };
      })
    : [];
  const spires = [
    ...spiresAbout(th, floor, unit, timing.freezesAt, leads, Math.max(0, clearOf(stage) - (unit - cell) * 0.5)),
    ...lone,
  ].sort((a, b) => a.root.y - b.root.y);
  const shards: Shard[] = [];
  const grains: Grain[] = [];
  const clouds: Cloud[] = [];
  for (const spire of spires) {
    if (spire.tall * cell < unit * 0.45) continue;
    const top = {
      x: spire.root.x + spire.way.x * spire.tall * cell * 0.6,
      y: spire.root.y + spire.way.y * spire.tall * cell * 0.6,
      z: floor.z,
    };
    const breaks = timing.shattersAt + spire.breaksAfter;
    const high: [number, number] = [spire.tall * 0.3, spire.tall * 0.9];
    const size = unit / cell;
    shards.push(
      ...throwShards(th, top, 2, {
        long: [0.25 * size, 0.55 * size],
        up: [1, 6],
        out: [1.2, 5.5],
        bornAt: [breaks, breaks + 0.08],
        from: 0.1,
        high,
      })
    );
    grains.push(
      ...throwGrains(th, top, 4, {
        size: [0.05 * size, 0.11 * size],
        up: [1, 7],
        out: [1, 7],
        bornAt: [breaks, breaks + 0.08],
        from: 0.1,
        high,
      })
    );
    clouds.push(
      ...icePowder(
        th,
        { ...top, z: floor.z + spire.tall * cell * 0.5 },
        2,
        tones.pale,
        [breaks, breaks + 0.1],
        [0.4 * size, 0.7 * size]
      )
    );
  }
  if (!leads) return { spires, shards, grains, clouds, motes: [], runs: [] };

  const far = reach / cell;
  clouds.push(
    ...coldMist(th, floor, th.count(12), tones.mist, {
      speed: [far * 0.9, far * 2.2],
      size: [0.7, 1.1],
      bornAt: [timing.freezesAt, timing.freezesAt + 0.05],
      life: [0.7, 1.2],
      alpha: 0.45,
    }),
    ...coldMist(th, floor, th.count(16), tones.mist, {
      speed: [far * 0.8, far * 2.4],
      size: [0.8, 1.3],
      bornAt: [timing.shattersAt, timing.shattersAt + 0.1],
      from: far * 0.5,
      life: [1.2, 2.2],
      alpha: 0.5,
    }),
    ...coldMist(th, floor, th.count(10), tones.mist, {
      speed: [0.1, 0.5],
      size: [0.9, 1.4],
      bornAt: [timing.shattersAt + 0.3, timing.shattersAt + 0.9],
      from: far,
      life: [1.6, 2.6],
      alpha: 0.38,
    })
  );
  const motes = Array.from({ length: th.count(70) }, () => {
    const way = th.outward();
    const out = Math.sqrt(th.range(0.02, 1)) * reach;
    const blown = th.outward();
    const drift = th.range(0.6, 1.8) * cell;
    return {
      rest: { x: floor.x + way.cos * out, y: floor.y + way.sin * out, z: floor.z + th.range(0.25, 2.3) * cell },
      drift: { x: blown.cos * drift, y: blown.sin * drift, z: th.range(-0.3, 0.9) * cell },
      size: th.range(0.12, 0.24),
      turned: th.range(0, 3),
    };
  });
  const gathers = Math.max(timing.freezesAt, 0.001);
  const runs = Array.from({ length: 9 }, (_unused, index) => {
    const bearing = ((index + th.range(-0.3, 0.3)) / 9) * Math.PI * 2;
    return {
      from: { x: floor.x + Math.cos(bearing) * reach, y: floor.y + Math.sin(bearing) * reach, z: floor.z },
      to: {
        x: floor.x + Math.cos(bearing + 0.2) * cell * 0.8,
        y: floor.y + Math.sin(bearing + 0.2) * cell * 0.8,
        z: floor.z,
      },
      startsAt: th.range(0, gathers * 0.3),
      seed: Math.floor(th.range(0, 9000)),
    };
  });
  return { spires, shards, grains, clouds, motes, runs };
}

/** What is drawn over the whole area: the stilling, the front, the hanging dust and the release. */
function drawArea(
  drawn: Staged,
  stage: Stage,
  thrown: ZeroThrow,
  timing: ZeroTiming,
  tones: IceTones,
  floor: Point,
  reach: number,
  ends: number
): void {
  const { cell } = stage;
  const t = stage.seconds;
  const since = t - timing.freezesAt;
  const released = t - timing.shattersAt;
  const forward = cell * 0.3;
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const stilling = within(t, 0, Math.max(timing.freezesAt, 0.001));
  const held = released < 0 ? 1 : 1 - within(released, 0, 0.5);

  drawn.floor.push(
    floorMark(
      'disc',
      floor,
      reach * 1.25,
      1,
      tones.shade,
      0.34 * stilling * (0.35 + 0.65 * held) * clearing,
      'color',
      0
    )
  );
  const swept = since < 0 ? 0 : outCubic(within(since, 0, SWEEPS_S));
  const recedes = 1 - within(t, timing.shattersAt + 0.7, ends);
  if (since >= 0) layRime(drawn, floor, reach * 1.08 * swept, Math.pow(recedes, 0.8), tones, 1, stage.seed);
  for (const run of thrown.runs) {
    const ran = outCubic(within(t, run.startsAt, Math.max(timing.freezesAt, run.startsAt + 0.1)));
    if (ran <= 0) continue;
    const head = {
      x: run.from.x + (run.to.x - run.from.x) * ran,
      y: run.from.y + (run.to.y - run.from.y) * ran,
      z: run.from.z,
    };
    layFrostRun(drawn, run.from, head, cell * 0.05, tones, since < 0 ? 1 : recedes * (1 - swept * 0.6), run.seed);
  }
  if (since < 0) {
    const closing = reach * (1 - 0.75 * stilling * stilling);
    drawn.floor.push(floorMark('ring', floor, closing, 0.016, tones.rime, 0.8 * stilling, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, closing * 0.72, 0.016, tones.rime, 0.6 * stilling, 'color', 0));
  } else {
    layShockRing(drawn, floor, cell * 0.5, reach * 1.15, cell * 0.6, tones.light, since, SWEEPS_S);
    layShockRing(drawn, floor, cell * 0.5, reach * 1.6, cell * 0.7, tones.light, released, 0.5);
    layShockRing(drawn, floor, cell * 0.3, reach * 1.2, cell * 0.4, tones.rime, released - 0.08, 0.5);
  }
  const cracking = within(t, timing.cracksAt, timing.shattersAt);
  if (cracking > 0 && released < 0.25) {
    const fades = released < 0 ? 1 : 1 - released / 0.25;
    drawn.floor.push(
      floorMark('cracks', floor, reach * (0.3 + 0.75 * cracking), 0.1, '#ffffff', 0.9 * fades, 'light', stage.seed % 89)
    );
  }

  thrown.motes.forEach((mote, index) => {
    const coming = 1 - stilling;
    const fell = released < 0 ? 0 : released;
    const out = { x: mote.rest.x - floor.x, y: mote.rest.y - floor.y };
    const at = {
      x: mote.rest.x + mote.drift.x * coming * coming + out.x * fell * 0.9,
      y: mote.rest.y + mote.drift.y * coming * coming + out.y * fell * 0.9,
      z: Math.max(
        floor.z + cell * 0.05,
        mote.rest.z + mote.drift.z * coming * coming - Math.max(0, since) * cell * 0.04 - fell * fell * cell * 9
      ),
    };
    const shows = Math.min(1, stilling * 1.6) * (released < 0 ? 1 : 1 - within(released, 0.15, 0.55));
    const size = cell * mote.size;
    layFlake(drawn, at, size, 0.85 * shows, forward, mote.turned + coming * 3);
    const flashes = since < 0 ? 0 : twinkleAt(t, index, 4.2) * shows;
    if (flashes > 0) drawn.motes.push(glint(at, size * 2.6, flashes, forward + 1, mote.turned));
  });

  for (const [at, strength] of [
    [since, 1],
    [released, 1],
  ] as const) {
    if (at < 0 || at >= BEAT_S) continue;
    const heart = { ...floor, z: floor.z + cell * 0.8 };
    layIceBeat(drawn, floor, heart, reach * 1.2, cell * 1.8, tones, (1 - at / BEAT_S) * strength);
  }
  const lit =
    since < 0 ? 0.5 * stilling : released < 0 ? Math.max(0.55, 1.8 * (1 - since / 0.35)) : 1.7 * (1 - released / 0.4);
  if (lit > 0.02)
    drawn.lights.push({ ...floor, z: floor.z + cell * 1.4, color: tones.light, strength: lit, reachPx: reach * 1.4 });
}

/** The cold that stills an area: see the header. */
export function drawZero(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const base = zeroTimingOf(duration, stage.blowsAt[0]);
  const timing = stage.blowsAt[1] === undefined ? base : { ...base, shattersAt: stage.blowsAt[1] };
  const tones = iceTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const leads = (stage.targets[0]?.index ?? stage.index) === stage.index;
  const reach = stage.areaPx > 0 ? stage.areaPx : cell * REACH_CELLS;
  const thrown = keptFor(zeroByStage, stageKey(stage, ends) + `|${leads}|${reach}`, () =>
    throwZero(stage, floor, tones, timing, ends, leads, reach)
  );
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const since = t - timing.freezesAt;
  const forward = cell * 0.3;
  const unit = leads ? cell : cell * CAUGHT_GROWN;

  if (leads) drawArea(drawn, stage, thrown, timing, tones, floor, reach, ends);
  if (since < 0) return drawn;
  if (!leads) {
    const recedes = 1 - within(t, timing.shattersAt + 0.7, ends);
    layRime(drawn, floor, unit * 1.3 * outCubic(within(since, 0, 0.2)), Math.pow(recedes, 0.8), tones, 1, stage.seed);
    if (since < BEAT_S) {
      const left = 1 - since / BEAT_S;
      const struck = { ...floor, z: floor.z + unit * 0.5 };
      drawn.motes.push(lightBall(struck, unit * 0.45, '#ffffff', 0.9 * left, unit * 0.5));
      drawn.motes.push({ ...glow(struck, unit * 0.4, '#ffffff', left, unit * 0.5), shape: 'flare', trail: 6, spin: 0 });
    }
    layShockRing(drawn, floor, unit * 0.3, unit * 1.7, unit * 0.14, tones.light, t - timing.shattersAt, 0.35);
  }
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  const standing = 1 - within(t, timing.shattersAt, timing.shattersAt + 0.2);
  drawn.motes.push(
    haze({ ...floor, z: floor.z + stage.tall * 0.5 }, unit * 1.8, tones.shade, 0.3 * standing * clearing, forward)
  );
  for (const spire of thrown.spires)
    drawSpire(drawn, spire, t, timing.cracksAt, timing.shattersAt, cell, tones, clearing);
  for (const shard of thrown.shards) drawShard(drawn, shard, t, cell, tones, clearing);
  for (const grain of thrown.grains) drawGrain(drawn, grain, t, cell, tones, clearing, forward);
  thrown.spires.forEach((spire, index) => {
    const shows = twinkleAt(t, index, 5) * standing * within(since, 0.1, 0.2);
    if (shows <= 0 || spire.tall * cell < unit * 0.45) return;
    const high = cell * spire.tall * 0.62;
    const at = {
      x: spire.root.x + spire.way.x * high,
      y: spire.root.y + spire.way.y * high,
      z: spire.root.z + spire.way.z * high,
    };
    drawn.motes.push(glint(at, unit * 0.36, shows, forward * 2, index));
  });
  return drawn;
}
