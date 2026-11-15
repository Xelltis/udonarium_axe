import {
  type Chip,
  cutChips,
  cutSparks,
  drawChip,
  drawCrossing,
  drawCutMark,
} from '@axe/domain/effect/scene/blade/blade-trail';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark } from '@axe/domain/effect/scene/fire/fire-parts';
import { acrossOf, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A cut that flies: a crescent of force thrown off a blade, across the way it goes and bowed back
 * from it, its leading edge hard and white and a torn wake streaming behind; ghosts of itself hang
 * where it has just been, the air it parts streaks back off its horns, and the floor under its path
 * is scored for a moment. Those of a volley are each tipped their own way, upright, slanting, level.
 * Where one lands it goes on through its target a little way and is gone, leaving the cut every
 * blade leaves, across the target the way the crescent was tipped, and its sparks thrown on ahead.
 */

/** How far each crescent of a volley is tipped up from level, in degrees, and one thrown alone. */
const TIPPED = [78, -38, 0, 38, -70, 20, 55, -20];
const TIPPED_ALONE = 16;
/** How far a crescent reaches either side of its way, and how thick its wake is, in cells. */
const REACH = 0.95;
const WAKE = 0.5;
/** How far a crescent's horns are swept back, as a share of its reach, and how far round they bend, in radians. */
const SWEPT = 0.62;
const BENT = 1.2;
/** How long the score on the floor under its path takes to fade, in seconds. */
const SCORE_FADES_S = 0.45;
/** How far past its target a crescent carries on, in cells, and for how long, in seconds. */
const CARRIES_ON = 0.8;
const CARRIES_S = 0.14;
const STEPS = 14;

/** One crescent in flight. */
export interface SlashFlight {
  readonly at: Point;
  /** The way it flies, of length one. */
  readonly way: Point;
  readonly cell: number;
  /** How far through its flight it is, and where it was at a share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  /** How long its flight takes, in seconds. */
  readonly fliesS: number;
  readonly seconds: number;
  /** Which of a volley it is, and how many the volley has. */
  readonly index: number;
  readonly count: number;
  readonly floorZ: number;
}

/** How far a crescent of a volley is tipped up from level, in radians. */
function tippedOf(index: number, count: number): number {
  return ((count > 1 ? TIPPED[index % TIPPED.length] : TIPPED_ALONE) * Math.PI) / 180;
}

/** The way across a crescent, from one horn to the other, tipped up from level. */
function spanOf(way: Point, tipped: number): Point {
  const { side, lift } = acrossOf(way);
  return {
    x: side.x * Math.cos(tipped) + lift.x * Math.sin(tipped),
    y: side.y * Math.cos(tipped) + lift.y * Math.sin(tipped),
    z: side.z * Math.cos(tipped) + lift.z * Math.sin(tipped),
  };
}

/** The bands of a crescent at a place: a glow, the torn wake behind its edge, and the dark outline and hard edge that lead it. */
function crescentRibbons(
  at: Point,
  way: Point,
  span: Point,
  cell: number,
  ramp: readonly string[],
  alpha: number,
  flowed: number,
  floorZ: number,
  ghost = false
): EffectRibbon[] {
  const reach = cell * REACH;
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => (index / STEPS) * 2 - 1);
  const bowed = shares.map((share) => Math.pow(Math.cos((share * Math.PI) / 2), 0.7));
  const lowest = floorZ + cell * 0.08;
  const points = (behind: (index: number) => number): Point[] =>
    shares.map((share, index) => {
      const back = (1 - Math.cos(share * BENT)) * reach * SWEPT + behind(index);
      return {
        x: at.x + span.x * share * reach - way.x * back,
        y: at.y + span.y * share * reach - way.y * back,
        z: Math.max(lowest, at.z + span.z * share * reach - way.z * back),
      };
    });
  const fine = cell * 0.11;
  const wake = cell * WAKE;
  const leading = points((index) => fine * bowed[index] * 0.5);
  const outline: EffectRibbon = {
    points: leading,
    widths: bowed.map((share) => fine * 2 * share),
    color: ramp[0],
    alpha: 0.75 * alpha,
    blend: 'color',
  };
  const edge: EffectRibbon = {
    points: leading,
    widths: bowed.map((share) => fine * share),
    color: '#ffffff',
    alpha,
    blend: 'color',
  };
  if (ghost) return [outline, edge];
  const behind = (reach: number) => points((index) => (fine + wake * reach) * bowed[index]);
  return [
    outline,
    {
      points: behind(0.5),
      widths: bowed.map((share) => wake * 1.7 * share),
      color: ramp[2],
      alpha: 0.25 * alpha,
      blend: 'light',
      soft: 1,
      flowed,
    },
    {
      points: behind(0.45),
      widths: bowed.map((share) => wake * share),
      color: ramp[2],
      alpha: 0.85 * alpha,
      blend: 'color',
      torn: 0.6,
      soft: 0.35,
      flowed,
    },
    {
      points: behind(0.16),
      widths: bowed.map((share) => wake * 0.5 * share),
      color: ramp[4],
      alpha,
      blend: 'color',
      torn: 0.3,
      soft: 0.45,
      flowed: flowed * 1.3,
    },
    edge,
  ];
}

