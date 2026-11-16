import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  acrossOf,
  circlePoints,
  floorMark,
  glow,
  keptFor,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { drawVacuumGale } from '@axe/domain/effect/scene/wind/vacuum-gale';
import {
  alongWay,
  curlRibbon,
  debrisKindOf,
  debrisRibbon,
  halvesOf,
  layRibbons,
  scatter,
  streakRibbon,
  type WindPaint,
  windPaintOf,
} from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A wave of the void: a crescent of air pressed hard, thrown from the caster. It flies upright and
 * bowed back, white-green at its leading edge within a slate sheath, its body shimmering as the air
 * in it churns, two afterimages behind it and streaks peeled off its horns, and it ploughs a furrow of
 * dust along the floor under it. It slices through its target in a white line and bursts there into a
 * ring of wind racing out level about the target, the far half of it behind the piece and the near
 * half before it, throwing leaves and dust out over the floor; a low gale of blades goes on slicing
 * at the piece for as long as the landing sounds and settles (see vacuum-gale), and curls of wind
 * are left turning there.
 *
 * Every length is in cells.
 */

/** How far a crescent reaches either side of its way, how thick it is at its belly, and how far its horns are swept back, in cells. */
const REACH = 1.3;
const THICK = 0.48;
const SWEPT = 0.85;
/** How far up from level the crescent is tipped, in radians. */
const TIPPED = 0.3;
/** How many points it is drawn through, and how far behind it each afterimage hangs, as a share of its flight. */
const STEPS = 16;
const GHOST_LAGS = [0.07, 0.14] as const;
/** How far the ring of wind races out, in cells, and how long it takes, in seconds. */
const RING_CELLS = 2.6;
const RING_S = 0.5;
/** How many leaves the burst throws out, and how long they fly, in seconds. */
const LEAVES = 10;
/** How many crescents may fly at once before each is drawn with less: no afterimages and fewer streaks, leaves and rings. */
const CROWDED = 4;
const LEAF_FLIES_S = 1.4;

/** The colours of pressed air: a wind's, its pale body taken towards the green of its own colour. */
function tintedPaintOf(ramp: readonly string[]): WindPaint {
  const paint = windPaintOf(ramp);
  return { ...paint, pale: mixColor(ramp[3], '#ffffff', 0.3), shadow: mixColor(paint.shadow, ramp[1], 0.4) };
}

/** One crescent of a wave in flight. */
export interface VacuumFlight {
  readonly at: Point;
  /** The way it flies, of length one. */
  readonly way: Point;
  readonly cell: number;
  /** How far through its flight it is, and where it was at a share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  readonly seconds: number;
  readonly floorZ: number;
  readonly seed: number;
  /** How many crescents of the cast fly at once, every shot to every target: a crowd of them is drawn with less to each. */
  readonly crowd: number;
}

/** The bands of a crescent of pressed air about a point, flying a way, shown `alpha` and grown `grown`. */
function crescentAt(
  at: Point,
  way: Point,
  U: number,
  grown: number,
  alpha: number,
  paint: WindPaint,
  flowed: number
): EffectRibbon[] {
  const { side, lift } = acrossOf(way);
  const span = {
    x: side.x * Math.cos(TIPPED) + lift.x * Math.sin(TIPPED),
    y: side.y * Math.cos(TIPPED) + lift.y * Math.sin(TIPPED),
    z: side.z * Math.cos(TIPPED) + lift.z * Math.sin(TIPPED),
  };
  const reach = U * REACH * grown;
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => (index / STEPS) * 2 - 1);
  const points = shares.map((share) =>
    alongWay(alongWay(at, span, share * reach), way, -SWEPT * reach * share * share)
  );
  const lead = shares.map((share) =>
    alongWay(alongWay(at, span, share * reach * 0.96), way, U * 0.08 - SWEPT * reach * share * share)
  );
  const widths = shares.map((share) => U * THICK * grown * Math.pow(1 - share * share, 0.8));
  return [
    {
      points,
      widths: widths.map((wide) => wide * 1.4),
      color: paint.shadow,
      alpha: 0.75 * alpha,
      blend: 'color',
      torn: 0.45,
      soft: 0.3,
      flowed,
    },
    {
      points,
      widths,
      color: paint.pale,
      core: '#ffffff',
      alpha: 0.95 * alpha,
      blend: 'color',
      torn: 0.35,
      soft: 0.15,
      flowed: flowed * 1.4 + 2,
    },
    { points: lead, widths: widths.map((wide) => wide * 0.32), color: '#ffffff', alpha, blend: 'light' },
  ];
}

