import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { bloodOf, drawDrops, type Drop, flungDrops } from '@axe/domain/effect/scene/body/blood';
import { type Choreography, nothingStaged, outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, thrownSparks } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  ball,
  floorMark,
  glow,
  haze,
  keptFor,
  type Point,
  stageKey,
  starBurst,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { BISECT_ANGLE, BISECT_CUT_END, BISECT_PICTURE_HEIGHT } from '@axe/domain/effect/timeline/blade';

/*
 * A cut through a piece that cleaves it in two. Before the blow a thin gleam of the blade runs across
 * the piece at the angle it will be cut at. The blow lands as one frame: a thick line laid right through
 * the piece and far past it on both sides, a near black rim about a crimson body about a white edge, a
 * star of light bursting out of its middle, sparks flying and the floor lit; held through the stop.
 * Then the line thins away as the piece fades, its picture parts along the cut, the seam glows and
 * blood gushes out of it all along its length, and a pool spreads under it.
 *
 * The piece's own picture, cut in two, is drawn over the table as `timeline/blade` has it: only what is
 * drawn about it is drawn here.
 */

/** How long the line of the cut stays after the stroke has passed through, in seconds. */
const LINE_STAYS_S = 0.35;
/** How far the line of the cut reaches either way from the middle of the piece, in cells. */
const LINE_REACH = 1.9;

const thrownByStage = new Map<string, { readonly drops: readonly Drop[]; readonly sparks: readonly ThrownMote[] }>();

/** A streak of the cut across the screen at its angle, through a point: a flare as wide as `wide` reaching `reach` either way. */
function streak(at: Point, wide: number, reach: number, color: string, alpha: number, forward: number): EffectMote {
  return {
    ...glow(at, wide, color, alpha, forward),
    shape: 'flare',
    trail: Math.max(1, reach / Math.max(wide, 0.001)),
    spin: (-BISECT_ANGLE * Math.PI) / 180,
  };
}

/** How many hard discs the line of the cut is laid as across the screen, close enough to run together into one band. */
const SLIT_STEPS = 120;

/**
 * The line of the cut laid across the screen at its angle through a point, hard-edged: a run of discs
 * as wide as `wide` in its middle and drawn to points `reach` out either way.
 */
function laySlit(drawn: Staged, at: Point, reach: number, wide: number, color: string, forward: number): void {
  const turn = (-BISECT_ANGLE * Math.PI) / 180;
  for (let index = 0; index <= SLIT_STEPS; index++) {
    const share = (index / SLIT_STEPS) * 2 - 1;
    const width = wide * Math.pow(1 - share * share, 0.55);
    if (width < wide * 0.1) continue;
    drawn.motes.push({
      ...ball(at, width, color, 1, forward, 0),
      aside: { right: Math.cos(turn) * share * reach, up: Math.sin(turn) * share * reach },
    });
  }
}

