import {
  type Chip,
  cutChips,
  cutSparks,
  drawChip,
  drawCrossing,
  drawGlint,
} from '@axe/domain/effect/scene/blade/blade-trail';
import { chestOf, cutFrameOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark } from '@axe/domain/effect/scene/fire/fire-parts';
import { floorMark, glow, keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { SLASH_IAI_DRAWN_AT, slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A drawing cut. The floor about the target darkens and steel glints at the caster's hand; then one
 * line is drawn at once from the caster on through the target, long, level and white, and is at once
 * no more than a hair of light lying through it. Nothing moves. The blade slides home, and as it clicks into its
 * sheath the hair parts: the cut opens across the target, light pours out of it, sparks run both
 * ways along the line, and petals of light are left falling where it was.
 */

/** How long the line takes to cross, and how long its flash takes to thin to a hair, in seconds. */
const CROSSES_S = 0.05;
const THINS_S = 0.32;
/** How long the blade takes to slide home before the cut opens, in seconds. */
const SHEATHES_S = 0.4;
/** How long the cut takes to open, and how long its light lasts, in seconds. */
const OPENS_S = 0.22;
const LIGHT_LASTS_S = 0.5;
/** How many petals of light fall from where the line was, and for how long, in seconds. */
const PETALS = 16;
const PETALS_FALL_S = 1.3;
/** How dark the floor about the target is made, and how far out, in cells. */
const HUSH = 0.62;
const HUSH_CELLS = 3.4;
const HUSH_COLOR = '#070b18';
/** How far behind its caster's hand the line begins, and how far past the target it ends, in cells. */
const BEHIND_HAND = 0.4;
const PAST_TARGET = 1.5;
const STEPS = 14;

interface IaiThrown {
  readonly sparks: readonly ThrownMote[];
  readonly chips: readonly Chip[];
}

const thrownByStage = new Map<string, IaiThrown>();

/** A drawing cut on one target; see the head of this file. */
export function drawDrawingCut(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('iai');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const frame = cutFrameOf(stage);
  const way = { x: -frame.toward.x, y: -frame.toward.y, z: 0 };
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const half = (hit.reach / 2) * cell;
  const forward = cell * 0.5;
  const opensAt = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const drawnAt = Math.min(SLASH_IAI_DRAWN_AT * duration, opensAt * 0.5);
  const ends = duration + lingerS;
  const handFar = stage.origin ? Math.hypot(stage.origin.x - stage.x, stage.origin.y - stage.y) : half;
  const behind = Math.min(half, handFar + cell * BEHIND_HAND);
  const beyond = Math.min(half, cell * PAST_TARGET);
  const lineAt = (share: number, apart = 0): Point => {
    const far = share < 0 ? share * behind : share * beyond;
    return { x: centre.x + way.x * far, y: centre.y + way.y * far, z: Math.max(frame.lowestZ, centre.z + apart) };
  };
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    const back = { x: -way.x, y: -way.y, z: -way.z };
    return {
      sparks: [
        ...cutSparks(th, centre, way, th.count(16), [5, 13], [opensAt, opensAt + 0.03]),
        ...cutSparks(th, centre, back, th.count(16), [5, 13], [opensAt, opensAt + 0.03]),
      ],
      chips: cutChips(th, centre, way, th.count(5), opensAt),
    };
  });

  const hush = Math.min(within(t, 0, drawnAt), 1 - within(t, opensAt, opensAt + 0.18));
  if (hush > 0) {
    drawn.floor.push(floorMark('disc', floor, cell * HUSH_CELLS, 1, HUSH_COLOR, HUSH * hush, 'color', 0));
  }
  const hand = stage.origin ?? lineAt(-1);
  if (t < drawnAt) drawGlint(drawn, hand, cell * 0.45 * (t / drawnAt), ramp[3], 1, forward, t * 9);

  const since = t - drawnAt;
  if (since >= 0 && t < opensAt) drawLine(drawn, lineAt, cell, ramp, since, forward, way);
  if (since >= 0 && t < opensAt) drawSheathing(drawn, hand, way, cell, ramp, t, opensAt, forward);

  const opened = t - opensAt;
  if (opened >= 0) {
    drawOpening(drawn, lineAt, cell, ramp, opened);
    drawCrossing(drawn, centre, cell, ramp, opened, 1.5, forward);
    drawGlint(drawn, hand, cell * 0.5, ramp[3], 1 - within(opened, 0, 0.16), forward, 0.8);
    drawPetals(drawn, lineAt, cell, ramp, opened, stage.seed, forward);
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell * 0.8, ramp, index, forward);
    for (const chip of thrown.chips) drawChip(drawn, chip, t, cell, ramp[4], forward);
  }
  return drawn;
}

/** How wide the line is along it: full through its middle, pointed at both ends. */
function along(share: number): number {
  return Math.pow(Math.max(0, 1 - Math.abs(share)), 0.35);
}

/**
 * The line, `since` seconds after it is drawn: it runs from one end to the other in an instant, wide
 * and white with lines racing along it, thins at once to a hair within a dark outline, and lies
 * there, a glint running along it now and then.
 */
