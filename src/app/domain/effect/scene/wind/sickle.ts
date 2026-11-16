import { type Swing, swingPoint } from '@axe/domain/effect/scene/blade/crescent';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, type Point, smokePuff, starBurst } from '@axe/domain/effect/scene/parts';
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
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * Sickles of wind: blades no one holds, made of the air itself. Each stroke the form of the cut gives
 * is a crescent of white wind sweeping through the target from its own side, a dark slate sheath
 * under it so it holds over a bright table, two afterimages trailing and streaks of air peeled off
 * its points. Where it crosses there is a hard white glint, the cut it leaves hangs in the air
 * through the target as a thin white line, and leaves and grit are torn off and flung the way it went.
 * The cuts hang until a moment after the last stroke, when a gust whips round the target and blows
 * them apart, and curls of wind are left turning on the floor while the leaves come down.
 *
 * Every length is in cells.
 */

/** How long a stroke takes to sweep through, and how long its crescent hangs and fades after, in seconds. */
const SWEEPS_S = 0.12;
const FADES_S = 0.3;
/** How long the cut a stroke leaves hangs in the air at the least, and how long the gust that ends them takes, in seconds. */
const HANGS_LEAST_S = 0.35;
const GUST_S = 0.55;
/** How thick a crescent is at its belly, and how far its arc reaches against the reach its form gives. */
const THICK_CELLS = 0.42;
const REACH_SHARE = 0.75;
/** How many points a crescent is drawn through, and how far behind it each afterimage hangs, in radians. */
const STEPS = 18;
const GHOST_LAGS = [0.24, 0.48] as const;
/** How many leaves each stroke tears off, and how long they fly, in seconds. */
const LEAVES = 4;
const LEAF_FLIES_S = 1.1;

/** How wide a crescent is a share of the way from its tail to its head: needle points at both ends and its belly towards the head. */
function bellyAt(share: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(share, 1.3)), 1.2);
}

/** The bands of a crescent of wind along a swing from one turn to another, shown `alpha`, `thick` at its belly. */
function crescentOf(
  swing: Swing,
  from: number,
  to: number,
  thick: number,
  alpha: number,
  paint: WindPaint,
  flowed: number
): EffectRibbon[] {
  if (alpha <= 0.01 || Math.abs(to - from) < 0.02) return [];
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => index / STEPS);
  const points = shares.map((share) => swingPoint(swing, from + (to - from) * share));
  const edge = shares.map((share) => swingPoint(swing, from + (to - from) * share, -thick * 0.22 * bellyAt(share)));
  const widths = shares.map((share) => thick * bellyAt(share));
  const alphas = shares.map((share) => Math.min(1, share * 3));
  return [
    {
      points,
      widths: widths.map((wide) => wide * 1.35),
      color: paint.shadow,
      alpha: 0.7 * alpha,
      alphas,
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
      alphas,
      blend: 'color',
      torn: 0.3,
      soft: 0.15,
      flowed: flowed * 1.3 + 2,
    },
    { points: edge, widths: widths.map((wide) => wide * 0.3), color: '#ffffff', alpha, alphas, blend: 'light' },
  ];
}