/** A cut through the piece: see the head of this file. */
export const bisect: Choreography = {
  lingerS: 0,
  draw: (stage) => {
    const drawn = nothingStaged();
    const { cell, duration } = stage;
    const t = stage.seconds;
    const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
    const tones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
    const blood = bloodOf(
      rampOf(stage.preset.colorSecondary, mixColor(stage.preset.colorSecondary, '#000000', 0.4), 7)
    );
    const middle = { x: stage.x, y: stage.y, z: stage.z + (cell * BISECT_PICTURE_HEIGHT) / 2 };
    const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
    const landsAt = Math.min(stage.blowsAt[0] ?? duration * 0.05, duration * BISECT_CUT_END);
    const cuts = duration * BISECT_CUT_END;
    const fade = 1 - within(t, duration * 0.75, duration);
    const forward = cell * 1.2;
    const turn = (-BISECT_ANGLE * Math.PI) / 180;
    const along = { x: Math.cos(turn), y: 0, z: Math.sin(turn) };
    const thrown = keptFor(thrownByStage, stageKey(stage, duration), () => {
      const th = throwerFor(stage, duration);
      const spread = { x: along.x * cell * 0.45, y: 0, z: along.z * cell * 0.45 };
      return {
        drops: flungDrops(th, middle, th.count(40), cuts, cuts + 0.35, 1.1, { spread }),
        sparks: thrownSparks(th, middle, th.count(30), [5, 12], [landsAt, landsAt + 0.02]),
      };
    });

    if (t < landsAt) {
      const gleam = within(t, 0, landsAt);
      drawn.motes.push(
        streak(middle, cell * 0.04, cell * LINE_REACH * (0.4 + 0.6 * gleam), '#ffffff', 0.9 * gleam, forward)
      );
      drawn.motes.push({
        ...glow(middle, cell * 0.5 * gleam, '#ffffff', gleam, forward + 1),
        shape: 'star',
        spin: 0.3,
        aside: { right: along.x * cell * LINE_REACH * gleam, up: along.z * cell * LINE_REACH * gleam },
      });
      return drawn;
    }
    const left = t < cuts ? 1 : 1 - within(t, cuts, cuts + LINE_STAYS_S);
    if (left > 0) {
      const reach = cell * LINE_REACH * (1 + 0.15 * (1 - left));
      laySlit(drawn, middle, reach, cell * 0.34 * left, tones.rim, forward);
      laySlit(drawn, middle, reach * 0.96, cell * 0.24 * left, tones.body, forward + 1);
      laySlit(drawn, middle, reach * 0.9, cell * 0.12 * left, tones.pale, forward + 2);
      drawn.motes.push(streak(middle, cell * 0.07 * left, reach * 1.1, '#ffffff', left, forward + 3));
    }
    const since = t - landsAt;
    if (since < 0.3) drawn.motes.push(...starBurst(middle, cell * 1.9, tones.glow, since / 0.3, forward + 4, 8, turn));
    if (since < 0.08) {
      const flash = 1 - since / 0.08;
      drawn.motes.push(glow(middle, cell * 0.7, tones.pale, 0.6 * flash, forward + 5));
      drawn.floor.push(floorMark('disc', floor, cell * 1.2, 1, '#ffffff', 0.25 * flash, 'light', 0));
    }
    if (since < 0.2)
      drawn.lights.push({ ...middle, color: tones.pale, strength: 1.2 * (1 - since / 0.2), reachPx: cell * 2.4 });
    if (t >= cuts) laySeam(drawn, stage, middle, floor, blood, t, cuts, fade, forward);
    drawDrops(drawn, thrown.drops, t, cell, blood, fade, forward);
    for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
    return drawn;
  },
};

/** The seam glowing along the cut once the picture parts, a mist of blood about it, and the pool spreading under the piece. */
function laySeam(
  drawn: Staged,
  stage: { readonly cell: number; readonly duration: number; readonly seed: number },
  middle: Point,
  floor: Point,
  blood: readonly [string, string, string],
  t: number,
  cuts: number,
  fade: number,
  forward: number
): void {
  const { cell, duration } = stage;
  const seam = 1 - within(t, cuts, duration * 0.8);
  drawn.motes.push(streak(middle, cell * 0.2 * seam, cell * 1.6, blood[0], seam * fade, forward - 1));
  drawn.motes.push(streak(middle, cell * 0.09 * seam, cell * 1.7, blood[2], seam * fade, forward));
  drawn.motes.push(haze(middle, cell * 1.6, blood[1], 0.4 * seam * fade, forward - 2));
  const pooling = outCubic(within(t, cuts, duration));
  drawn.floor.push(
    floorMark('scorch', floor, cell * (0.35 + 0.65 * pooling), 1, blood[0], 0.75 * fade, 'color', (stage.seed % 89) + 1)
  );
  drawn.floor.push(
    floorMark('scorch', floor, cell * (0.2 + 0.45 * pooling), 1, blood[1], 0.6 * fade, 'color', (stage.seed % 61) + 7)
  );
}
