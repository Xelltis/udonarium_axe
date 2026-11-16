import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { drawDrift, drawImpact, drawSeam, type Impact, layHush } from '@axe/domain/effect/scene/blade/cut-impact';
import { drawImpactFrame } from '@axe/domain/effect/scene/blade/impact-frame';
import { chestOf, cutFrameOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { glow, type Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { SLASH_IAI_DRAWN_AT, slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A drawing cut. The world about the target dims and steel glints at the caster's hand; then one
 * line is drawn at once from behind the caster on through the target and far past it, a thick hard
 * streak, white at its heart within the blade's colour within a dark sheath, that thins at once to a
 * hard line lying through everything. Nothing moves; a glint runs along it. The blade slides home,
 * and as it clicks into its sheath the line bursts open: a star breaks out of the target, a wide
 * blazing gash runs along the whole of the line, light pouring out of it, more cuts flicker over the
 * target one after another, each its own way, and petals of light are scattered and left falling.
 */

/** How long the line takes to cross, and how long its streak takes to thin to a hair, in seconds. */
const CROSSES_S = 0.05;
const THINS_S = 0.3;
/** How long the gash gapes, in seconds. */
const GAPES_S = 0.95;
/** When after the gash opens each of the cuts that follow flickers over the target, in seconds, and how each is tipped, in degrees. */
const FOLLOW: readonly (readonly [after: number, tipped: number])[] = [
  [0.07, 38],
  [0.14, -52],
  [0.21, 74],
  [0.28, -18],
];
/** How many petals of light fall from where the line was, and for how long, in seconds. */
const PETALS = 22;
const PETALS_FALL_S = 1.4;
/** How dark the floor about the target is made, and how far out, in cells. */
const HUSH = 0.66;
const HUSH_CELLS = 5;
/** How far behind its caster's hand the line begins, and how far past the target it ends, in cells. */
const BEHIND_HAND = 0.5;
const PAST_TARGET = 2.6;
const STEPS = 14;
/** How thick the line is at its thinnest, as it lies waiting, and how much thicker as it is drawn, in cells. */
const HAIR_CELLS = 0.06;
const STREAK_CELLS = 0.55;
/** How large the star of the impact frame is as the cut bursts open, in cells. */
const FRAME_CELLS = 1.5;

/** A drawing cut on one target; see the head of this file. */
export function drawDrawingCut(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration, seed } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('iai');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const tones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const frame = cutFrameOf(stage);
  const way = { x: -frame.toward.x, y: -frame.toward.y, z: 0 };
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.5;
  const opensAt = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const drawnAt = Math.min(SLASH_IAI_DRAWN_AT * duration, opensAt * 0.5);
  const ends = duration + lingerS;
  const handFar = stage.origin ? Math.hypot(stage.origin.x - stage.x, stage.origin.y - stage.y) : cell * 2;
  const behind = Math.min(cell * 6, handFar + cell * BEHIND_HAND);
  const beyond = cell * PAST_TARGET;
  const lineAt = (share: number): Point => {
    const far = share < 0 ? share * behind : share * beyond;
    return { x: centre.x + way.x * far, y: centre.y + way.y * far, z: Math.max(frame.lowestZ, centre.z) };
  };
  const hand = lineAt(-handFar / behind);
  const since = t - opensAt;

  layHush(drawn, floor, cell * HUSH_CELLS, HUSH * Math.min(within(t, 0, drawnAt), 1 - within(since, 0.15, 0.6)));
  if (t < drawnAt) {
    const ready = within(t, 0, drawnAt);
    drawn.motes.push(glow(hand, cell * 0.9 * ready, ramp[3], 0.6, forward));
    drawn.motes.push({ ...glow(hand, cell * 1.1 * ready, '#ffffff', 1, forward + 1), shape: 'star', spin: t * 5 });
    return drawn;
  }

  const crossed = within(t, drawnAt, drawnAt + CROSSES_S);
  const shares = Array.from({ length: STEPS + 1 }, (_unused, index) => -1 + (index / STEPS) * (1 + crossed));
  const points = shares.map(lineAt);
  const taper = shares.map((_share, index) => Math.pow(Math.sin((Math.PI * index) / STEPS), 0.5));
  const streak = 1 - within(t, drawnAt, drawnAt + THINS_S);
  if (since < 0.05) {
    const hair = 1 - within(since, 0, 0.05);
    const thick = cell * (HAIR_CELLS + STREAK_CELLS * streak * streak);
    drawn.ribbons.push(
      {
        points,
        widths: taper.map((share) => share * (thick * 2.6 + cell * 0.25)),
        color: ramp[3],
        alpha: (0.25 + 0.5 * streak) * hair,
        blend: 'light',
        soft: 1,
      },
      {
        points,
        widths: taper.map((share) => share * (thick * 1.9 + cell * 0.05)),
        color: tones.rim,
        alpha: hair,
        blend: 'color',
      },
      {
        points,
        widths: taper.map((share) => share * thick * 1.4),
        color: tones.body,
        core: tones.pale,
        alpha: hair,
        blend: 'color',
      },
      {
        points,
        widths: taper.map((share) => share * thick * (0.6 + 0.4 * streak)),
        color: '#ffffff',
        alpha: hair,
        blend: 'color',
      }
    );
    if (streak > 0) {
      drawn.motes.push({
        ...glow(centre, cell * 0.5 * streak, '#ffffff', streak, forward + 2),
        shape: 'flare',
        trail: 14,
        spin: 0,
      });
      drawn.motes.push(glow(centre, cell * 2.2, ramp[3], 0.6 * streak, forward));
      drawn.lights.push({ ...centre, color: ramp[4], strength: 1.3 * streak, reachPx: cell * 3 });
    } else if (since < 0) {
      const runs = ((t - drawnAt) * 1.4) % 1;
      drawn.motes.push({
        ...glow(lineAt(-1 + 2 * runs), cell * 0.5, '#ffffff', Math.sin(Math.PI * runs), forward + 1),
        shape: 'star',
        spin: runs * 4,
      });
    }
  }
  if (since < 0) return drawn;

  if (since < 0.2) {
    const click = 1 - since / 0.2;
    drawn.motes.push({ ...glow(hand, cell * 0.9 * click, '#ffffff', click, forward + 1), shape: 'star', spin: 0.8 });
  }
  const struck: Impact = {
    at: centre,
    way,
    half: cell * 0.9,
    cell,
    ramp,
    tones,
    weight: 1.5,
    forward,
    lowestZ: frame.lowestZ,
    floor,
    seed,
  };
  const offset = (beyond - behind) / 2;
  const middle = lineAt(offset >= 0 ? offset / beyond : offset / behind);
  drawSeam(drawn, { ...struck, at: middle, half: (behind + beyond) / 2 }, since, GAPES_S, 1.3);
  drawImpact(drawn, struck, since);
  drawImpactFrame(drawn, struck, cell * FRAME_CELLS, since);
  FOLLOW.forEach(([after, tipped], index) => {
    const turn = (tipped * Math.PI) / 180;
    const aside = (scatter(index, seed + 41) - 0.5) * cell * 0.5;
    drawImpact(
      drawn,
      {
        ...struck,
        at: {
          x: centre.x + frame.across.x * aside,
          y: centre.y + frame.across.y * aside,
          z: centre.z + (index % 2 === 0 ? 0.18 : -0.12) * cell,
        },
        way: { x: frame.across.x * Math.cos(turn), y: frame.across.y * Math.cos(turn), z: Math.sin(turn) * 0.7 },
        half: cell * 0.9,
        weight: 0.9,
        floor: undefined,
        seed: seed + index * 7,
      },
      since - after
    );
  });
  for (let petal = 0; petal < PETALS; petal++) {
    const along = -0.5 + scatter(petal, seed + 42) * 1.3;
    const from = lineAt(along);
    const age = (since - scatter(petal, seed + 43) * 0.25) / PETALS_FALL_S;
    if (age <= 0 || age >= 1) continue;
    const burst = outCubic(Math.min(1, age * 3));
    const aside = (scatter(petal, seed + 44) - 0.5) * cell * 2.2 * burst;
    const sway = Math.sin(age * 9 + petal) * cell * 0.15;
    drawn.motes.push({
      x: from.x + frame.across.x * (aside + sway),
      y: from.y + frame.across.y * (aside + sway),
      z: Math.max(
        stage.groundZ + cell * 0.04,
        from.z + cell * (0.9 * burst * scatter(petal, seed + 45) - 0.9 * age * age)
      ),
      size: cell * (0.13 + 0.09 * scatter(petal, seed + 46)),
      color: petal % 2 === 0 ? '#ffffff' : ramp[3],
      alpha: Math.min(1, (1 - age) * 2.5),
      blend: 'color',
      shape: 'flake',
      spin: since * (3 + (petal % 4)) + petal,
      variant: petal,
      forward,
    });
  }
  drawDrift(drawn, centre, cell, ramp, since, ends - opensAt, 22, seed, 1.5);
  return drawn;
}
