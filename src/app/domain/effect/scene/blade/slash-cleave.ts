import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { crescentRibbons, drawTipShreds, speedLines, swingPoint } from '@axe/domain/effect/scene/blade/crescent';
import { drawDrift, drawImpact, drawSeam, type Impact, layHush } from '@axe/domain/effect/scene/blade/cut-impact';
import { drawGathering, heldBlade } from '@axe/domain/effect/scene/blade/held-blade';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { crag, type EarthTones, earthTonesOf, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { DUST } from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A cleave. A great blade of light gathers high over the target, drawn back, trembling as light is
 * pulled in to it and the floor darkens; steel glints at its point; and it comes straight down, a
 * tall crescent through the target from over its head into the ground. Everything stops on the line
 * it cut. A pillar of light stands up out of the blow for an instant, the ground splits along the way
 * the blow was struck in a long fissure that glows in the blade's colour, rock heaves up out of it
 * one crag after another, stones are flung up and a column of dust climbs over it, and the blade
 * stands a moment where it struck before it fades.
 */

/** How long the blade takes to come down, how long its crescent hangs, and how long it stands where it struck, in seconds. */
const FALLS_S = 0.1;
const HANGS_S = 0.55;
const STANDS_S = 0.3;
/** How far its arc reaches against the reach its form gives, and how thick its crescent is, in cells. */
const REACH = 1.25;
const THICK_CELLS = 0.7;
/** How much of the time before the blow has passed before the blade is seen. */
const SEEN_FROM = 0.12;
/** How far the split runs back towards the caster and on past the target, in cells, and how long it takes to run. */
const SPLIT_BACK = 0.7;
const SPLIT_ON = 4.6;
const SPLIT_RUNS_S = 0.2;
/** How far along the split each crag heaves up, in cells past the target, and how long each takes to rise. */
const CRAGS_AT = [0.4, 0.8, 1.2, 1.6, 2, 2.4, 2.8, 3.2, 3.6, 4, 4.3];
const CRAG_RISES_S = 0.09;
/** How tall the pillar of light stands, in cells, and how long it lasts, in seconds. */
const PILLAR_CELLS = 5.6;
const PILLAR_S = 0.42;
/** How many stones are flung up and how many clouds the column of dust climbs in. */
const STONES = 16;
const DUST_CLOUDS = 9;
/** How long the split's glow takes to cool, and how long before the end everything left clears, in seconds. */
const COOLS_S = 1.2;
const CLEARS_S = 0.5;

/** A cleave on one target; see the head of this file. */
export function drawCleave(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration, seed } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('heavy');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const tones = bladeTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const frame = cutFrameOf(stage);
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const swing = swingOf({ ...hit, reach: hit.reach * REACH }, frame, centre, cell);
  const strikes = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const clock = strokeClock(swing, strikes, FALLS_S, HANGS_S, t);
  const forward = cell * 0.5;
  const ends = duration + lingerS;
  const onward = { x: -frame.toward.x, y: -frame.toward.y, z: 0 };
  const hilt = {
    x: centre.x + frame.toward.x * swing.radius * 0.45,
    y: centre.y + frame.toward.y * swing.radius * 0.45,
    z: centre.z + swing.radius * 0.12,
  };
  const wide = cell * 0.22;

  if (t < clock.starts) {
    const charge = within(t, clock.starts * SEEN_FROM, clock.starts);
    if (charge > 0) {
      const drawnBack = swing.from * (0.72 + 0.28 * outCubic(charge)) + Math.sin(t * 71) * 0.014 * charge;
      const tip = swingPoint(swing, drawnBack);
      const forming = Math.min(1, charge * 3);
      layHush(drawn, floor, cell * 3.5, 0.45 * charge);
      drawn.ribbons.push(...heldBlade(hilt, tip, wide * (0.25 + 0.75 * forming), tones, forming));
      drawGathering(drawn, tip, cell, ramp, charge, seed, forward);
      drawn.motes.push(glow(tip, cell * 1.5 * charge, ramp[3], 0.5 * charge, forward));
      drawn.motes.push({
        ...glow(tip, cell * 1.3 * within(charge, 0.8, 1), '#ffffff', 1, forward + 1),
        shape: 'star',
        spin: t * 6,
      });
      drawn.lights.push({ ...tip, color: ramp[4], strength: 0.5 * charge, reachPx: cell * 2.5 });
    }
    return drawn;
  }

  const since = t - strikes;
  layHush(drawn, floor, cell * 3.5, 0.45 * (1 - within(since, 0, 0.4)));
  const look = {
    tones,
    thick: cell * THICK_CELLS,
    alpha: 1,
    spent: clock.spent,
    flowed: (t - clock.starts) * 5,
    ghosts: 2,
  };
  drawn.ribbons.push(...crescentRibbons(swing, swing.from, clock.head, look));
  drawn.ribbons.push(...speedLines(swing, swing.from, clock.head, look, cell, seed, 8));
  if (clock.swung < 1) drawTipShreds(drawn, swing, clock.head, look, cell, t, seed);
  const standing = 1 - within(t, clock.ends + STANDS_S * 0.5, clock.ends + STANDS_S);
  drawn.ribbons.push(...heldBlade(hilt, swingPoint(swing, clock.head), wide, tones, standing));
  if (since < 0) return drawn;

  const tall = Math.max(stage.tall * 0.6, cell * 0.55);
  const impact: Impact = {
    at: { ...centre, z: stage.z + tall + cell * 0.14 },
    way: swing.travel,
    half: tall,
    cell,
    ramp,
    tones,
    weight: 1.8,
    forward,
    lowestZ: frame.lowestZ,
    floor,
    seed,
  };
  drawImpact(drawn, impact, since);
  drawSeam(drawn, impact, since - 0.08, 0.8, 1.5);
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  drawPillar(drawn, floor, cell, ramp, since, forward);
  drawGround(drawn, stage, floor, onward, { ...earthTonesOf(ramp), glow: ramp[2], hot: ramp[4] }, since, clearing);
  drawDebris(drawn, floor, onward, cell, ramp, since, seed, forward);
  drawDrift(drawn, centre, cell, ramp, since, ends - strikes, 18, seed, 1.3);
  return drawn;
}

