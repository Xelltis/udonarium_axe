import { blizzardTimingOf } from '@axe/domain/effect/ice-looks';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  coldMist,
  crystal,
  glint,
  type IceTones,
  iceTonesOf,
  layFlake,
  layRime,
  twinkleAt,
} from '@axe/domain/effect/scene/ice/ice-parts';
import { ball, haze, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { halvesOf, layRibbons, type WindPaint, windPaintOf } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A blizzard. Wind winds up about the target, white bands of it wrapping round and round, low and
 * wide, the far half of each passing behind the target and the near half before it; snow is whirled
 * in it, thick, and shards of ice ride it edge on; rime spreads out over the floor under it as it
 * blows. Half way through it bites: the rime leaps out with a ring of frost, and the shards glint.
 * Then the wind fails, the snow sinks and settles, and the rime is left and draws back.
 */

/** How long it lingers after its playback, in seconds: as long as any whirlwind does. */
const LINGER_S = 1.2;
/** How many bands of wind wrap the target, and how many points each is drawn through. */
const BANDS = 14;
const BAND_POINTS = 11;
/** How tall the whirl stands at the least, in cells, and against how tall its target stands. */
const TALL_CELLS = 2.3;
const TALL_BY_TARGET = 1.6;
/** How far the rime reaches before it bites and after, in cells. */
const RIME_CELLS = 1.9;
const BITTEN_CELLS = 2.7;
/** Where through its playback it bites, as a share of it. */
const BITES_AT = 0.5;

/** One thing whirled about the target: how far out and how high it rides, in cells, and how it turns. */
interface Whirled {
  readonly out: number;
  readonly high: number;
  readonly phase: number;
  /** How fast it goes round, in radians a second. */
  readonly pace: number;
  readonly size: number;
  readonly variant: number;
}

interface BlizzardThrow {
  readonly bands: readonly Whirled[];
  readonly snow: readonly Whirled[];
  readonly shards: readonly Whirled[];
  readonly mist: readonly Cloud[];
}

const blizzardByStage = new Map<string, BlizzardThrow>();

function throwBlizzard(stage: Stage, floor: Point, tones: IceTones, ends: number, bitesAt: number): BlizzardThrow {
  const th = throwerFor(stage, ends);
  const whirled = (
    count: number,
    out: readonly [number, number],
    high: readonly [number, number],
    pace: readonly [number, number],
    size: readonly [number, number]
  ): Whirled[] =>
    Array.from({ length: count }, (_unused, index) => ({
      out: th.range(out[0], out[1]),
      high: high[0] + ((index + th.range(0, 1)) / count) * (high[1] - high[0]),
      phase: th.range(0, Math.PI * 2),
      pace: th.range(pace[0], pace[1]),
      size: th.range(size[0], size[1]),
      variant: th.range(0, 6),
    }));
  return {
    bands: whirled(BANDS, [0.7, 1.5], [0.06, 1], [5.5, 8.5], [0.32, 0.58]),
    snow: whirled(th.count(120), [0.35, 2], [0, 1.15], [3, 7.5], [0.09, 0.2]),
    shards: whirled(th.count(12), [0.8, 1.6], [0.12, 0.95], [4.5, 6.5], [0.45, 0.75]),
    mist: [
      ...coldMist(th, floor, th.count(12), tones.mist, {
        speed: [0.5, 1.8],
        size: [0.6, 1],
        bornAt: [0.1, Math.max(0.2, bitesAt)],
        from: 1,
        life: [1, 1.8],
        alpha: 0.36,
      }),
      ...coldMist(th, floor, th.count(10), tones.mist, {
        speed: [1.5, 4],
        size: [0.6, 1],
        bornAt: [bitesAt, bitesAt + 0.08],
        from: 0.8,
        life: [1, 1.9],
        alpha: 0.45,
      }),
    ],
  };
}

/** One band of wind at a moment, by halves: wound part of the way round the target, its head leading and its tail thinning away. */
function bandOf(
  band: Whirled,
  t: number,
  floor: Point,
  cell: number,
  tall: number,
  paint: WindPaint,
  alpha: number
): EffectRibbon[] {
  const head = band.phase + band.pace * t;
  const span = Math.PI * (1.1 + 0.5 * Math.sin(band.variant));
  const points: Point[] = [];
  const about: Point[] = [];
  const widths: number[] = [];
  const alphas: number[] = [];
  for (let step = 0; step < BAND_POINTS; step++) {
    const share = step / (BAND_POINTS - 1);
    const turn = head - span * (1 - share);
    const out = cell * band.out * (0.82 + 0.18 * share) * (1 + 0.1 * Math.sin(t * 3 + band.variant + share * 2));
    const z = floor.z + tall * (band.high + 0.07 * Math.sin(turn * 0.7 + band.variant)) - cell * 0.12 * (1 - share);
    points.push({ x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z });
    about.push({ x: floor.x, y: floor.y, z });
    widths.push(cell * band.size * Math.pow(Math.sin(Math.PI * Math.min(1, share * 0.92 + 0.06)), 0.6));
    alphas.push(Math.pow(share, 1.2));
  }
  const ribbon: EffectRibbon = {
    points,
    widths,
    color: paint.edge,
    core: '#ffffff',
    alpha,
    alphas,
    blend: 'color',
    torn: 0.4,
    soft: 0.25,
    flowed: t * 2.4 + band.variant,
  };
  const halves = halvesOf(ribbon, about, paint.shadow);
  return [halves.far, halves.near];
}

/** A blizzard about the target: see the header. */
export function drawBlizzard(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const timing = blizzardTimingOf(duration);
  const bitesAt = Math.max(timing.blowsAt, duration * BITES_AT);
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const tones = iceTonesOf(ramp);
  const paint = windPaintOf(ramp);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const tall = Math.max(cell * TALL_CELLS, stage.tall * TALL_BY_TARGET);
  const thrown = keptFor(blizzardByStage, stageKey(stage, ends), () =>
    throwBlizzard(stage, floor, tones, ends, bitesAt)
  );
  const blown = Math.min(within(t, 0, timing.blowsAt), 1 - within(t, timing.failsAt, timing.goneAt));
  const failing = within(t, timing.failsAt, timing.goneAt);
  const bitten = t - bitesAt;
  const forward = cell * 0.3;

  const spread = 0.25 + 0.75 * outCubic(within(t, 0, Math.max(bitesAt, 0.01)));
  const reach =
    cell * (bitten < 0 ? RIME_CELLS * spread : RIME_CELLS + (BITTEN_CELLS - RIME_CELLS) * outCubic(bitten / 0.2));
  const recedes = 1 - within(t, timing.goneAt, ends);
  layRime(drawn, floor, reach, (bitten < 0 ? 0.45 + 0.4 * spread : 1) * Math.pow(recedes, 0.8), tones, 1, stage.seed);
  layShockRing(drawn, floor, cell * 0.5, cell * BITTEN_CELLS * 1.15, cell * 0.16, tones.light, bitten, 0.35);
  for (const cloud of thrown.mist) drawCloud(drawn, cloud, t, cell, forward);
  if (blown > 0) {
    drawn.motes.push(
      haze({ ...floor, z: floor.z + tall * 0.45 }, cell * 2.3, tones.shade, 0.34 * blown, forward),
      haze({ ...floor, z: floor.z + tall * 0.5 }, cell * 1.6, '#ffffff', 0.3 * blown, forward)
    );
    const bands = thrown.bands.flatMap((band) => bandOf(band, t, floor, cell, tall, paint, 0.95 * blown));
    layRibbons(
      drawn,
      bands.filter((band) => band.half === 'far')
    );
    layRibbons(
      drawn,
      bands.filter((band) => band.half === 'near')
    );
    thrown.shards.forEach((shard, index) => {
      const turn = shard.phase + shard.pace * t;
      const out = cell * shard.out * (1 + 0.12 * Math.sin(t * 2.2 + shard.variant));
      const at = {
        x: floor.x + Math.cos(turn) * out,
        y: floor.y + Math.sin(turn) * out,
        z: floor.z + tall * shard.high + cell * 0.1 * Math.sin(t * 4 + shard.variant),
      };
      const tilt = 0.35 * Math.sin(t * 5 + shard.variant * 2);
      const way = { x: -Math.sin(turn) * Math.cos(tilt), y: Math.cos(turn) * Math.cos(tilt), z: Math.sin(tilt) };
      const long = cell * shard.size;
      const root = { x: at.x - way.x * long * 0.5, y: at.y - way.y * long * 0.5, z: at.z - way.z * long * 0.5 };
      drawn.motes.push(crystal(root, way, long, long * 0.34, tones, blown, { variant: shard.variant }));
      const flashes = Math.max(twinkleAt(t, index, 7), bitten >= 0 && bitten < 0.2 ? 1 - bitten / 0.2 : 0) * blown;
      if (flashes > 0) drawn.motes.push(glint(at, cell * 0.4, flashes, forward, index));
    });
  }
  thrown.snow.forEach((flake, index) => {
    const turn = flake.phase + flake.pace * (t - failing * failing * 0.5);
    const out = cell * flake.out * (0.75 + 0.25 * Math.sin(t * 1.7 + flake.variant) + 0.5 * failing);
    const rides = (flake.high + t * 0.22 * (0.5 + (index % 5) * 0.2)) % 1.15;
    const sinks = failing * failing * (0.4 + 0.6 * ((index * 0.37) % 1));
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + Math.max(cell * 0.03, tall * rides * (1 - sinks)),
    };
    const shows =
      within(t, 0, timing.blowsAt * (0.3 + 0.7 * ((index * 0.61) % 1))) * (1 - within(t, timing.goneAt, ends));
    if (index % 3 === 0) drawn.motes.push(ball(at, cell * flake.size * 0.7, '#ffffff', 0.95 * shows, 2, flake.variant));
    else layFlake(drawn, at, cell * flake.size * 1.5, 0.95 * shows, 2, flake.variant + t * 3);
  });
  if (blown > 0.02)
    drawn.lights.push({
      ...floor,
      z: floor.z + tall * 0.6,
      color: tones.light,
      strength: 0.5 * blown + (bitten >= 0 && bitten < 0.3 ? 1 - bitten / 0.3 : 0),
      reachPx: cell * 2.8,
    });
  return drawn;
}
