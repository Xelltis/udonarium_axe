import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { beatAt } from '@axe/domain/effect/dark-reaction';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import {
  abyssTonesOf,
  drawChurn,
  drawGeyser,
  drawSinkingRim,
  layPitDepth,
} from '@axe/domain/effect/scene/dark/abyss-pit';
import { drawBlackSmoke, drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type DarkTones,
  drawDarkBeat,
  drawDim,
  drawShards,
  layDarkRing,
  layDarkScorch,
  layShadowPool,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { drawHand, type Hand } from '@axe/domain/effect/scene/dark/shadow-hand';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, keptFor, type Point, stageKey } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An abyss. A pit of black opens over the floor, a ring racing out to its ragged, burning rim, the
 * light going out of the table about it: black within black towards its middle, its face churning in
 * whirled streaks of violet and bubbling black, a rim of torn earth standing round it and the floor
 * about it split. Great hands of shadow rise out of it all over, groping high over the pieces, and
 * more of them rear up over every piece it has caught and come down on it; then all of them seize at
 * once, in a black beat, and drag: at every pull the arms shorten, the pieces sink, the rim sinks and
 * slides in, and smoke streams up. At the last they wrench everything down, the rim is dragged under,
 * the pit shuts over them to its middle, a geyser of black fire is thrown up over the whole of it,
 * earth flung out and a ring of black racing away; where it was a scar is left, and where each piece
 * stood a stain, smoke and motes of black drifting up out of them.
 *
 * Over an area it opens once, about the first target, as wide as the area; cast on targets one by one
 * it opens under each of them.
 */

const LINGER_S = SCENE_LINGER_S.shadow ?? 1.6;
/** How wide the mire is without an area, in cells from its middle. */
const REACH_CELLS = 1.9;
/** How long the mire takes to open and to shut, in seconds. */
const OPENS_S = 0.45;
const SHUTS_S = 0.4;
/** How many hands rise all over a mire and grope, shared among the mires of a cast on targets one by one. */
const GROPING = 16;
/** How long one pull of the hands is, in milliseconds. */
const PULL_MS = 520;

const handsByStage = new Map<string, { readonly groping: readonly Hand[]; readonly seizing: readonly Hand[] }>();

/** The hands of a stage: those that rise all over the mire and grope, and those that close about the target. */
function handsOf(stage: Stage, reach: number, whole: boolean, seizes: number) {
  return keptFor(handsByStage, `${stageKey(stage, reach + seizes)}|${stage.targets.length}`, () => {
    const next = seededRun(stage.seed * 19 + 7);
    const { cell } = stage;
    const floorZ = stage.groundZ;
    const waist = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
    const seizing: Hand[] = [];
    const from = next() * Math.PI * 2;
    const about = stage.targets.length > 4 ? 3 : 4;
    for (let index = 0; index < about; index++) {
      const turn = from + (index / about) * Math.PI * 2 + (next() - 0.5) * 0.5;
      const out = cell * (0.72 + next() * 0.18);
      seizing.push({
        root: { x: stage.x + Math.cos(turn) * out, y: stage.y + Math.sin(turn) * out, z: floorZ },
        toward: { x: -Math.cos(turn), y: -Math.sin(turn) },
        tall: (stage.tall / cell) * 1.25 + 0.6 + next() * 0.4,
        size: 1.15 + next() * 0.25,
        risesAt: Math.max(OPENS_S * 0.7, seizes - 0.5 + next() * 0.25),
        phase: next() * 6,
        grabs: { x: waist.x, y: waist.y, z: waist.z + (next() - 0.5) * stage.tall * 0.3 },
      });
    }
    const groping: Hand[] = [];
    const count = whole ? Math.round(GROPING / (stage.areaPx > 0 ? 1 : Math.max(1, stage.targets.length))) : 0;
    const tries = Math.round(count * 2.2);
    const clear = cell * (stage.areaPx > 0 ? 1.25 : 1.1);
    for (let index = 0; index < tries && groping.length < count; index++) {
      const turn = from + index * 2.39996 + (next() - 0.5) * 0.3;
      const out = reach * (0.3 + 0.62 * Math.sqrt((index + 0.5) / tries));
      const facing = next() * Math.PI * 2;
      const root = { x: stage.x + Math.cos(turn) * out, y: stage.y + Math.sin(turn) * out, z: floorZ };
      const tall = 1.5 + next() * 1.4;
      const size = 1 + next() * 0.5;
      const risesAt = OPENS_S * 0.6 + next() * Math.max(0.1, seizes - OPENS_S * 0.6 - 0.2);
      const phase = next() * 6;
      const crowds = stage.targets.some(
        (target) => Math.hypot(target.x - root.x, target.y - root.y) < target.widthPx * 0.5 + clear
      );
      if (crowds) continue;
      groping.push({ root, toward: { x: Math.cos(facing), y: Math.sin(facing) }, tall, size, risesAt, phase });
    }
    return { groping, seizing };
  });
}

