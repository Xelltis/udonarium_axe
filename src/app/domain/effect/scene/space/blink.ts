import { nothingStaged, outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { ball, floorMark, glow, haze, type Point } from '@axe/domain/effect/scene/parts';
import { SCENE_LINGER_S } from '@axe/domain/effect/scene/scene-kinds';
import { drawAfterimage, drawGlints, drawSnap, widthOf } from '@axe/domain/effect/scene/space/blink-after';
import {
  type BoldTones,
  boldTonesOf,
  layBoldFloorRing,
  layBoldScreenLine,
} from '@axe/domain/effect/scene/space/space-bold';
import { type Aside, scatterOf } from '@axe/domain/effect/scene/space/space-parts';
import { spaceBeatAt } from '@axe/domain/effect/space-looks';

/*
 * A blink, drawn in heavy lines of its colour over dark rims so it reads from far off. A line of light
 * splits the air through the piece from the floor to over its head, and space creases in towards it
 * from either side. The seam opens into an eye of night with a burning rim, the piece streaming up into it in threads of light while the dust about its feet is sucked in
 * after it; it narrows, faster and faster, and snaps shut: a cross of white light, the floor lit, and
 * the air rushing in where the piece stood in a ring over the floor. What is left is an afterimage
 * tearing away in lines, and glints drifting down over a fading mark.
 */

const LINGER_S = SCENE_LINGER_S.warp ?? 1;
/** When the seam starts to open and when it is open widest, as shares of the time before it snaps shut. */
const OPENS_FROM = 0.12;
const OPEN_BY = 0.58;
/** How long before it snaps shut the seam starts to narrow, in seconds. */
const NARROWS_S = 0.26;
/** How far the colour of the hot edge of a blink is turned from its own, as a share of a round. */
const HOT_TURN = -0.04;
/** The night seen within the seam. */
const DEPTH = '#071226';

/** The rim of the seam, half-wide `wide` and half-high `high`: its two sides from the foot of it to the top. */
function seamSides(wide: number, high: number): Aside[][] {
  return [1, -1].map((side) =>
    Array.from({ length: 13 }, (_unused, index) => {
      const v = -1 + (index / 12) * 2;
      return { right: side * wide * Math.pow(1 - v * v, 0.75), up: v * high };
    })
  );
}

/** The seam open `wide` across, its night within and the stars in it, and its burning rim. */
function drawSeam(
  drawn: Staged,
  chest: Point,
  wide: number,
  high: number,
  tones: BoldTones,
  cell: number,
  t: number,
  hot: number,
  forward: number
): void {
  if (wide > cell * 0.03) {
    drawn.motes.push({ ...haze(chest, wide * 4 + cell, DEPTH, 0.35, forward), aside: { right: 0, up: 0 } });
    for (let step = -4; step <= 4; step++) {
      const v = step / 4.6;
      const across = wide * Math.pow(1 - v * v, 0.75);
      drawn.motes.push({
        ...ball(chest, across * 1.9, DEPTH, 1, forward + 0.5, 0),
        aside: { right: 0, up: v * high },
      });
    }
    for (let step = -2; step <= 2; step++) {
      drawn.motes.push({
        ...haze(chest, wide * 1.1, mixColor(DEPTH, tones.body, 0.45), 0.7, forward + 0.6),
        aside: { right: 0, up: (step / 2.6) * high * 0.8 },
      });
    }
    for (let star = 0; star < 22; star++) {
      const v = (scatterOf(star, 3) - 0.5) * 1.7;
      const across = wide * Math.pow(Math.max(0, 1 - v * v), 0.75) * (scatterOf(star, 7) - 0.5) * 1.5;
      const twinkle = 0.5 + 0.5 * Math.sin(t * 23 + star * 2.3);
      drawn.motes.push({
        ...chest,
        size: cell * (0.07 + 0.06 * twinkle),
        color: star % 3 === 0 ? '#ffffff' : tones.core,
        alpha: 0.95,
        blend: 'color',
        forward: forward + 1,
        shape: 'star',
        spin: star,
        aside: { right: across, up: v * high + ((t * cell * 0.6 * (star % 2 === 0 ? 1 : -1)) % (high * 0.3)) },
      });
    }
  }
  const rim = cell * (0.2 + 0.08 * hot);
  for (const side of seamSides(Math.max(wide, cell * 0.004), high)) {
    for (const step of side.filter((_step, index) => index % 2 === 1)) {
      drawn.motes.push({
        ...glow(chest, cell * (0.45 + 0.3 * hot), tones.hot, 0.45 + 0.3 * hot, forward),
        aside: step,
      });
    }
    layBoldScreenLine(drawn, chest, side, {
      rim: tones.rim,
      body: tones.body,
      core: hot > 0.5 ? '#ffffff' : tones.core,
      glow: tones.hot,
      alpha: 1,
      lit: 0.6 + 0.4 * hot,
      wide: rim,
      forward: forward + 2,
    });
  }
  drawn.motes.push({
    ...glow(chest, cell * (0.7 + 0.8 * hot) + wide * 2, tones.hot, 0.3 + 0.4 * hot, forward),
  });
}

/** Threads of light the piece streams up into the seam in: drawn in towards its line and faster as it narrows. */
function drawThreads(
  drawn: Staged,
  stage: Stage,
  chest: Point,
  drawnIn: number,
  tones: BoldTones,
  forward: number
): void {
  if (drawnIn <= 0.01) return;
  const { cell, tall } = stage;
  const t = stage.seconds;
  const halfWide = Math.max(cell * 0.5, widthOf(stage) * 0.45);
  for (let thread = 0; thread < 26; thread++) {
    const across = (scatterOf(thread, 11) - 0.5) * 2 * halfWide * (1 - 0.85 * drawnIn);
    const pace = 0.8 + scatterOf(thread, 13) * 1.2;
    const climb = (t * pace * (0.8 + 2.4 * drawnIn) + scatterOf(thread, 17)) % 1;
    const up = (climb - 0.5) * tall * 1.15;
    const fast = cell * (2 + 9 * drawnIn);
    const fade = Math.min(1, climb * 4, (1 - climb) * 3) * drawnIn;
    const mote = { ...chest, velocity: { x: 0, y: 0, z: fast }, aside: { right: across, up } };
    drawn.motes.push({
      ...mote,
      size: cell * 0.15,
      color: tones.rim,
      alpha: 0.85 * fade,
      blend: 'color',
      shape: 'spark',
      trail: 0.05,
      forward: forward + 1,
    });
    drawn.motes.push({
      ...mote,
      size: cell * 0.09,
      color: tones.body,
      alpha: fade,
      blend: 'color',
      shape: 'spark',
      trail: 0.05,
      forward: forward + 1.5,
    });
    drawn.motes.push({
      ...mote,
      size: cell * 0.04,
      color: thread % 3 === 0 ? '#ffffff' : tones.core,
      alpha: fade,
      blend: 'color',
      shape: 'spark',
      trail: 0.05,
      forward: forward + 2,
    });
    drawn.motes.push({
      ...mote,
      size: cell * 0.2,
      color: tones.hot,
      alpha: 0.5 * fade,
      blend: 'light',
      shape: 'spark',
      trail: 0.05,
      forward,
    });
  }
}

/** Space creasing in towards the seam from either side: arcs of bent light closing on it and fading. */
function drawCreases(
  drawn: Staged,
  chest: Point,
  wide: number,
  high: number,
  tones: BoldTones,
  cell: number,
  t: number,
  shown: number,
  forward: number
): void {
  if (shown <= 0.01) return;
  for (let crease = 0; crease < 2; crease++) {
    const closing = (t * 1.6 + crease * 0.5) % 1;
    const far = wide + cell * (0.12 + 0.75 * (1 - closing));
    const bow = cell * 0.3 * (1 - closing);
    const alpha = shown * Math.min(1, closing * 3) * (1 - closing);
    for (const side of [1, -1]) {
      const steps = Array.from({ length: 9 }, (_unused, index) => {
        const v = -1 + (index / 8) * 2;
        return { right: side * (far - bow * (1 - v * v)), up: v * high * 1.15 };
      });
      layBoldScreenLine(drawn, chest, steps, {
        rim: tones.rim,
        body: tones.body,
        core: tones.core,
        glow: tones.hot,
        alpha,
        lit: 0.5 * alpha,
        wide: cell * 0.1,
        forward: forward + 1,
      });
    }
  }
}

/** The dust about the piece's feet sucked in after it, along the floor and up into the foot of the seam. */
function drawSuckedIn(drawn: Staged, floor: Point, cell: number, t: number, pull: number, forward: number): void {
  if (pull <= 0.01) return;
  for (let fleck = 0; fleck < 18; fleck++) {
    const turn = scatterOf(fleck, 5) * Math.PI * 2;
    const closing = (t * (1 + scatterOf(fleck, 9)) * (0.6 + pull) + scatterOf(fleck, 19)) % 1;
    const out = cell * (0.25 + 1.6 * (1 - closing) * (1 - closing));
    const at = {
      x: floor.x + Math.cos(turn) * out,
      y: floor.y + Math.sin(turn) * out,
      z: floor.z + cell * 0.04 + cell * 0.35 * closing * closing,
    };
    const fast = cell * (2 + 6 * closing) * (0.5 + pull);
    const velocity = { x: -Math.cos(turn) * fast, y: -Math.sin(turn) * fast, z: cell * 1.5 * closing };
    const fade = Math.min(1, closing * 5, (1 - closing) * 4) * pull;
    drawn.motes.push({
      ...at,
      size: cell * 0.11,
      color: '#6f5d4c',
      alpha: 0.75 * fade,
      blend: 'color',
      shape: 'spark',
      velocity,
      trail: 0.06,
      forward,
    });
  }
}

/** A blink: see the header. */
export function drawBlink(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell, duration, tall } = stage;
  const t = stage.seconds;
  if (t >= duration + LINGER_S) return drawn;
  const snaps = spaceBeatAt('blink', duration);
  const since = t - snaps;
  const tones = boldTonesOf(stage.preset.colorSecondary, stage.preset.colorPrimary, HOT_TURN);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const chest = { x: stage.x, y: stage.y, z: stage.z + tall * 0.5 };
  const forward = Math.max(cell, widthOf(stage)) * 0.6;
  const high = tall * 0.5 + cell * 0.3;
  const widest = Math.max(cell * 0.55, widthOf(stage) * 0.55);

  if (since < 0) {
    const opens = outCubic(within(t, snaps * OPENS_FROM, snaps * OPEN_BY));
    const narrows = within(t, snaps - NARROWS_S, snaps);
    const wide = widest * opens * (1 - narrows * narrows) * (1 + 0.04 * Math.sin(t * 31));
    const hot = Math.max(within(t, 0, 0.08) * (1 - opens), narrows);
    const seen = within(t, 0, 0.05);
    drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, DEPTH, 0.5 * opens * (1 - narrows * 0.5), 'color', 0));
    for (let ring = 0; ring < 2; ring++) {
      const closing = (t * 1.3 + ring * 0.5) % 1;
      const radius = cell * (0.4 + 1.5 * (1 - closing));
      const alpha = seen * Math.min(1, closing * 3) * (1 - closing * 0.4);
      layBoldFloorRing(drawn, floor, radius, 0.1, tones, alpha, 0.5 * alpha, tones.hot);
    }
    drawCreases(drawn, chest, wide, high, tones, cell, t, seen * (1 - narrows), forward);
    drawSuckedIn(drawn, floor, cell, t, opens * (1 - 0.3 * narrows), forward);
    drawSeam(drawn, chest, wide * seen, high * (0.4 + 0.6 * seen), tones, cell, t, hot, forward);
    drawThreads(drawn, stage, chest, Math.min(1, opens * 0.7 + narrows), tones, forward);
    drawn.lights.push({ ...chest, color: tones.hot, strength: 0.6 + 1.2 * narrows, reachPx: cell * 2.4 });
    return drawn;
  }
  drawSnap(drawn, stage, chest, floor, tones, since, forward);
  drawAfterimage(drawn, stage, chest, tones, since, forward);
  drawGlints(drawn, stage, chest, floor, tones, since, forward);
  return drawn;
}
