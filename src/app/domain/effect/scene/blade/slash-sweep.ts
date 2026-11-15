import {
  type Chip,
  cutChips,
  cutSparks,
  drawChip,
  drawCrossing,
  drawCutMark,
  drawGlint,
  swingPoint,
  trailRibbons,
} from '@axe/domain/effect/scene/blade/blade-trail';
import { drawGathering, heldBlade } from '@axe/domain/effect/scene/blade/held-blade';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthTonesOf, layCrescent, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, drawCloud, drawSpark, rollingDust } from '@axe/domain/effect/scene/fire/fire-parts';
import { keptFor, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A wide sweep. A long blade of light is drawn far back to one side of the target and held there,
 * growing and trembling as light is pulled in to it; then it is swung level right across, wider than
 * the target by cells either side, and the whole of its arc hangs in the air after it, a great
 * crescent thinning away. Everything stops as it crosses. The floor under it is scored along the
 * stroke, and the wind of it races on over the floor past the target as a crescent of dust. Where it
 * takes several targets the one blade is gathered at the first, and goes on through each of the rest
 * in turn, leaving its arc and its score at each.
 */

/** How long the blade takes to sweep across, and how long its trail takes to fade, in seconds. */
const SWEEPS_S = 0.12;
const FADES_S = 0.5;
/** How far the wind of it races over the floor, in cells, and how long it takes. */
const WIND_FROM = 0.5;
const WIND_REACH = 3;
const WIND_S = 0.55;
/** How far either side of the target the floor is scored, in cells, and how long the score takes to cool and to clear. */
const SCORE_CELLS = 1.2;
const SCORE_COOLS_S = 0.5;
const CLEARS_S = 0.5;

interface SweepThrown {
  readonly sparks: readonly ThrownMote[];
  readonly chips: readonly Chip[];
  readonly dust: readonly Cloud[];
}

const thrownByStage = new Map<string, SweepThrown>();

/** A wide sweep on one target; see the head of this file. */
export function drawSweep(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('wide');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const frame = cutFrameOf(stage);
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const swing = swingOf(hit, frame, centre, cell);
  const crosses = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const clock = strokeClock(swing, crosses, SWEEPS_S, FADES_S, t);
  const forward = cell * 0.5;
  const ends = duration + lingerS;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends);
    return {
      sparks: cutSparks(th, centre, swing.travel, th.count(18), [6, 14], [crosses, crosses + 0.02]),
      chips: cutChips(th, centre, swing.travel, th.count(4), crosses),
      dust: rollingDust(throwerFor(stage, ends - crosses), floor, th.count(5), [2, 5]),
    };
  });
  const hilt = {
    x: centre.x + frame.toward.x * swing.radius * 0.5,
    y: centre.y + frame.toward.y * swing.radius * 0.5,
    z: centre.z,
  };
  const wide = cell * 0.16;
  const leads = stage.targets.every((target) => target.index >= stage.index);

  if (t < clock.starts) {
    if (!leads) return drawn;
    const charge = within(t, 0, clock.starts);
    const drawnBack = swing.from - 0.22 * (1 - outCubic(charge)) + Math.sin(t * 67) * 0.012 * charge;
    const tip = swingPoint(swing, drawnBack);
    const grown = 0.35 + 0.65 * outCubic(charge);
    const point = {
      x: hilt.x + (tip.x - hilt.x) * grown,
      y: hilt.y + (tip.y - hilt.y) * grown,
      z: hilt.z + (tip.z - hilt.z) * grown,
    };
    drawn.ribbons.push(...heldBlade(hilt, point, wide * (0.4 + 0.6 * charge), ramp, Math.min(1, charge * 4)));
    drawGathering(drawn, point, cell, ramp, charge, stage.seed, forward);
    drawGlint(drawn, point, cell * 0.7 * within(charge, 0.75, 1), ramp[3], 1, forward, t * 6);
    drawn.lights.push({ ...point, color: ramp[4], strength: 0.35 * charge, reachPx: cell * 2.5 });
    return drawn;
  }

  drawn.ribbons.push(
    ...trailRibbons(swing, swing.from, clock.head, {
      ramp,
      thick: cell * 0.78,
      alpha: 1,
      spent: clock.spent,
      flowed: (t - clock.starts) * 4,
    })
  );
  if (leads && clock.swung < 1) drawn.ribbons.push(...heldBlade(hilt, swingPoint(swing, clock.head), wide, ramp, 1));
  const since = t - crosses;
  if (since < 0) return drawn;

  drawCutMark(drawn, centre, swing.travel, cell * 0.7, ramp, since, 0.7, 1.2, frame.lowestZ);
  drawCrossing(drawn, centre, cell, ramp, since, 1.5, forward);
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const level = { x: swing.travel.x, y: swing.travel.y };
  const flat = Math.hypot(level.x, level.y) || 1;
  const scored = cell * SCORE_CELLS * outCubic(within(since, 0, 0.1));
  const tones = { ...earthTonesOf(ramp), glow: ramp[2], hot: ramp[4] };
  layFissure(
    drawn,
    { x: floor.x - (level.x / flat) * scored, y: floor.y - (level.y / flat) * scored, z: floor.z },
    { x: floor.x + (level.x / flat) * scored, y: floor.y + (level.y / flat) * scored, z: floor.z },
    cell * 0.09,
    tones,
    1 - within(since, 0.05, SCORE_COOLS_S),
    clearing,
    stage.seed
  );
  const racing = within(since, 0, WIND_S);
  if (leads && racing < 1) {
    layCrescent(
      drawn,
      floor,
      Math.atan2(-frame.toward.y, -frame.toward.x),
      1.05,
      cell * (WIND_FROM + (WIND_REACH - WIND_FROM) * outCubic(racing)),
      cell * 0.55,
      earthTonesOf(ramp),
      1 - racing * racing,
      since * 3
    );
  }
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell * 0.8, ramp, index, forward);
  for (const chip of thrown.chips) drawChip(drawn, chip, t, cell, ramp[4], forward);
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, since, cell, forward);
  return drawn;
}
