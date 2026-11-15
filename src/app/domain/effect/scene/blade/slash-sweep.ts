import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { crescentRibbons, drawTipShreds, speedLines, swingPoint } from '@axe/domain/effect/scene/blade/crescent';
import {
  drawDrift,
  drawImpact,
  drawSeam,
  type Impact,
  layCutScore,
  layHush,
} from '@axe/domain/effect/scene/blade/cut-impact';
import { drawGathering, heldBlade } from '@axe/domain/effect/scene/blade/held-blade';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthTonesOf, layCrescent } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { DUST } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, smokePuff } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A wide sweep. A long blade of light is drawn far back to one side of the target and held there,
 * growing and trembling as light is pulled in to it and the floor darkens; then it is swung level
 * right across, and its crescent is vast: cells wide either side of the target, as thick as a piece,
 * with afterimages behind it. Everything stops on the line it cut. The cut itself flies on: a
 * crescent of force leaves the stroke and races on past the target, scoring the floor under it, and
 * a wall of dust stands up along the stroke behind it. Where it takes several targets the one blade
 * is gathered at the first, and goes on through each of the rest in turn.
 */

/** How long the blade takes to sweep across, and how long its crescent hangs, in seconds. */
const SWEEPS_S = 0.13;
const HANGS_S = 0.6;
/** How far its arc reaches against the reach its form gives, and how thick its crescent is, in cells. */
const REACH = 1.1;
const THICK_CELLS = 0.8;
/** How far the cut flies on past the target, in cells, and how long it takes. */
const FLIES_CELLS = 5;
const FLIES_S = 0.5;
/** How far either side of the target the floor is scored, in cells, and how long the scores take to cool and to clear. */
const SCORE_CELLS = 1.7;
const SCORE_COOLS_S = 0.7;
const CLEARS_S = 0.5;
/** How many clouds the wall of dust stands up in, how far either side of the target it reaches, in cells, and how long each hangs, in seconds. */
const DUST_CLOUDS = 14;
const DUST_CELLS = 2.1;
const DUST_HANGS_S = 1.1;

