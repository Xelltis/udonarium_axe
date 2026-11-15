import { darkStrikesAt } from '@axe/domain/effect/dark-looks';
import { beatAt } from '@axe/domain/effect/dark-reaction';
import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { drawBlackSmoke, drawInkMotes } from '@axe/domain/effect/scene/dark/dark-drift';
import {
  type BlackFlame,
  type DarkTones,
  darkTonesOf,
  drawDarkBeat,
  drawDim,
  drawShards,
  layBlackFlames,
  layDarkRing,
  layDarkScorch,
  layShadowPool,
} from '@axe/domain/effect/scene/dark/dark-parts';
import { drawHand, type Hand } from '@axe/domain/effect/scene/dark/shadow-hand';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { floorMark, glow, keptFor, type Point, stageKey } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * An abyss. A mire of black opens over the floor, a ring racing out to its ragged, burning rim, the
 * light going out of the table about it; rings run in over it to its middle and black bubbles up out
 * of it. Hands of shadow rise out of it all over, groping, and more of them close about every piece
 * it has caught; then all of them seize at once, in a black beat, and drag: at every pull the arms
 * shorten and the pieces sink, smoke streaming up. At the last they wrench everything down, the mire
 * shuts over them to its middle in a ring of violet and a splash of black fire, and where each piece
 * stood a stain is left, motes of black drifting up out of it.
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
const GROPING = 26;
/** How long one pull of the hands is, in milliseconds. */
const PULL_MS = 520;

const handsByStage = new Map<string, { readonly groping: readonly Hand[]; readonly seizing: readonly Hand[] }>();

/** The hands of a stage: those that rise all over the mire and grope, and those that close about the target. */
function handsOf(stage: Stage, reach: number, whole: boolean, seizes: number) {
  return keptFor(handsByStage, `${stageKey(stage, reach + seizes)}|${stage.targets.length}`, () => {
    const next = seededRun(stage.seed * 19 + 7);
    const { cell } = stage;
    const floorZ = stage.groundZ;
    const waist = { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.4 };
    const seizing: Hand[] = [];
    const from = next() * Math.PI * 2;
    const about = stage.targets.length > 4 ? 3 : 4;
    for (let index = 0; index < about; index++) {
      const turn = from + (index / about) * Math.PI * 2 + (next() - 0.5) * 0.5;
      const out = cell * (0.62 + next() * 0.16);
      seizing.push({
        root: { x: stage.x + Math.cos(turn) * out, y: stage.y + Math.sin(turn) * out, z: floorZ },
        toward: { x: -Math.cos(turn), y: -Math.sin(turn) },
        tall: (stage.tall / cell) * 0.6 + 0.3 + next() * 0.3,
        size: 0.7 + next() * 0.2,
        risesAt: Math.max(OPENS_S * 0.7, seizes - 0.5 + next() * 0.25),
        phase: next() * 6,
        grabs: { x: waist.x, y: waist.y, z: waist.z + (next() - 0.5) * stage.tall * 0.3 },
      });
    }
    const groping: Hand[] = [];
    const count = whole ? Math.round(GROPING / (stage.areaPx > 0 ? 1 : Math.max(1, stage.targets.length))) : 0;
    for (let index = 0; index < count; index++) {
      const turn = from + index * 2.39996 + (next() - 0.5) * 0.3;
      const out = reach * (0.3 + 0.58 * Math.sqrt((index + 0.5) / count));
      const facing = next() * Math.PI * 2;
      const root = { x: stage.x + Math.cos(turn) * out, y: stage.y + Math.sin(turn) * out, z: floorZ };
      const tall = 0.9 + next() * 1;
      const size = 0.65 + next() * 0.35;
      const risesAt = OPENS_S * 0.6 + next() * Math.max(0.1, seizes - OPENS_S * 0.6 - 0.2);
      const phase = next() * 6;
      const crowds = stage.targets.some(
        (target) => Math.hypot(target.x - root.x, target.y - root.y) < target.widthPx * 0.5 + cell * 0.7
      );
      if (crowds) continue;
      groping.push({ root, toward: { x: Math.cos(facing), y: Math.sin(facing) }, tall, size, risesAt, phase });
    }
    return { groping, seizing };
  });
}