function drawLine(
  drawn: Staged,
  lineAt: (share: number, apart?: number) => Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  forward: number,
  way: Point
): void {
  const reached = -1 + 2 * within(since, 0, CROSSES_S);
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => -1 + ((reached + 1) * index) / STEPS);
  const points = shares.map((share) => lineAt(share));
  const widths = shares.map((share) => along(share));
  const flash = 1 - within(since, CROSSES_S, THINS_S);
  if (flash > 0) {
    drawn.ribbons.push({
      points,
      widths: widths.map((width) => cell * 0.7 * width * flash),
      color: ramp[2],
      alpha: 0.4 * flash,
      blend: 'light',
      soft: 1,
    });
    drawn.motes.push(glow(lineAt(0), cell * 1.3, ramp[3], 0.5 * flash * flash, forward));
    drawn.lights.push({ ...lineAt(0), color: '#ffffff', strength: 0.7 * flash, reachPx: cell * 3 });
    for (let index = 0; index < 12; index++) {
      const apart = (index % 2 === 0 ? 1 : -1) * cell * (0.12 + ((index * 37) % 10) / 22);
      const at = lineAt(((index * 53) % 20) / 10 - 1.3 + (1 - flash) * 1.6, apart);
      const speed = cell * 16;
      drawn.motes.push({
        ...glow(at, cell * 0.035, ramp[5], flash, forward),
        shape: 'spark',
        velocity: { x: way.x * speed, y: way.y * speed, z: way.z * speed },
        trail: 0.045,
      });
    }
  }
  const fine = cell * (0.026 + 0.09 * Math.pow(flash, 1.5));
  drawn.ribbons.push({
    points,
    widths: widths.map((width) => fine * 2.6 * width),
    color: ramp[0],
    alpha: 0.75,
    blend: 'color',
  });
  drawn.ribbons.push({
    points,
    widths: widths.map((width) => fine * width),
    color: ramp[3],
    core: '#ffffff',
    alpha: 1,
    blend: 'color',
  });
  const running = ((since - THINS_S) * 1.1) % 1.6;
  if (since > THINS_S && running < 1) {
    drawGlint(
      drawn,
      lineAt(running * 1.6 - 0.8),
      cell * 0.3 * Math.sin(Math.PI * running),
      ramp[3],
      1,
      forward,
      since * 5
    );
  }
}

/** The blade sliding home at the caster's hand before the cut opens: a short line of light drawn in to a point. */
function drawSheathing(
  drawn: Staged,
  hand: Point,
  way: Point,
  cell: number,
  ramp: readonly string[],
  t: number,
  opensAt: number,
  forward: number
): void {
  const sliding = within(t, opensAt - SHEATHES_S, opensAt);
  if (sliding <= 0) return;
  const left = cell * 0.7 * (1 - sliding);
  const tip = { x: hand.x + way.x * left, y: hand.y + way.y * left, z: hand.z + cell * 0.25 * (1 - sliding) };
  drawn.ribbons.push({
    points: [hand, tip],
    widths: [cell * 0.05, 0],
    color: ramp[3],
    core: '#ffffff',
    alpha: Math.min(1, sliding * 4),
    blend: 'color',
  });
  drawn.motes.push(glow(tip, cell * 0.16, ramp[4], 0.8 * Math.min(1, sliding * 4), forward));
}

/**
 * The cut opening, `since` seconds after it does: the hair parts into two edges that draw apart
 * about the target, and between them a blade of light that flares and fails.
 */
function drawOpening(
  drawn: Staged,
  lineAt: (share: number, apart?: number) => Point,
  cell: number,
  ramp: readonly string[],
  since: number
): void {
  if (since >= LIGHT_LASTS_S) return;
  const opening = outCubic(within(since, 0, OPENS_S));
  const left = Math.pow(1 - since / LIGHT_LASTS_S, 1.3);
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => (index / STEPS) * 2 - 1);
  const gape = shares.map((share) => Math.pow(Math.max(0, 1 - Math.abs(share) * 1.5), 1.1));
  const points = shares.map((share) => lineAt(share));
  drawn.ribbons.push({
    points,
    widths: gape.map((width) => cell * (0.3 + 0.3 * opening) * width * left),
    color: ramp[2],
    alpha: 0.45 * left * left,
    blend: 'light',
    soft: 1,
  });
  drawn.ribbons.push({
    points,
    widths: gape.map((width) => cell * 0.24 * opening * width * Math.pow(left, 1.5)),
    color: ramp[3],
    core: '#ffffff',
    alpha: Math.min(1, left * 3),
    blend: 'color',
  });
  for (const side of [-1, 1]) {
    drawn.ribbons.push({
      points: shares.map((share, index) => lineAt(share, side * cell * 0.13 * opening * gape[index])),
      widths: shares.map((share) => cell * 0.045 * along(share)),
      color: ramp[4],
      core: '#ffffff',
      alpha: Math.min(1, left * 1.6),
      blend: 'color',
    });
  }
}

/** Petals of light left falling from where the line was, turning and twinkling as they go. */
function drawPetals(
  drawn: Staged,
  lineAt: (share: number, apart?: number) => Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  seed: number,
  forward: number
): void {
  for (let index = 0; index < PETALS; index++) {
    const born = 0.04 + ((index * 7) % PETALS) * 0.018;
    const age = (since - born) / PETALS_FALL_S;
    if (age <= 0 || age >= 1) continue;
    const share = (((index * 11 + seed) % PETALS) / (PETALS - 1)) * 1.5 - 0.75;
    const sway = Math.sin(age * 7 + index * 1.7) * cell * 0.12;
    const at = lineAt(share + sway / (cell * 3), -cell * (0.1 + 0.75 * age * age) + cell * 0.2 * Math.sin(index * 2.3));
    drawn.motes.push({
      x: at.x,
      y: at.y,
      z: at.z,
      size: cell * (0.07 + 0.04 * ((index * 5) % 3)),
      color: index % 3 === 0 ? '#ffffff' : ramp[3],
      alpha: Math.min(1, age * 8) * (1 - age) * (0.6 + 0.4 * Math.sin(since * 19 + index * 2.9)),
      blend: 'light',
      shape: 'flake',
      spin: since * (3 + (index % 4)) + index,
      variant: index,
      forward,
    });
  }
}
