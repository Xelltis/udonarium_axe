import { type BladeTones, bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import {
  crescentRibbons,
  drawTipShreds,
  speedLines,
  type Swing,
  swingPoint,
} from '@axe/domain/effect/scene/blade/crescent';
import { drawDrift, drawImpact, drawSeam, type Impact, layCutScore } from '@axe/domain/effect/scene/blade/cut-impact';
import { drawImpactFrame } from '@axe/domain/effect/scene/blade/impact-frame';
import { drawCleave } from '@axe/domain/effect/scene/blade/slash-cleave';
import { drawDrawingCut } from '@axe/domain/effect/scene/blade/slash-iai';
import { drawSweep } from '@axe/domain/effect/scene/blade/slash-sweep';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { glow, type Point, starBurst } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawSickles } from '@axe/domain/effect/scene/wind/sickle';
import { SLASH_COMBO_OPENS_AT, slashHits } from '@axe/domain/effect/timeline/blade';
import { cutsAsWind } from '@axe/domain/effect/wind-looks';

/*
 * A cut. Steel glints where the blade is drawn back, and the blade sweeps a great crescent through
 * the air across the target from the side its caster stands: thick, bright, with afterimages behind
 * it, lines of speed along it and the air torn off its point. Where it crosses, everything stops on
 * a line of light right through the target and far past it, sparks and shards burst out and a glint
 * is left; then the cut opens into a seam that sprays light and closes, the crescent hangs and
 * dissolves from its tail, the floor under the stroke is left scored, and motes drift up.
 *
 * The forms differ. One stroke is that and no more. A flurry is five, each from its own side and of
 * its own tint, quick and uneven and the last the largest; their crescents hang about the target
 * together like a flower, the cuts they leave wait as hairs of light, and a moment after the last all
 * of them burst open at once. A drawing cut, a wide sweep and a cleave from above are drawn each in
 * a file of its own. A cut of wind is sickles of wind; see {@link drawSickles}.
 */

/** How long a cut lingers after its playback while what it leaves clears, in seconds. */
const LINGER_S = SCENE_LINGER_S.slash ?? 0.6;
/** How long a stroke takes to swing through, and the last and largest of a flurry, in seconds. */
const STROKE_S = 0.13;
const LAST_STROKE_S = 0.16;
/** How long the crescent of one stroke hangs before it is gone, in seconds, and those of a flurry once their cuts have opened. */
const HANGS_S = 0.5;
const BLOSSOM_FADES_S = 0.4;
/** How long after a stroke its afterimages and its lines of speed are gone, in seconds. */
const GHOSTS_S = 0.22;
/** How long before its stroke steel glints where the blade is drawn back, in seconds. */
const GLINTS_S = 0.07;
/** How long after its stroke the cut one stroke leaves opens, and how long it gapes, in seconds; and the cuts of a flurry. */
const OPENS_AFTER_S = 0.07;
const GAPES_S = 0.65;
const FLURRY_GAPES_S = 0.85;
/** How far the arc of one stroke, and of each stroke of a flurry, reaches against the reach its form gives. */
const REACH_ALONE = 0.84;
const REACH_FLURRY = 1.05;
/**
 * How one stroke on its own is drawn, which no stroke of a flurry is, in cells: how thick its crescent
 * is at its belly and how much further its dark rim stands out, as a share of that; how long the cut it
 * leaves is either side of the target; how hard it lands; and how large the star of its impact frame is.
 */
const THICK_ALONE = 0.5;
const RIM_ALONE = 0.3;
const HALF_ALONE = 1.05;
const WEIGHT_ALONE = 1.4;
const FRAME_ALONE = 1.6;
/** How far towards its paler band the pale of one stroke on its own is taken from its body. */
const PALE_ALONE = 0.45;
/** The tints the strokes of a flurry are taken towards, the last its own colour. */
const TINTS = ['#3aa0ff', '#9a6bff', '#2fe6c0', '#ffb648'];
/** How far either side of the target the floor is scored under one stroke, in cells. */
const SCORE_CELLS = 1.3;

export const slash: Choreography = { lingerS: LINGER_S, draw: drawSlash };

