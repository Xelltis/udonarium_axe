import { holyStrikesAt, smiteLookOf } from '@axe/domain/effect/holy-looks';
import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { drawHeaven } from '@axe/domain/effect/scene/holy/heaven';
import {
  drawBeat,
  drawFeathers,
  drawHoop,
  drawLightSparks,
  drawPillar,
  drawRisingLights,
  holyTonesOf,
  layLightRing,
  layLightScorch,
} from '@axe/domain/effect/scene/holy/holy-parts';
import { floorMark, glow, haze } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';

/*
 * Light that smites, drawn by its grade. At the lowest a seal: a crest of light kindles level over the
 * target's head, sparks drawn in to it, and one thin pillar drops through it onto the target, the
 * crest flaring as it passes and then coming apart. At the middle a judgement: a ring closes on the
 * floor about the target under a thread of light, a thick pillar falls on it in a white beat, stands
 * with hoops of light sliding down it, and thins away, while feathers drift down round it. At the
 * highest the light of heaven: see `heaven.ts`. Each leaves a stain of light on the floor, with a
 * crest burnt into it, and motes of light rising off it.
 */

const LINGER_S = SCENE_LINGER_S.smite ?? 1.2;
/** How high over the floor a pillar comes down from, in cells. */
const SKY_CELLS = 9;
/** How long a pillar takes to come down, in seconds. */
const FALLS_S = 0.07;

/** A light that smites: see the header. */
export const smite: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => {
    const look = smiteLookOf(stage.preset);
    return look === 'seal'
      ? drawSeal(stage)
      : look === 'judgement'
        ? drawJudgement(stage)
        : drawHeaven(stage, LINGER_S);
  },
};

/** When a smiting strikes its target, in seconds of its playback. */
function strikesAtOf(stage: Stage): number {
  return stage.blowsAt[0] ?? holyStrikesAt('smite', stage.preset.gradeLevel, stage.duration) ?? stage.duration * 0.3;
}

/** The seal: see the header. */
function drawSeal(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const strikes = strikesAtOf(stage);
  const since = t - strikes;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const tones = holyTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const over = { x: stage.x, y: stage.y, z: stage.z + stage.tall + cell * 0.5 };
  const forward = cell * 0.4;
  const wide = cell * 0.26;

  const kindled = outCubic(within(t, 0, strikes * 0.85));
  const apart = within(since, 0.35, 0.8);
  const flares = since >= 0 ? Math.max(0, 1 - since / 0.22) : 0;
  const sealed = kindled * (1 - apart);
  if (sealed > 0.01) {
    const radius = cell * 0.62 * (0.35 + 0.65 * kindled) * (1 + 0.45 * flares + 0.5 * apart);
    const turn = (stage.seed % 7) + t * 1.4;
    drawn.floor.push(floorMark('crest', over, radius, 0.2, tones.amber, 0.95 * sealed, 'color', 0, turn));
    drawn.floor.push(floorMark('crest', over, radius, 0.12, tones.hot, sealed, 'light', 0, turn));
    drawn.floor.push(floorMark('disc', over, radius * 1.5, 1, tones.gold, 0.4 * sealed, 'light', 0));
    drawn.motes.push(haze(over, cell * 0.5, tones.amber, 0.5 * sealed, forward));
    drawn.motes.push({
      ...glow(over, cell * (0.5 + 0.5 * flares) * kindled, '#ffffff', sealed * (0.7 + 0.3 * Math.sin(t * 31)), forward),
      shape: 'star',
      spin: t * 2,
    });
    drawn.lights.push({ ...over, color: tones.gold, strength: 0.6 * sealed, reachPx: cell * 2 });
  }
  if (since < 0) {
    for (let index = 0; index < 8; index++) {
      const turn = index * 2.4 + t * 5;
      const out = cell * 1.1 * (1 - kindled) + cell * 0.1;
      const at = { x: over.x + Math.cos(turn) * out, y: over.y + Math.sin(turn) * out, z: over.z };
      drawn.motes.push(haze(at, cell * 0.09, tones.amber, 0.8 * kindled, forward));
      drawn.motes.push(glow(at, cell * 0.13, tones.hot, kindled, forward + 1));
    }
  }

  const sky = floor.z + cell * SKY_CELLS;
  const fallen = within(t, strikes - FALLS_S, strikes);
  if (fallen > 0 && since < 0.45) {
    const thins = 1 - outCubic(within(since, 0.04, 0.45));
    const head = { ...floor, z: sky - (sky - floor.z) * fallen };
    drawPillar(drawn, head, sky, wide * (0.35 + 0.65 * thins), tones, Math.min(1, thins * 1.6), t);
  }
  if (since >= 0) {
    drawBeat(drawn, floor, cell * 0.75, tones, since, 0.06);
    layLightRing(drawn, floor, cell * 0.2, cell * 1.5, cell * 0.12, tones, since, 0.32);
    layLightScorch(drawn, floor, cell * 0.55, tones, since, ends - strikes, stage.seed);
    drawLightSparks(drawn, stage.seed, { ...floor, z: floor.z + cell * 0.1 }, 12, cell, since, tones, forward);
    drawRisingLights(
      drawn,
      stage.seed,
      floor,
      cell,
      since,
      tones,
      { count: 7, out: [0, cell * 0.6], born: [0.05, Math.max(0.1, ends - strikes - 1.2)], rise: cell * 1.3 },
      forward
    );
    if (since < 0.3)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 0.8,
        color: tones.hot,
        strength: 1.5 * (1 - since / 0.3),
        reachPx: cell * 2.6,
      });
  }
  return drawn;
}