/** Sickles of wind on one target: see the head of this file. */
export function drawSickles(stage: Stage): Staged {
  const drawn = nothingStaged();
  const U = stage.cell;
  const t = stage.seconds;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const paint = windPaintOf(ramp);
  const frame = cutFrameOf(stage);
  const chest = chestOf(stage);
  const hits = slashHits(stage.preset.slashLook);
  const crossings = hits.map((hit) => (hit.at + hit.span * 0.3) * stage.duration);
  const last = Math.max(...crossings);
  const blown = last + HANGS_LEAST_S;
  const forward = U * 0.4;
  for (const [index, hit] of hits.entries()) {
    const swing = swingOf({ ...hit, reach: hit.reach * REACH_SHARE }, frame, chest, U);
    const clock = strokeClock(swing, crossings[index], SWEEPS_S, FADES_S, t);
    if (t < clock.starts) continue;
    const thick = U * THICK_CELLS * (index === hits.length - 1 && hits.length > 1 ? 1.3 : 1);
    const flowed = t * 9 + index * 3;
    const shown = 1 - clock.spent;
    const tail = swing.from + (clock.head - swing.from) * Math.max(0, clock.spent);
    layRibbons(drawn, crescentOf(swing, tail, clock.head, thick, shown, paint, flowed));
    for (const [ghost, lag] of GHOST_LAGS.entries()) {
      const head = Math.max(swing.from, clock.head - lag);
      const faded = shown * (ghost === 0 ? 0.42 : 0.2) * (1 - clock.spent);
      const ghostly: WindPaint = { ...paint, pale: mixColor(paint.pale, paint.edge, 0.4) };
      layRibbons(
        drawn,
        crescentOf(swing, Math.max(swing.from, tail - lag), head, thick * 1.15, faded, ghostly, flowed)
      );
    }
    if (clock.swung > 0 && clock.swung < 1) {
      for (const horn of [-1, 1]) {
        const tip = swingPoint(swing, clock.head, thick * 0.3 * horn);
        const way = swingPoint(swing, clock.head - 0.25);
        drawn.ribbons.push(
          streakRibbon(way, tip, U * 0.08, 0.8, paint, { side: swing.toward, by: U * 0.05, phase: index })
        );
      }
    }
    drawCrossing(drawn, swing, t - crossings[index], blown - crossings[index], U, paint, index, stage.seed);
    drawTornLeaves(drawn, swing, chest, t - crossings[index], U, stage.seed + index * 13, stage.groundZ);
  }
  drawGust(drawn, stage, chest, t - blown, U, paint, forward);
  return drawn;
}

/**
 * Where a stroke crosses its target: a hard white glint and a short star, and the cut it leaves
 * hanging in the air through the target, a thin white line in a slate sheath, until the gust blows it
 * apart, its halves drifting off the way the blade went and fading.
 */
function drawCrossing(
  drawn: Staged,
  swing: Swing,
  since: number,
  hangsFor: number,
  U: number,
  paint: WindPaint,
  index: number,
  seed: number
): void {
  if (since < 0) return;
  const at = swing.centre;
  if (since < 0.16) {
    drawn.motes.push(...starBurst(at, U * 1.6, paint.pale, since / 0.16, U * 0.5, 4, seed + index));
    drawn.motes.push(glow(at, U * 1.2, '#ffffff', 0.8 * (1 - since / 0.16), U * 0.5));
  }
  const parted = Math.max(0, since - hangsFor) / 0.35;
  if (parted >= 1) return;
  const reach = U * (0.8 + 0.1 * (index % 3));
  const drift = U * 0.5 * parted;
  for (const half of [-1, 1]) {
    const off = alongWay(at, swing.travel, half * U * 0.06 + half * drift);
    const end = alongWay(off, swing.travel, half * reach);
    const from = { ...off, z: Math.max(swing.lowestZ, off.z) };
    const to = { ...end, z: Math.max(swing.lowestZ, end.z) };
    const points = [from, to];
    const shown = (1 - parted) * Math.min(1, since / 0.04);
    drawn.ribbons.push(
      { points, widths: [U * 0.12, U * 0.02], color: paint.shadow, alpha: 0.6 * shown, blend: 'color' },
      { points, widths: [U * 0.06, U * 0.01], color: '#ffffff', alpha: shown, blend: 'color' }
    );
  }
}