function drawSlash(stage: Stage): Staged {
  if (cutsAsWind(stage.preset)) return drawSickles(stage);
  switch (stage.preset.slashLook) {
    case 'iai':
      return drawDrawingCut(stage, LINGER_S);
    case 'heavy':
      return drawCleave(stage, LINGER_S);
    case 'wide':
      return drawSweep(stage, LINGER_S);
    default:
      return drawStrokes(stage);
  }
}

/** One stroke or a flurry of them, each with its glint, its crescent, its crossing and the cut it leaves. */
function drawStrokes(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration, seed } = stage;
  const t = stage.seconds;
  const hits = slashHits(stage.preset.slashLook);
  const flurry = hits.length > 1;
  const own = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const ownTones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const frame = cutFrameOf(stage);
  const chest = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.5;
  const ends = duration + LINGER_S;
  const opensAt = flurry ? SLASH_COMBO_OPENS_AT * duration : Number.POSITIVE_INFINITY;
  const clearing = 1 - within(t, ends - 0.4, ends);

  hits.forEach((hit, index) => {
    const last = index === hits.length - 1;
    const tinted = flurry && !last;
    const tint = tinted ? mixColor(stage.preset.colorSecondary, TINTS[index % TINTS.length], 0.75) : '';
    const ramp = tinted ? rampOf(stage.preset.colorPrimary, tint, 7) : own;
    const tones = tinted ? bladeTonesOf(stage.preset.colorPrimary, tint) : flurry ? ownTones : deepened(ownTones);
    const centre = {
      x: chest.x + frame.across.x * hit.offsetX * cell,
      y: chest.y + frame.across.y * hit.offsetX * cell,
      z: chest.z - hit.offsetY * cell,
    };
    const swing = swingOf({ ...hit, reach: hit.reach * (flurry ? REACH_FLURRY : REACH_ALONE) }, frame, centre, cell);
    const crosses = stage.blowsAt[index] ?? (hit.at + hit.span * 0.3) * duration;
    const clock = strokeClock(swing, crosses, flurry && last ? LAST_STROKE_S : STROKE_S, HANGS_S, t);
    const before = clock.starts - t;
    if (before > 0 && before < GLINTS_S)
      drawGlint(drawn, swingPoint(swing, swing.from), cell * 0.9 * (1 - before / GLINTS_S), forward);
    const weight = flurry ? (last ? 1.25 : 0.75) : WEIGHT_ALONE;
    const thick = cell * (flurry ? (last ? 0.62 : 0.38) : THICK_ALONE);
    if (t >= clock.starts) {
      const spent = flurry
        ? Math.max(0.3 * within(t, clock.ends, clock.ends + 0.3), within(t, opensAt, opensAt + BLOSSOM_FADES_S))
        : clock.spent;
      const look = {
        tones,
        thick,
        alpha: 1,
        spent,
        flowed: (t - clock.starts) * 5 + index,
        ghosts: t < clock.ends + GHOSTS_S ? (flurry && !last ? 2 : 3) : 0,
        rim: flurry ? undefined : RIM_ALONE,
      };
      const lines = { ...look, spent: within(t, clock.ends, clock.ends + GHOSTS_S) };
      drawn.ribbons.push(...crescentRibbons(swing, swing.from, clock.head, look));
      drawn.ribbons.push(...speedLines(swing, swing.from, clock.head, lines, cell, seed + index * 13));
      if (clock.swung < 1) drawTipShreds(drawn, swing, clock.head, look, cell, t, seed + index * 17);
    }
    const impact: Impact = {
      at: swing.centre,
      way: cutWayOf(swing, hit.angle),
      half: cell * (flurry ? (last ? 1.1 : 0.8) : HALF_ALONE),
      cell,
      ramp,
      tones,
      weight,
      forward,
      lowestZ: frame.lowestZ,
      floor,
      seed: seed + index * 29,
    };
    drawImpact(drawn, impact, t - crosses);
    if (flurry) {
      drawWaitingCut(drawn, { ...swing, travel: impact.way }, impact.half, t - crosses, opensAt - crosses);
      drawSeam(drawn, impact, t - opensAt, FLURRY_GAPES_S, last ? 2.2 : 1.8);
    } else {
      drawImpactFrame(drawn, impact, cell * FRAME_ALONE, t - crosses);
      drawSeam(drawn, impact, t - crosses - OPENS_AFTER_S, GAPES_S, 2);
      const level = Math.hypot(swing.travel.x, swing.travel.y) || 1;
      const scored = (cell * SCORE_CELLS * within(t, crosses, crosses + 0.08)) / level;
      if (scored > 1) {
        layCutScore(
          drawn,
          { x: floor.x - swing.travel.x * scored, y: floor.y - swing.travel.y * scored, z: floor.z },
          { x: floor.x + swing.travel.x * scored, y: floor.y + swing.travel.y * scored, z: floor.z },
          cell * 0.11,
          ramp,
          1 - within(t - crosses, 0.05, 0.6),
          clearing,
          seed
        );
      }
    }
  });
  if (flurry) {
    drawOpening(drawn, chest, cell, ownTones, t - opensAt, forward, seed);
    drawDrift(drawn, chest, cell, own, t - opensAt, ends - opensAt, 26, seed, 1.2);
  } else {
    const crosses = stage.blowsAt[0] ?? (hits[0].at + hits[0].span * 0.3) * duration;
    drawDrift(drawn, chest, cell, own, t - crosses, ends - crosses, 16, seed);
  }
  return drawn;
}

