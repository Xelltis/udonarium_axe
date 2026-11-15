import {
  cutSparks,
  drawCrossing,
  drawCutMark,
  drawGlint,
  swingPoint,
  trailRibbons,
} from '@axe/domain/effect/scene/blade/blade-trail';
import { drawGathering, heldBlade } from '@axe/domain/effect/scene/blade/held-blade';
import { chestOf, cutFrameOf, strokeClock, swingOf } from '@axe/domain/effect/scene/blade/slash-swing';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { crag, type EarthTones, earthTonesOf, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  drawSpark,
  dustColumn,
  rollingDust,
  thrownGrit,
  thrownRocks,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { keptFor, type Point, stageKey, throwerFor } from '@axe/domain/effect/scene/parts';
import { slashHits } from '@axe/domain/effect/timeline/blade';

/*
 * A cleave. A great blade of light gathers high over the target, drawn back, trembling as light is
 * pulled in to it; steel glints at its point; and it comes straight down, through the target from
 * its head to its feet and into the ground. Everything stops on the line it cut. The ground splits
 * along the way the blow was struck, the split running on past the target and glowing in the
 * blade's colour, rock heaves up out of it one crag after another, dust and stones are thrown up,
 * and the blade stands a moment where it struck before it fades.
 */

/** How long the blade takes to come down, how long its trail takes to fade, and how long it stands where it struck, in seconds. */
const FALLS_S = 0.09;
const FADES_S = 0.45;
const STANDS_S = 0.3;
/** How much of the time before the blow has passed before the blade is seen. */
const SEEN_FROM = 0.12;
/** How far the split runs back towards the caster and on past the target, in cells, and how long it takes to run. */
const SPLIT_BACK = 0.5;
const SPLIT_ON = 1.7;
const SPLIT_RUNS_S = 0.16;
/** How far along the split each crag heaves up, in cells past the target, and how long each takes to rise. */
const CRAGS_AT = [0.35, 0.7, 1.05, 1.35, 1.6];
const CRAG_RISES_S = 0.09;
/** How long the split's glow takes to cool, and how long before the end everything left clears, in seconds. */
const COOLS_S = 1.1;
const CLEARS_S = 0.5;

interface CleaveThrown {
  readonly sparks: readonly ThrownMote[];
  readonly dust: readonly Cloud[];
  readonly rocks: readonly Bit[];
}

const thrownByStage = new Map<string, CleaveThrown>();

/** A cleave on one target; see the head of this file. */
export function drawCleave(stage: Stage, lingerS: number): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const [hit] = slashHits('heavy');
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const frame = cutFrameOf(stage);
  const centre = chestOf(stage);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const swing = swingOf(hit, frame, centre, cell);
  const strikes = stage.blowsAt[0] ?? (hit.at + hit.span * 0.3) * duration;
  const clock = strokeClock(swing, strikes, FALLS_S, FADES_S, t);
  const forward = cell * 0.5;
  const ends = duration + lingerS;
  const onward = { x: -frame.toward.x, y: -frame.toward.y, z: 0 };
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () => {
    const th = throwerFor(stage, ends - strikes);
    const up = { x: onward.x * 0.55, y: onward.y * 0.55, z: 0.6 };
    return {
      sparks: cutSparks(
        th,
        { ...floor, z: floor.z + cell * 0.15 },
        up,
        th.count(18),
        [5, 13],
        [strikes, strikes + 0.03]
      ),
      dust: [...dustColumn(th, floor, th.count(4)), ...rollingDust(th, floor, th.count(7), [2, 5])],
      rocks: [...thrownRocks(th, floor, th.count(5)), ...thrownGrit(th, floor, th.count(9))],
    };
  });
  const hilt = {
    x: centre.x + frame.toward.x * swing.radius * 0.45,
    y: centre.y + frame.toward.y * swing.radius * 0.45,
    z: centre.z + swing.radius * 0.12,
  };
  const wide = cell * 0.17;

  if (t < clock.starts) {
    const charge = within(t, clock.starts * SEEN_FROM, clock.starts);
    if (charge > 0) {
      const drawnBack = swing.from * (0.72 + 0.28 * outCubic(charge)) + Math.sin(t * 71) * 0.014 * charge;
      const tip = swingPoint(swing, drawnBack);
      const forming = Math.min(1, charge * 3);
      drawn.ribbons.push(...heldBlade(hilt, tip, wide * (0.25 + 0.75 * forming), ramp, forming));
      drawGathering(drawn, tip, cell, ramp, charge, stage.seed, forward);
      drawGlint(drawn, tip, cell * 0.7 * within(charge, 0.82, 1), ramp[3], 1, forward, t * 6);
      drawn.lights.push({ ...tip, color: ramp[4], strength: 0.4 * charge, reachPx: cell * 2.5 });
    }
    return drawn;
  }

  const since = t - strikes;
  drawn.ribbons.push(
    ...trailRibbons(swing, swing.from, clock.head, {
      ramp,
      thick: cell * 0.7,
      alpha: 1,
      spent: clock.spent,
      flowed: (t - clock.starts) * 5,
    })
  );
  const standing = 1 - within(t, clock.ends + STANDS_S * 0.5, clock.ends + STANDS_S);
  drawn.ribbons.push(...heldBlade(hilt, swingPoint(swing, clock.head), wide, ramp, standing));
  if (since < 0) return drawn;

  const tall = Math.max(stage.tall * 0.6, cell * 0.55);
  drawCutMark(
    drawn,
    { ...centre, z: stage.z + tall + cell * 0.14 },
    swing.travel,
    tall,
    ramp,
    since,
    0.7,
    1.3,
    frame.lowestZ
  );
  drawCrossing(drawn, centre, cell, ramp, since, 1.6, forward);
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  drawGround(drawn, stage, floor, onward, earthTonesIn(ramp), since, clearing);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell * 0.8, ramp, index, forward);
  for (const cloud of thrown.dust) drawCloud(drawn, cloud, since, cell, forward);
  for (const rock of thrown.rocks) drawBit(drawn, rock, since, cell, ramp, forward);
  return drawn;
}

/** The colours of broken ground, what glows in its split taken from the blade's own colours. */
function earthTonesIn(ramp: readonly string[]): EarthTones {
  return { ...earthTonesOf(ramp), glow: ramp[2], hot: ramp[4] };
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
  const heat = 1 - within(since, 0.12, COOLS_S);
  layFissure(drawn, at(-SPLIT_BACK * run), at(SPLIT_ON * run), cell * 0.2, tones, heat, clearing, stage.seed);
  CRAGS_AT.forEach((far, index) => {
    const heaves = (far / SPLIT_ON) * SPLIT_RUNS_S;
    const risen = outCubic(within(since, heaves, heaves + CRAG_RISES_S));
    if (risen <= 0) return;
    const side = index % 2 === 0 ? 1 : -1;
    const lean = { x: -onward.y * side * 0.34 + onward.x * 0.2, y: onward.x * side * 0.34 + onward.y * 0.2, z: 1 };
    const size = Math.hypot(lean.x, lean.y, lean.z);
    const way = { x: lean.x / size, y: lean.y / size, z: lean.z / size };
    const tall = cell * (0.6 - 0.08 * index) * risen * (0.35 + 0.65 * clearing);
    drawn.motes.push(
      crag(
        at(far, side * 0.14),
        way,
        tall,
        cell * (0.24 - 0.02 * index),
        tones.rock[index % 3],
        Math.min(1, clearing * 3),
        {
          variant: stage.seed + index * 1.7,
          veins: 0.5 * heat,
          glow: tones.glow,
        }
      )
    );
  });
}