/** A crescent of pressed air in flight: see the head of this file. */
export function drawVacuumFlight(drawn: Staged, flight: VacuumFlight, ramp: readonly string[]): void {
  const U = flight.cell;
  const paint = tintedPaintOf(ramp);
  const grown = 0.35 + 0.65 * outCubic(within(flight.share, 0, 0.2));
  const flowed = flight.seconds * 10;
  const full = flight.crowd <= CROWDED;
  layRibbons(drawn, crescentAt(flight.at, flight.way, U, grown, 1, paint, flowed));
  for (const [ghost, lag] of GHOST_LAGS.entries()) {
    if (flight.share < lag || !full) continue;
    const at = flight.pathAt(flight.share - lag);
    layRibbons(
      drawn,
      crescentAt(at, flight.way, U, grown * (1.08 + 0.08 * ghost), ghost === 0 ? 0.38 : 0.18, paint, flowed)
    );
  }
  drawn.motes.push(
    flowingMote('gust', alongWay(flight.at, flight.way, -U * 0.9), flight.way, U * 0.9 * grown, U * 1.2, flowed, {
      color: paint.pale,
      core: '#ffffff',
      alpha: 0.45,
      forward: U * 0.4,
      variant: flight.seed % 7,
    })
  );
  const { side } = acrossOf(flight.way);
  for (let streak = 0; streak < (full ? 6 : 2); streak++) {
    const horn = streak % 2 === 0 ? 1 : -1;
    const out = horn * U * REACH * grown * (0.7 + 0.1 * (streak >> 1));
    const head = alongWay(alongWay(flight.at, side, out), flight.way, -U * SWEPT * REACH * grown * 0.8);
    const tail = alongWay(head, flight.way, -U * (1 + 0.5 * scatter(streak, flight.seed)));
    drawn.ribbons.push(
      streakRibbon(tail, head, U * 0.09, 0.85, paint, { side, by: U * 0.06, phase: streak + flight.seconds * 9 })
    );
  }
  const under = { x: flight.at.x, y: flight.at.y, z: flight.floorZ };
  for (let puff = 0; puff < 4; puff++) {
    const back = flight.pathAt(Math.max(0, flight.share - 0.05 * (puff + 1)));
    const shown = (1 - puff / 4) * 0.5;
    drawn.motes.push(
      smokePuff(
        { x: back.x, y: back.y, z: flight.floorZ + U * (0.15 + 0.12 * puff) },
        U * (0.5 + 0.2 * puff),
        paint.dust,
        shown,
        U * 0.3
      )
    );
  }
  drawn.floor.push(floorMark('disc', under, U * 0.9, 1, paint.dust, 0.35, 'color', 0));
}

interface BurstThrow {
  readonly dust: readonly Cloud[];
}

const burstByStage = new Map<string, BurstThrow>();

/**
 * Where a wave of the void lands, on the landing's own clock: a white line sliced through the target,
 * a ring of wind racing out level about it, leaves and dust thrown out over the floor, a gale of
 * blades slicing on at the piece until it dies down, and curls of wind left turning there.
 */