/** The cracks over the face of the mire, turning slowly about it. */
function layCracks(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  shown: number,
  t: number,
  seed: number
) {
  if (shown <= 0.01) return;
  drawn.floor.push(
    floorMark('cracks', floor, reach * 0.9, 0.7, tones.edge, 0.6 * shown, 'color', (seed % 13) + 1, t * 0.35)
  );
  drawn.floor.push(
    floorMark('cracks', floor, reach * 0.9, 0.3, tones.glow, 0.35 * shown, 'light', (seed % 13) + 1, t * 0.35)
  );
}

/** An abyss: see the header. */
export function drawAbyss(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const strikes = darkStrikesAt('shadow', 3, duration) ?? [];
  const seizes = stage.blowsAt[0] ?? strikes[0] ?? duration * 0.3;
  const shuts = Math.max(seizes + 0.3, stage.blowsAt[1] ?? strikes[1] ?? duration * 0.72);
  const tones = abyssTonesOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const lead = (stage.targets[0] ?? stage).index === stage.index;
  const whole = stage.areaPx <= 0 || lead;
  const reach = stage.areaPx > 0 ? Math.max(stage.areaPx, cell * 1.4) : cell * REACH_CELLS;
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.5 };
  const forward = cell * 0.4;
  const opened = outCubic(within(t, 0, OPENS_S));
  const shut = outCubic(within(t, shuts, shuts + SHUTS_S));
  const open = opened * (1 - shut);
  const held = t >= seizes && t < shuts;
  const pull = held ? beatAt((t - seizes) * 1000, PULL_MS) : 0;
  const sinceShut = t - shuts;
  const sunk = 0.85 * within(t, seizes - 0.2, shuts) + 0.15 * pull;
  const yanked = within(t, shuts - 0.02, shuts + 0.16);

  if (open > 0.01) {
    const patch = whole ? reach : cell * 1.05;
    if (whole) layShadowPool(drawn, floor, patch * open, tones, 1, stage.seed, 0.55);
    else drawn.floor.push(floorMark('scorch', floor, patch * open, 1, tones.ink, 1, 'color', (stage.seed % 89) + 1));
    if (whole) {
      layPitDepth(drawn, floor, patch, tones, open);
      layCracks(drawn, floor, patch * open, tones, open, t, stage.seed);
      drawChurn(drawn, floor, patch * open, tones, cell, t, open, stage.seed, forward);
      drawDim(drawn, { ...floor, z: floor.z + cell }, reach * 2.6, 0.3 * open, cell * 0.2);
      drawn.lights.push({ ...chest, color: tones.edge, strength: 0.5 * open + 0.6 * pull, reachPx: reach * 1.4 });
    }
  }
  if (whole) {
    drawSinkingRim(drawn, floor, reach, tones, cell, t, opened, sunk, yanked, stage.seed, forward);
  }
  if (whole) {
    layDarkRing(drawn, floor, cell * 0.3, reach * 1.25, cell * 0.3, tones, t, OPENS_S + 0.1);
    drawInkMotes(
      drawn,
      stage.seed + 5,
      floor,
      cell,
      t,
      tones,
      { count: 36, out: [0, reach * 0.85], born: [OPENS_S * 0.5, shuts - 0.4], rise: cell * 0.9 },
      forward
    );
    drawBlackSmoke(
      drawn,
      stage.seed + 3,
      floor,
      cell,
      t,
      tones,
      { count: 14, out: [reach * 0.3, reach * 0.95], born: [seizes, ends - 1.4], tall: cell * 1.8 },
      forward
    );
  }

  const hands = handsOf(stage, reach, whole, seizes);
  for (const hand of hands.groping) {
    const risen = outCubic(within(t, hand.risesAt, hand.risesAt + 0.32)) * (1 - yanked);
    const clench = within(t, seizes, seizes + 0.07) * (1 - within(t, seizes + 0.25, seizes + 0.6));
    const gropes = 0.3 + 0.3 * Math.sin(t * 3.1 + hand.phase);
    drawHand(drawn, hand, cell, tones, { risen, grip: Math.max(gropes, clench), pulled: 0.2 * sunk + 0.3 * pull, t });
  }
  for (const hand of hands.seizing) {
    const risen = outCubic(within(t, hand.risesAt, hand.risesAt + 0.28)) * (1 - yanked);
    const grip = outCubic(within(t, seizes - 0.05, seizes + 0.02));
    drawHand(drawn, hand, cell, tones, { risen, grip, pulled: held ? 0.25 + 0.6 * pull : 0, t });
  }

  drawDarkBeat(drawn, chest, floor, cell * 0.75, tones, t - seizes);
  if (t >= seizes && t < seizes + 0.35) {
    const left = 1 - (t - seizes) / 0.35;
    drawn.motes.push(glow(chest, cell * 2.6, tones.glow, 0.6 * left, forward));
    drawn.lights.push({ ...chest, color: tones.edge, strength: 1.3 * left, reachPx: cell * 3 });
  }
  drawShards(drawn, stage.seed, chest, floor.z, 12, cell, t - seizes, tones, forward, 0.5);

  if (sinceShut >= 0) {
    drawDarkBeat(
      drawn,
      { ...floor, z: floor.z + cell * 0.3 },
      floor,
      cell * (whole ? 1.4 : 0.7),
      tones,
      sinceShut,
      0.12
    );
    if (whole) {
      layDarkRing(drawn, floor, reach, cell * 0.2, cell * 0.5, tones, sinceShut, SHUTS_S * 0.6);
      layDarkRing(drawn, floor, cell * 0.5, reach * 1.45, cell * 0.8, tones, sinceShut - 0.06, 0.4);
      drawGeyser(drawn, floor, reach, tones, cell, sinceShut, stage.seed, forward);
      if (sinceShut < 0.25) {
        const left = 1 - sinceShut / 0.25;
        drawn.floor.push(floorMark('disc', floor, reach * 1.5, 1, tones.glow, 0.45 * left, 'light', 0));
      }
      layDarkScorch(drawn, floor, reach * 0.62, tones, sinceShut, ends - shuts, stage.seed + 7);
    } else if (sinceShut < 0.7) {
      drawGeyser(drawn, floor, cell * 0.8, tones, cell * 0.6, sinceShut, stage.seed, forward);
    }
    if (sinceShut < 0.7) {
      drawn.lights.push({ ...chest, color: tones.edge, strength: 2 * (1 - sinceShut / 0.7), reachPx: cell * 4 });
    }
    drawShards(
      drawn,
      stage.seed + 9,
      { ...floor, z: floor.z + cell * 0.2 },
      floor.z,
      whole ? 30 : 14,
      cell,
      sinceShut,
      tones,
      forward,
      0.9
    );
    layDarkScorch(drawn, floor, cell * (whole ? 1.2 : 0.8), tones, sinceShut, ends - shuts, stage.seed);
    drawInkMotes(
      drawn,
      stage.seed + 1,
      floor,
      cell,
      sinceShut,
      tones,
      {
        count: whole ? 30 : 12,
        out: [0, whole ? reach * 0.7 : cell * 0.9],
        born: [0.15, Math.max(0.3, ends - shuts - 1.5)],
        rise: cell * 1.2,
      },
      forward
    );
  }
  return drawn;
}