/** A wide sweep on one target; see the head of this file. */
export function drawSweep(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration, seed } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('wide');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const tones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const frame = cutFrameOf(stage);
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const swing = swingOf({ ...hit, reach: hit.reach * REACH }, frame, centre, cell);
  const crosses = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const clock = strokeClock(swing, crosses, SWEEPS_S, HANGS_S, t);
  const forward = cell * 0.5;
  const ends = duration + lingerS;
  const hilt = {
    x: centre.x + frame.toward.x * swing.radius * 0.5,
    y: centre.y + frame.toward.y * swing.radius * 0.5,
    z: centre.z,
  };
  const wide = cell * 0.24;
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
    layHush(drawn, floor, cell * 4, 0.4 * charge);
    drawn.ribbons.push(...heldBlade(hilt, point, wide * (0.4 + 0.6 * charge), tones, Math.min(1, charge * 4)));
    drawGathering(drawn, point, cell, ramp, charge, seed, forward);
    drawn.motes.push(glow(point, cell * 1.6 * charge, ramp[3], 0.5 * charge, forward));
    drawn.motes.push({
      ...glow(point, cell * 1.3 * within(charge, 0.7, 1), '#ffffff', 1, forward + 1),
      shape: 'star',
      spin: t * 6,
    });
    drawn.lights.push({ ...point, color: ramp[4], strength: 0.5 * charge, reachPx: cell * 2.5 });
    return drawn;
  }

  const since = t - crosses;
  layHush(drawn, floor, cell * 4, 0.4 * (1 - within(since, 0, 0.5)));
  const look = {
    tones,
    thick: cell * THICK_CELLS,
    alpha: 1,
    spent: clock.spent,
    flowed: (t - clock.starts) * 4,
    ghosts: 3,
  };
  drawn.ribbons.push(...crescentRibbons(swing, swing.from, clock.head, look));
  drawn.ribbons.push(...speedLines(swing, swing.from, clock.head, look, cell, seed, 10));
  if (clock.swung < 1) {
    drawTipShreds(drawn, swing, clock.head, look, cell, t, seed);
    if (leads) drawn.ribbons.push(...heldBlade(hilt, swingPoint(swing, clock.head), wide, tones, 1));
  }
  if (since < 0) return drawn;

  const impact: Impact = {
    at: centre,
    way: swing.travel,
    half: cell * 1.1,
    cell,
    ramp,
    tones,
    weight: 1.6,
    forward,
    lowestZ: frame.lowestZ,
    floor,
    seed,
  };
  drawImpact(drawn, impact, since);
  drawSeam(drawn, impact, since - 0.08, 0.6, 0.75);
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const level = { x: swing.travel.x, y: swing.travel.y };
  const flat = Math.hypot(level.x, level.y) || 1;
  const across = { x: level.x / flat, y: level.y / flat };
  const onward = { x: -frame.toward.x, y: -frame.toward.y };
  const heat = 1 - within(since, 0.1, SCORE_COOLS_S);
  const scored = cell * SCORE_CELLS * outCubic(within(since, 0, 0.1));
  layCutScore(
    drawn,
    { x: floor.x - across.x * scored, y: floor.y - across.y * scored, z: floor.z },
    { x: floor.x + across.x * scored, y: floor.y + across.y * scored, z: floor.z },
    cell * 0.16,
    ramp,
    heat,
    clearing,
    seed
  );
  const flown = outCubic(within(since, 0, FLIES_S));
  const reached = cell * FLIES_CELLS * flown;
  if (leads) {
    layCutScore(
      drawn,
      { x: floor.x + onward.x * cell * 0.3, y: floor.y + onward.y * cell * 0.3, z: floor.z },
      { x: floor.x + onward.x * (cell * 0.3 + reached), y: floor.y + onward.y * (cell * 0.3 + reached), z: floor.z },
      cell * 0.12,
      ramp,
      heat,
      clearing,
      seed + 5
    );
    if (flown < 1) {
      const flying = {
        ...swing,
        centre: { x: centre.x + onward.x * reached, y: centre.y + onward.y * reached, z: centre.z },
        radius: swing.radius * (1 - 0.15 * flown),
      };
      const wave = {
        tones,
        thick: cell * 0.9,
        alpha: 1 - flown * flown * flown,
        spent: 0.1 + 0.45 * flown,
        flowed: since * 9,
        ghosts: 2,
      };
      drawn.ribbons.push(...crescentRibbons(flying, swing.from * 0.8, swing.to * 0.8, wave));
      drawn.lights.push({ ...flying.centre, color: ramp[4], strength: 0.6 * (1 - flown), reachPx: cell * 2.5 });
      layCrescent(
        drawn,
        floor,
        Math.atan2(onward.y, onward.x),
        1.05,
        cell * (0.5 + FLIES_CELLS * flown),
        cell * 0.6,
        earthTonesOf(ramp),
        1 - flown * flown,
        since * 3
      );
    }
  }
  const dust = mixColor(DUST, ramp[3], 0.25);
  for (let cloud = 0; cloud < DUST_CLOUDS; cloud++) {
    const along = (cloud / (DUST_CLOUDS - 1)) * 2 - 1;
    const age = (since - 0.03 - Math.abs(along) * 0.05 - scatter(cloud, seed + 31) * 0.1) / DUST_HANGS_S;
    if (age <= 0 || age >= 1) continue;
    const out = along * cell * DUST_CELLS;
    const drift = cell * (0.25 + 0.5 * scatter(cloud, seed + 32)) * outCubic(age);
    drawn.motes.push(
      smokePuff(
        {
          x: floor.x + across.x * out + onward.x * drift,
          y: floor.y + across.y * out + onward.y * drift,
          z: floor.z + cell * (0.25 + 0.9 * outCubic(age)) * (0.6 + 0.4 * scatter(cloud, seed + 33)),
        },
        cell * (0.7 + 0.8 * outCubic(age)),
        dust,
        0.5 * Math.min(1, age * 8, (1 - age) * 1.6),
        forward * 0.5
      )
    );
  }
  drawDrift(drawn, centre, cell, ramp, since, ends - crosses, 20, seed, 1.6);
  return drawn;
}