/** The pillar of light that stands up out of the blow for an instant: white within the blade's colour, thinning as it goes. */
function drawPillar(
  drawn: Staged,
  floor: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  forward: number
): void {
  if (since >= PILLAR_S) return;
  const left = 1 - since / PILLAR_S;
  const high = cell * PILLAR_CELLS * outCubic(within(since, 0, 0.07));
  const points = [0, 0.3, 0.7, 1].map((share) => ({ ...floor, z: floor.z + cell * 0.14 + high * share }));
  const shape = [1, 0.8, 0.5, 0];
  const wide = cell * (0.25 + 0.9 * left * left);
  drawn.ribbons.push(
    {
      points,
      widths: shape.map((share) => wide * 2.6 * share),
      color: ramp[2],
      alpha: 0.5 * left,
      blend: 'light',
      soft: 1,
    },
    {
      points,
      widths: shape.map((share) => wide * share),
      color: ramp[3],
      core: '#ffffff',
      alpha: left,
      blend: 'color',
      torn: 0.3,
      flowed: -since * 12,
    },
    { points, widths: shape.map((share) => wide * 0.35 * share), color: '#ffffff', alpha: left, blend: 'color' }
  );
  drawn.motes.push(glow({ ...floor, z: floor.z + cell * 0.4 }, cell * 2.4, ramp[3], 0.6 * left, forward));
}

/**
 * The ground broken by the blow, `since` seconds after it: the split running on along the way it
 * was struck and cooling, and crags heaved up out of it one after another, each to its own side,
 * the nearer the taller, which sink back as everything clears.
 */