/** The judgement: see the header. */
function drawJudgement(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration } = stage;
  const t = stage.seconds;
  const strikes = strikesAtOf(stage);
  const since = t - strikes;
  const ends = duration + LINGER_S;
  if (t >= ends) return drawn;
  const tones = holyTonesOf(rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7));
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.4;
  const wide = cell * 0.9;
  const sky = floor.z + cell * SKY_CELLS;
  const density = stage.preset.gradeDensity;

  if (since < 0) {
    const coming = within(t, 0, strikes);
    const radius = cell * (1.8 - 1.05 * outCubic(coming));
    drawn.floor.push(floorMark('ring', floor, radius, 0.13, tones.amber, 0.9 * coming, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, 0.07, tones.hot, coming, 'light', 0));
    drawn.floor.push(floorMark('disc', floor, cell * 1.2, 1, tones.gold, 0.35 * coming, 'light', 0));
    drawPillar(drawn, floor, sky, wide * 0.14, tones, 0.4 * coming, t);
  }
  const fallen = within(t, strikes - FALLS_S, strikes);
  const stands = 1 - outCubic(within(since, 0.5, 1.25));
  if (fallen > 0 && since < 1.25) {
    const head = { ...floor, z: sky - (sky - floor.z) * fallen };
    const swells = since >= 0 ? 1 + 0.25 * Math.max(0, 1 - since / 0.12) : 1;
    drawPillar(drawn, head, sky, wide * swells * (0.1 + 0.9 * stands), tones, Math.min(1, stands * 2), t);
  }
  if (since >= 0 && since < 1.25) {
    for (let hoop = 0; hoop < 3; hoop++) {
      const slid = (since * 1.25 + hoop / 3) % 1;
      const high = (1 - slid) * cell * 3.4;
      const fade = Math.min(1, slid * 5, (1 - slid) * 4) * stands;
      drawHoop(
        drawn,
        { ...floor, z: floor.z + high },
        wide * (0.62 + 0.3 * (high / (cell * 3.4))) * (0.4 + 0.6 * stands),
        cell * 0.07,
        tones,
        fade
      );
    }
    const foot = { ...floor, z: floor.z + cell * 0.25 };
    drawn.motes.push(haze(foot, cell * 2.2, tones.amber, 0.45 * stands, forward));
    drawn.motes.push(glow(foot, cell * 1.7, tones.hot, 0.6 * stands, forward));
    drawn.lights.push({ ...floor, z: floor.z + cell, color: tones.gold, strength: 1.1 * stands, reachPx: cell * 3.2 });
  }
  if (since >= 0) {
    drawBeat(drawn, floor, cell * 1.5, tones, since);
    layLightRing(drawn, floor, cell * 0.4, cell * 2.7, cell * 0.2, tones, since, 0.42);
    layLightRing(drawn, floor, cell * 0.3, cell * 1.8, cell * 0.1, tones, since - 0.12, 0.5);
    layLightScorch(drawn, floor, cell * 0.95, tones, since, ends - strikes, stage.seed);
    drawLightSparks(
      drawn,
      stage.seed,
      { ...floor, z: floor.z + cell * 0.1 },
      Math.round(18 * density),
      cell,
      since,
      tones,
      forward
    );
    drawRisingLights(
      drawn,
      stage.seed,
      floor,
      cell,
      since,
      tones,
      {
        count: Math.round(16 * density),
        out: [0, cell * 0.9],
        born: [0.1, Math.max(0.2, ends - strikes - 1.8)],
        rise: cell * 1.5,
      },
      forward
    );
    drawFeathers(
      drawn,
      stage.seed,
      floor,
      cell,
      since,
      tones,
      {
        count: Math.round(9 * density),
        out: [cell * 0.25, cell * 1.4],
        high: [cell * 1.3, cell * 3.4],
        born: [0.05, 0.7],
        ends: ends - strikes,
      },
      forward
    );
    if (since < 0.35)
      drawn.lights.push({
        ...floor,
        z: floor.z + cell * 1.2,
        color: '#ffffff',
        strength: 2 * (1 - since / 0.35),
        reachPx: cell * 4,
      });
  }
  return drawn;
}