/** The colours of one stroke on its own: its paler band taken back towards its body, so more of it is of its full colour. */
function deepened(tones: BladeTones): BladeTones {
  return { ...tones, pale: mixColor(tones.body, tones.pale, PALE_ALONE) };
}

/**
 * The way the cut a stroke leaves lies across its target: the way the blade went over the floor,
 * tipped as far as the stroke was, which the arc of the stroke, laid nearer level, is not.
 */
function cutWayOf(swing: Swing, tippedDegrees: number): Point {
  const level = Math.hypot(swing.travel.x, swing.travel.y);
  if (level < 0.3) return swing.travel;
  const tipped = (tippedDegrees * Math.PI) / 180;
  return {
    x: (swing.travel.x / level) * Math.cos(tipped),
    y: (swing.travel.y / level) * Math.cos(tipped),
    z: -Math.sin(tipped),
  };
}

/** A glint of light off steel: a star in a small glow. */
function drawGlint(drawn: Staged, at: Point, size: number, forward: number): void {
  drawn.motes.push(glow(at, size * 1.3, '#bfe6ff', 0.5, forward));
  drawn.motes.push({ ...glow(at, size, '#ffffff', 1, forward + 1), shape: 'star', spin: 0.3 });
}

/** The cut a stroke of a flurry leaves while it waits to open: a hair of light across the target, which trembles as the moment nears. */
function drawWaitingCut(drawn: Staged, swing: Swing, half: number, since: number, waits: number): void {
  if (since < 0.05 || since >= waits) return;
  const near = within(since, waits - 0.12, waits);
  const points = [-1, 0, 1].map((share) => ({
    x: swing.centre.x + swing.travel.x * half * share,
    y: swing.centre.y + swing.travel.y * half * share,
    z: Math.max(swing.lowestZ, swing.centre.z + swing.travel.z * half * share),
  }));
  const wide = half * (0.05 + 0.05 * near * Math.abs(Math.sin(since * 90)));
  drawn.ribbons.push(
    { points, widths: [0, wide * 4, 0], color: '#bfe6ff', alpha: 0.4, blend: 'light', soft: 1 },
    { points, widths: [0, wide, 0], color: '#ffffff', alpha: 1, blend: 'color' }
  );
}

/** The cuts of a flurry opening together: one flash over the target as they do, and a ring of light thrown out over the floor. */
function drawOpening(
  drawn: Staged,
  chest: Point,
  cell: number,
  tones: BladeTones,
  since: number,
  forward: number,
  seed: number
): void {
  if (since < 0 || since >= 0.36) return;
  const left = 1 - since / 0.36;
  drawn.motes.push(glow(chest, cell * (1.6 + 1.2 * (1 - left)), tones.glow, 0.7 * left, forward));
  drawn.motes.push(...starBurst(chest, cell * 3.4, tones.glow, since / 0.36, forward + 2, 10, seed));
  drawn.lights.push({ ...chest, color: tones.pale, strength: 1.5 * left, reachPx: cell * 3 });
}