/** The score a crescent leaves on the floor under its path between two shares of its flight, each point fading from the moment it was passed. */
function drawScore(
  drawn: Staged,
  pathAt: (along: number) => Point,
  upTo: number,
  sincePassed: (share: number) => number,
  cell: number,
  ramp: readonly string[],
  floorZ: number
): void {
  const steps = 8;
  const shares = Array.from({ length: steps + 1 }, (_unused, index) => (upTo * index) / steps);
  const alphas = shares.map((share) => 1 - within(sincePassed(share), 0, SCORE_FADES_S));
  if (alphas.every((alpha) => alpha <= 0)) return;
  const points = shares.map((share) => ({ ...pathAt(share), z: floorZ + 2 }));
  drawn.ribbons.push({ points, widths: cell * 0.09, color: ramp[0], alpha: 0.55, alphas, blend: 'color' });
  drawn.ribbons.push({ points, widths: cell * 0.035, color: ramp[3], alpha: 0.8, alphas, blend: 'light' });
}

/** A crescent in flight; see the head of this file. */
export function drawFlyingSlash(drawn: Staged, flight: SlashFlight, ramp: readonly string[]): void {
  const { at, way, cell, share, pathAt, fliesS, seconds } = flight;
  const span = spanOf(way, tippedOf(flight.index, flight.count));
  const forward = cell * 0.4;
  drawScore(drawn, pathAt, share, (passed) => (share - passed) * fliesS, cell, ramp, flight.floorZ);
  for (const [ghost, back] of [0.14, 0.07].entries()) {
    if (share - back <= 0) continue;
    const faint = 0.22 + 0.2 * ghost;
    drawn.ribbons.push(...crescentRibbons(pathAt(share - back), way, span, cell, ramp, faint, 0, flight.floorZ, true));
  }
  drawn.ribbons.push(...crescentRibbons(at, way, span, cell, ramp, 1, seconds * 6 + flight.index, flight.floorZ));
  drawn.motes.push(glow(at, cell * 0.9, ramp[3], 0.3, forward));
  const speed = cell * 14;
  for (let streak = 0; streak < 8; streak++) {
    const horn = (streak % 2 === 0 ? 1 : -1) * (0.45 + ((streak * 37) % 10) / 18);
    const back = cell * (0.5 + ((((streak * 53) % 10) / 10 + seconds * 9) % 1.4));
    drawn.motes.push({
      ...glow(
        {
          x: at.x + span.x * horn * cell * REACH - way.x * back,
          y: at.y + span.y * horn * cell * REACH - way.y * back,
          z: Math.max(flight.floorZ, at.z + span.z * horn * cell * REACH - way.z * back),
        },
        cell * 0.035,
        ramp[4],
        0.8 * (1 - back / (cell * 1.9)),
        forward
      ),
      shape: 'spark',
      velocity: { x: way.x * speed, y: way.y * speed, z: way.z * speed },
      trail: 0.03,
    });
  }
  drawn.lights.push({ ...at, color: ramp[4], strength: 0.35, reachPx: cell * 2 });
}

interface LandingThrown {
  readonly sparks: readonly ThrownMote[];
  readonly chips: readonly Chip[];
}

const thrownByStage = new Map<string, LandingThrown>();

/**
 * A crescent landing, on the clock of its landing: it carries on through its target and is gone,
 * leaving its cut across the target and its sparks thrown ahead, and the score under its path fades.
 * `index` of `count` tells which of a volley it is, and `fliesS` how long it flew, in seconds.
 */
export function drawSlashLanding(landed: Stage, index: number, count: number, fliesS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = landed;
  const since = landed.seconds;
  const ramp = rampOf(landed.preset.colorPrimary, landed.preset.colorSecondary, 7);
  const struck = { x: landed.x, y: landed.y, z: landed.z + cell * 0.5 };
  const from = landed.origin ?? { x: struck.x, y: struck.y + cell * 3, z: struck.z };
  const dx = struck.x - from.x;
  const dy = struck.y - from.y;
  const far = Math.hypot(dx, dy) || 1;
  const way = { x: dx / far, y: dy / far, z: 0 };
  const span = spanOf(way, tippedOf(index, count));
  const forward = cell * 0.5;
  const thrown = keptFor(thrownByStage, stageKey(landed, index), () => {
    const th = throwerFor(landed, 1.2);
    return {
      sparks: cutSparks(th, struck, way, th.count(count > 1 ? 9 : 20), [5, 12], [0, 0.02]),
      chips: cutChips(th, struck, way, th.count(count > 1 ? 2 : 4), 0),
    };
  });
  const carried = within(since, 0, CARRIES_S);
  if (carried < 1) {
    const on = cell * CARRIES_ON * carried;
    const at = { x: struck.x + way.x * on, y: struck.y + way.y * on, z: struck.z };
    drawn.ribbons.push(
      ...crescentRibbons(at, way, span, cell, ramp, Math.pow(1 - carried, 1.3), since * 6, landed.groundZ)
    );
  }
  drawScore(
    drawn,
    (share) => ({ x: from.x + dx * share, y: from.y + dy * share, z: landed.groundZ }),
    1,
    (passed) => since + (1 - passed) * fliesS,
    cell,
    ramp,
    landed.groundZ
  );
  drawCutMark(drawn, struck, span, cell * 0.55, ramp, since, 0.6, 1.1, landed.groundZ + cell * 0.1);
  drawCrossing(drawn, struck, cell, ramp, since, count > 1 ? 0.8 : 1.1, forward);
  for (const [spark, flying] of thrown.sparks.entries())
    drawSpark(drawn, flying, since, cell * 0.8, ramp, spark, forward);
  for (const chip of thrown.chips) drawChip(drawn, chip, since, cell, ramp[4], forward);
  return drawn;
}