/** The face of the mire: rings running in over it to its middle, and streaks turning slowly about it. */
function laySurface(
  drawn: Staged,
  floor: Point,
  reach: number,
  tones: DarkTones,
  shown: number,
  t: number,
  seed: number
) {
  if (shown <= 0.01) return;
  for (let ring = 0; ring < 3; ring++) {
    const share = (t * 0.42 + ring / 3) % 1;
    const radius = reach * 0.92 * (1 - share);
    const fade = Math.min(1, share * 5, (1 - share) * 3) * shown;
    drawn.floor.push(floorMark('ring', floor, radius, 0.09, tones.edge, 0.75 * fade, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, 0.035, tones.glow, 0.8 * fade, 'light', 0));
  }
  drawn.floor.push(
    floorMark('cracks', floor, reach * 0.9, 0.6, tones.edge, 0.55 * shown, 'color', (seed % 13) + 1, t * 0.35)
  );
  drawn.floor.push(
    floorMark('cracks', floor, reach * 0.9, 0.3, tones.glow, 0.4 * shown, 'light', (seed % 13) + 1, t * 0.35)
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
  const tones = darkTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
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

  if (open > 0.01) {
    const patch = whole ? reach : cell * 1.05;
    if (whole) layShadowPool(drawn, floor, patch * open, tones, 1, stage.seed, 0.55);
    else drawn.floor.push(floorMark('scorch', floor, patch * open, 1, tones.ink, 1, 'color', (stage.seed % 89) + 1));
    if (whole) {
      drawn.floor.push(
        floorMark('disc', floor, patch * open * 0.95, 1, mixColor(tones.deep, tones.edge, 0.3), 0.8, 'color', 0)
      );
      laySurface(drawn, floor, patch * open, tones, open, t, stage.seed);
      drawDim(drawn, { ...floor, z: floor.z + cell }, reach * 2.6, 0.28 * open, cell * 0.2);
      drawn.lights.push({ ...chest, color: tones.edge, strength: 0.5 * open + 0.5 * pull, reachPx: reach * 1.4 });
    }
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
      { count: 10, out: [reach * 0.3, reach * 0.85], born: [seizes, shuts - 0.3], tall: cell * 1.3 },
      forward
    );
  }

  const hands = handsOf(stage, reach, whole, seizes);
  const yanked = within(t, shuts - 0.02, shuts + 0.16);
  for (const hand of hands.groping) {
    const risen = outCubic(within(t, hand.risesAt, hand.risesAt + 0.32)) * (1 - yanked);
    const clench = within(t, seizes, seizes + 0.07) * (1 - within(t, seizes + 0.25, seizes + 0.6));
    const gropes = 0.3 + 0.25 * Math.sin(t * 3.1 + hand.phase);
    drawHand(drawn, hand, cell, tones, { risen, grip: Math.max(gropes, clench), pulled: 0.25 * pull, t });
  }
  for (const hand of hands.seizing) {
    const risen = outCubic(within(t, hand.risesAt, hand.risesAt + 0.28)) * (1 - yanked);
    const grip = outCubic(within(t, seizes - 0.05, seizes + 0.02));
    drawHand(drawn, hand, cell, tones, { risen, grip, pulled: held ? 0.2 + 0.5 * pull : 0, t });
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
      cell * (whole ? 1.1 : 0.7),
      tones,
      sinceShut,
      0.1
    );
    if (whole) layDarkRing(drawn, floor, reach, cell * 0.2, cell * 0.5, tones, sinceShut, SHUTS_S);
    if (sinceShut < 0.7) {
      const next = seededRun(stage.seed * 29 + 11);
      const flames: BlackFlame[] = [];
      const dying = 1 - within(sinceShut, 0.3, 0.7);
      for (let index = 0; index < 9; index++) {
        const turn = (index / 9) * Math.PI * 2 + next();
        const out = cell * (0.15 + next() * 0.45);
        flames.push({
          root: { x: floor.x + Math.cos(turn) * out, y: floor.y + Math.sin(turn) * out, z: floor.z },
          heading: { x: Math.cos(turn) * 0.25, y: Math.sin(turn) * 0.25, z: 1 },
          wide: cell * (0.3 + next() * 0.2) * (0.5 + 0.5 * dying),
          long: cell * (0.9 + next() * 0.9) * outCubic(within(sinceShut, 0, 0.12)) * dying,
          flowed: sinceShut * 3.4 + index,
          variant: index,
          alpha: Math.min(1, dying * 3),
        });
      }
      layBlackFlames(drawn, flames, tones, forward);
      drawn.lights.push({ ...chest, color: tones.edge, strength: 1.4 * (1 - sinceShut / 0.7), reachPx: cell * 3.6 });
    }
    drawShards(
      drawn,
      stage.seed + 9,
      { ...floor, z: floor.z + cell * 0.2 },
      floor.z,
      18,
      cell,
      sinceShut,
      tones,
      forward
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