/** The leaves and grit a stroke tears off its target, flung the way the blade went and fluttering down. */
function drawTornLeaves(
  drawn: Staged,
  swing: Swing,
  chest: Point,
  since: number,
  U: number,
  seed: number,
  floorZ: number
): void {
  if (since < 0 || since > LEAF_FLIES_S) return;
  const share = since / LEAF_FLIES_S;
  for (let leaf = 0; leaf < LEAVES; leaf++) {
    const out = U * (0.8 + 1.4 * scatter(leaf, seed)) * (1 - Math.pow(1 - share, 2));
    const aside = (scatter(leaf, seed + 1) - 0.5) * U * 1.2 * share;
    const rise = U * (0.6 + 0.8 * scatter(leaf, seed + 2)) * Math.sin(Math.PI * Math.min(1, share * 1.3));
    const at = {
      x: chest.x + swing.travel.x * out + swing.toward.x * aside,
      y: chest.y + swing.travel.y * out + swing.toward.y * aside,
      z: Math.max(floorZ + U * 0.05, chest.z + rise - U * 0.9 * share * share),
    };
    drawn.ribbons.push(
      debrisRibbon({
        kind: debrisKindOf(leaf + 3),
        at,
        size: U * (0.22 + 0.1 * scatter(leaf, seed + 3)),
        turn: since * (9 + leaf * 2) + leaf,
        tip: since * 7 + leaf,
        alpha: Math.min(1, (1 - share) * 4),
        variant: leaf + seed,
      })
    );
  }
}

/**
 * The gust that ends the cuts: wind whipping round the target, curls of it left turning on the floor,
 * dust thrown up about its feet, and leaves riding round it.
 */
function drawGust(
  drawn: Staged,
  stage: Stage,
  chest: Point,
  since: number,
  U: number,
  paint: WindPaint,
  forward: number
): void {
  const lasts = GUST_S + 0.9;
  if (since < 0 || since > lasts) return;
  const left = 1 - since / lasts;
  const whip = Math.min(1, since / 0.08) * (1 - within(since, GUST_S * 0.5, GUST_S));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  for (let band = 0; band < 3 && whip > 0.01; band++) {
    const high = stage.groundZ + U * (0.25 + 0.35 * band);
    const turn = since * 11 + band * 2.1;
    const points = Array.from({ length: 12 }, (_unused, index) => {
      const round = turn + (index / 11) * Math.PI * 1.4;
      const out = U * (0.75 + 0.15 * band + 0.6 * since);
      return { x: floor.x + Math.cos(round) * out, y: floor.y + Math.sin(round) * out, z: high + U * 0.05 * index };
    });
    const ribbon: EffectRibbon = {
      points,
      widths: points.map((_point, index) => U * 0.22 * Math.sin((Math.PI * (index + 0.5)) / 12)),
      color: paint.edge,
      core: '#ffffff',
      alpha: 0.9 * whip,
      alphas: points.map((_point, index) => Math.min(1, (index / 11) * 2.5)),
      blend: 'color',
      torn: 0.4,
      soft: 0.25,
      flowed: since * 8 + band,
    };
    const halves = halvesOf(
      ribbon,
      points.map(() => chest),
      paint.shadow
    );
    drawn.ribbons.push(halves.far, halves.near);
  }
  for (let curl = 0; curl < 3; curl++) {
    const round = curl * 2.1 + stage.seed;
    const at = {
      x: floor.x + Math.cos(round) * U * 0.7,
      y: floor.y + Math.sin(round) * U * 0.7,
      z: floor.z + U * 0.05,
    };
    drawn.ribbons.push(
      curlRibbon(at, U * 0.45, since * 5 + curl, U * 0.12, 0.8 * left, paint, curl % 2 === 0 ? 1 : -1)
    );
  }
  if (since < 0.6) {
    for (let puff = 0; puff < 5; puff++) {
      const round = puff * 1.26 + since * 3;
      const out = U * (0.4 + 1.1 * since);
      drawn.motes.push(
        smokePuff(
          { x: floor.x + Math.cos(round) * out, y: floor.y + Math.sin(round) * out, z: floor.z + U * 0.2 },
          U * 0.6,
          paint.dust,
          0.45 * (1 - since / 0.6),
          forward
        )
      );
    }
  }
  drawn.floor.push(
    floorMark('ring', floor, U * (0.5 + 1.6 * Math.min(1, since / 0.4)), 0.12, paint.dust, 0.5 * left, 'color', 0)
  );
  drawn.motes.push(
    flowingMote('gust', { ...floor, z: floor.z + U * 0.3 }, { x: 0, y: 0, z: 1 }, U * 1.1, U * 1.4, since * 6, {
      color: paint.pale,
      core: '#ffffff',
      alpha: 0.35 * whip,
      forward,
      variant: stage.seed % 7,
    })
  );
}