export function drawVacuumBurst(stage: Stage): Staged {
  const drawn = nothingStaged();
  const U = stage.cell;
  const t = stage.seconds;
  if (t < 0) return drawn;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const paint = tintedPaintOf(ramp);
  const ends = stage.duration + 1.8;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + Math.max(stage.tall * 0.5, U * 0.3) };
  const forward = U * 0.4;
  const crowd = stage.preset.shotCount * Math.max(1, stage.targets.length);
  const full = crowd <= CROWDED;
  const thrown = keptFor(burstByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return {
      dust: kickedDust(th, floor, th.count(14), paint.dust, {
        speed: [3, 7],
        size: [0.45, 0.75],
        bornAt: [0, 0.06],
        rise: [0.5, 2],
        alpha: 0.6,
        life: [0.6, 1.2],
      }),
    };
  });
  const dx = stage.origin ? stage.x - stage.origin.x : 1;
  const dy = stage.origin ? stage.y - stage.origin.y : -1;
  const far = Math.hypot(dx, dy) || 1;
  const way = { x: dx / far, y: dy / far, z: 0 };
  const { side } = acrossOf(way);
  if (t < 0.3) {
    const sliced = 1 - t / 0.3;
    for (const [cut, tipped] of [0.18, -0.55].entries()) {
      if (cut === 1 && (t < 0.04 || !full)) continue;
      const across = { x: side.x, y: side.y, z: tipped };
      const points = [alongWay(chest, across, -U * 1.7), chest, alongWay(chest, across, U * 1.7)];
      drawn.ribbons.push(
        { points, widths: [0, U * 0.34 * sliced, 0], color: paint.shadow, alpha: 0.8 * sliced, blend: 'color' },
        { points, widths: [0, U * 0.15 * sliced, 0], color: '#ffffff', alpha: sliced, blend: 'color' }
      );
    }
    drawn.motes.push(...starBurst(chest, U * 2.6, paint.pale, t / 0.3, U * 0.5, 8, stage.seed));
    drawn.motes.push(glow(chest, U * 2.3, '#ffffff', 0.75 * sliced, forward));
    if (t < 0.1) drawn.floor.push(floorMark('disc', floor, U * 1.8, 1, '#ffffff', 0.45 * (1 - t / 0.1), 'light', 0));
  }
  drawVacuumGale(drawn, stage, floor, chest, ends, paint, crowd);
  layRing(drawn, floor, chest, t, U, paint, full ? 30 : 16);
  if (full) layRing(drawn, floor, chest, t - 0.08, U * 0.8, paint);
  layShockRing(drawn, floor, U * 0.4, U * RING_CELLS * 1.1, U * 0.35, paint.dust, t, 0.55);
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, U, 0);
  for (let leaf = 0; leaf < (full ? LEAVES : 3) && t < LEAF_FLIES_S; leaf++) {
    const share = t / LEAF_FLIES_S;
    const round = (leaf / LEAVES) * Math.PI * 2 + scatter(leaf, stage.seed) * 0.6;
    const out = U * (0.6 + 2 * scatter(leaf, stage.seed + 1)) * outCubic(share);
    const rise = U * (0.8 + 1.2 * scatter(leaf, stage.seed + 2)) * Math.sin(Math.PI * Math.min(1, share * 1.2));
    drawn.ribbons.push(
      debrisRibbon({
        kind: debrisKindOf(leaf),
        at: {
          x: floor.x + Math.cos(round) * out,
          y: floor.y + Math.sin(round) * out,
          z: Math.max(floor.z + U * 0.05, chest.z * 0.4 + floor.z * 0.6 + rise - U * share * share),
        },
        size: U * (0.24 + 0.1 * scatter(leaf, stage.seed + 3)),
        turn: t * (8 + leaf) + leaf,
        tip: t * 6 + leaf,
        alpha: Math.min(1, (1 - share) * 4),
        variant: leaf + stage.seed,
      })
    );
  }
  const left = 1 - within(t, ends - 0.9, ends - 0.2);
  for (let curl = 0; curl < (full ? 3 : 1) && t > 0.2; curl++) {
    const round = curl * 2.1 + stage.seed;
    const at = {
      x: floor.x + Math.cos(round) * U * 0.9,
      y: floor.y + Math.sin(round) * U * 0.9,
      z: floor.z + U * 0.05,
    };
    drawn.ribbons.push(
      curlRibbon(
        at,
        U * 0.5,
        t * 4 + curl,
        U * 0.13,
        0.8 * left * Math.min(1, (t - 0.2) * 4),
        paint,
        curl % 2 === 0 ? 1 : -1
      )
    );
  }
  return drawn;
}

/** A ring of wind racing out level about a target at a moment of its burst, drawn by halves about the piece. */
function layRing(drawn: Staged, floor: Point, chest: Point, t: number, U: number, paint: WindPaint, steps = 30): void {
  if (t < 0 || t >= RING_S + 0.15) return;
  const share = within(t, 0, RING_S);
  const radius = U * (0.3 + RING_CELLS * outCubic(share));
  const high = floor.z + (chest.z - floor.z) * (0.7 - 0.3 * share);
  const shown = Math.min(1, t / 0.04) * (1 - within(t, RING_S * 0.6, RING_S + 0.15));
  const points = circlePoints({ ...floor, z: high }, radius, steps, t * 3, t * 3 + Math.PI * 2);
  const about = points.map(() => ({ ...floor, z: high }));
  const wide = U * (0.42 - 0.2 * share);
  const body: EffectRibbon = {
    points,
    widths: wide,
    color: paint.pale,
    core: '#ffffff',
    alpha: 0.95 * shown,
    blend: 'color',
    torn: 0.4,
    soft: 0.2,
    flowed: t * 12,
  };
  const sheath: EffectRibbon = {
    points,
    widths: wide * 1.45,
    color: paint.shadow,
    alpha: 0.7 * shown,
    blend: 'color',
    torn: 0.5,
    soft: 0.3,
    flowed: t * 10,
  };
  const back = halvesOf(sheath, about, paint.shadow);
  const front = halvesOf(body, about, paint.shadow);
  drawn.ribbons.push(back.far, front.far, back.near, front.near);
}