function drawGround(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  onward: Point,
  tones: EarthTones,
  since: number,
  clearing: number
): void {
  const { cell } = stage;
  const run = outCubic(within(since, 0, SPLIT_RUNS_S));
  const at = (far: number, aside = 0): Point => ({
    x: floor.x + onward.x * far * cell - onward.y * aside * cell,
    y: floor.y + onward.y * far * cell + onward.x * aside * cell,
    z: floor.z,
  });
  const heat = 1 - within(since, 0.15, COOLS_S);
  layFissure(drawn, at(-SPLIT_BACK * run), at(SPLIT_ON * run), cell * 0.28, tones, heat, clearing, stage.seed);
  CRAGS_AT.forEach((far, index) => {
    const heaves = (far / SPLIT_ON) * SPLIT_RUNS_S;
    const risen = outCubic(within(since, heaves, heaves + CRAG_RISES_S));
    if (risen <= 0) return;
    const side = index % 2 === 0 ? 1 : -1;
    const lean = { x: -onward.y * side * 0.34 + onward.x * 0.2, y: onward.x * side * 0.34 + onward.y * 0.2, z: 1 };
    const size = Math.hypot(lean.x, lean.y, lean.z);
    const way = { x: lean.x / size, y: lean.y / size, z: lean.z / size };
    const tall = cell * (1.15 - 0.08 * index) * risen * (0.35 + 0.65 * clearing);
    drawn.motes.push(
      crag(
        at(far, side * 0.17),
        way,
        tall,
        cell * (0.3 - 0.015 * index),
        tones.rock[index % 3],
        Math.min(1, clearing * 3),
        {
          variant: stage.seed + index * 1.7,
          veins: 0.6 * heat,
          glow: tones.glow,
        }
      )
    );
  });
}

/** Stones flung up out of the split and falling back, and the column of dust that climbs over it. */
function drawDebris(
  drawn: Staged,
  floor: Point,
  onward: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  seed: number,
  forward: number
): void {
  for (let stone = 0; stone < STONES; stone++) {
    const age = (since - scatter(stone, seed + 51) * 0.12) / (0.6 + 0.4 * scatter(stone, seed + 52));
    if (age <= 0 || age >= 1) continue;
    const turn = scatter(stone, seed + 53) * Math.PI * 2;
    const out = cell * (0.4 + 1.5 * scatter(stone, seed + 54)) * age;
    const along = cell * SPLIT_ON * 0.6 * scatter(stone, seed + 55);
    drawn.motes.push({
      x: floor.x + onward.x * along + Math.cos(turn) * out,
      y: floor.y + onward.y * along + Math.sin(turn) * out,
      z: floor.z + cell * (1.5 + 2.5 * scatter(stone, seed + 56)) * 4 * age * (1 - age) + cell * 0.05,
      size: cell * (0.1 + 0.12 * scatter(stone, seed + 57)),
      color: stone % 2 === 0 ? '#5b4a3c' : mixColor('#8a7460', ramp[2], 0.2),
      alpha: Math.min(1, (1 - age) * 4),
      blend: 'color',
      shape: 'chunk',
      spin: since * 10 + stone,
      variant: stone,
      forward,
    });
  }
  const dust = mixColor(DUST, ramp[3], 0.2);
  for (let cloud = 0; cloud < DUST_CLOUDS; cloud++) {
    const age = (since - 0.03 - scatter(cloud, seed + 58) * 0.25) / 1.3;
    if (age <= 0 || age >= 1) continue;
    const along = cell * SPLIT_ON * 0.8 * scatter(cloud, seed + 59);
    const aside = (scatter(cloud, seed + 60) - 0.5) * cell * 0.8;
    drawn.motes.push(
      smokePuff(
        {
          x: floor.x + onward.x * along - onward.y * aside,
          y: floor.y + onward.y * along + onward.x * aside,
          z: floor.z + cell * (0.3 + 1.6 * outCubic(age)) * (0.5 + 0.5 * scatter(cloud, seed + 61)),
        },
        cell * (0.7 + 1 * outCubic(age)),
        dust,
        0.5 * Math.min(1, age * 8, (1 - age) * 1.6),
        forward * 0.5
      )
    );
  }
}
