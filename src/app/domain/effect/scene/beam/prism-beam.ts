import { hexChannels } from '@axe/core/util/hex-color';
import {
  beamFadeAt,
  type BeamLine,
  type BeamPose,
  beamSwellAt,
  layBeamBody,
  layBeamStreaks,
  onLine,
} from '@axe/domain/effect/scene/beam/beam-body';
import { type ColossalLook } from '@axe/domain/effect/scene/beam/colossal';
import { layBeamShreds } from '@axe/domain/effect/scene/beam/great-beam';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, glow, lightBall, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The beam of many hues: strands of five colours braided about a white core in a dark rim, each
 * strand drawn by halves so that it passes behind the core and before it, the braid turning as it
 * pours and opening like a flower where the beam ends. Its hues are taken round the wheel of colour
 * from the colour it is given, so no one of them washes over the table. It gathers as five orbs of
 * its hues wheeling in on the ball over a seal of light, is let go in rings of every hue, and throws
 * rays of every hue off the piece it strikes.
 */

/** How many strands it is braided of. */
const STRANDS = 5;
/** How far from the core a strand winds, and how wide it is, as shares of the beam's width. */
const WINDS_AT = 0.46;
const STRAND_WIDE = 0.25;
/** How many times as wide as a strand the dark laid under it is. */
const OUTLINED = 1.45;
/** How many widths of the beam a strand takes to wind once about it, and how fast the braid turns, in turns a second. */
const PITCH = 3.4;
const TURNS = 1.15;
/** How many times as far from the core the strands are where the beam ends, and over how many widths they open. */
const OPENS = 2.6;
const OPENS_OVER = 2.4;
/** The dark laid under the braid. */
const SHADOW = '#0b0718';

/**
 * The hues of the braid: as many colours round the wheel of colour, evenly apart, as it has strands,
 * the first of them of the hue of the colour given, all of them as vivid as a colour can be.
 */
export function prismHuesOf(color: string): string[] {
  const [r, g, b] = (hexChannels(color) ?? [255, 79, 216]).map((channel) => channel / 255);
  const high = Math.max(r, g, b);
  const span = high - Math.min(r, g, b);
  const first =
    span < 0.01 ? 0 : high === r ? ((g - b) / span + 6) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return Array.from({ length: STRANDS }, (_unused, index) => vivid((first + (index * 6) / STRANDS) % 6));
}

/** The vivid colour at a place round the wheel, from 0 for red through 2 for green and 4 for blue back to 6. */
function vivid(sixth: number): string {
  const rise = (offset: number) => {
    const at = (sixth + offset) % 6;
    const level = at < 1 ? at : at < 3 ? 1 : at < 4 ? 4 - at : 0;
    return Math.round(255 * (0.12 + 0.88 * level))
      .toString(16)
      .padStart(2, '0');
  };
  return `#${rise(2)}${rise(0)}${rise(4)}`;
}

/** The strands of the braid as bands, each in two halves: those behind the core, and those before it. */
function strandsOf(
  pose: BeamPose,
  hues: readonly string[],
  count: number
): { far: EffectRibbon[]; near: EffectRibbon[]; halos: EffectRibbon[] } {
  const head = pose.line.length * pose.reached;
  const far: EffectRibbon[] = [];
  const near: EffectRibbon[] = [];
  const halos: EffectRibbon[] = [];
  hues.forEach((hue, strand) => {
    const points: Point[] = [];
    const about: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let index = 0; index <= count; index++) {
      const along = (head * index) / count;
      const swell = beamSwellAt(pose, along);
      const opening = within(along, head - pose.wide * OPENS_OVER, head);
      const turn =
        Math.PI * 2 * (strand / hues.length + along / (pose.wide * PITCH) - pose.seconds * TURNS) + pose.seed;
      const out = pose.wide * WINDS_AT * (swell + (1 - swell) * opening) * (1 + (OPENS - 1) * opening * opening);
      points.push(onLine(pose.line, along, Math.cos(turn) * out, Math.sin(turn) * out));
      about.push(onLine(pose.line, along));
      widths.push(pose.wide * STRAND_WIDE * swell * (1 - 0.5 * opening));
      alphas.push(Math.min(1, beamFadeAt(pose, along) * 1.6));
    }
    const band = (half: 'near' | 'far'): EffectRibbon => ({
      points,
      widths,
      color: hue,
      core: mixColor(hue, '#ffffff', 0.6),
      alpha: pose.power,
      alphas,
      blend: 'color',
      about,
      half,
    });
    const outline = (half: 'near' | 'far'): EffectRibbon => ({
      ...band(half),
      widths: widths.map((width) => width * OUTLINED),
      color: SHADOW,
      core: undefined,
      alpha: 0.85 * pose.power,
    });
    halos.push({
      points,
      widths: widths.map((width) => width * 2.6),
      color: hue,
      alpha: 0.4 * pose.power,
      alphas,
      blend: 'light',
      soft: 1,
    });
    far.push(outline('far'), band('far'));
    near.push(outline('near'), band('near'));
  });
  return { far, near, halos };
}

/** One orb of a hue, in a dark rim. */
function layHueOrb(drawn: Staged, at: Point, size: number, hue: string, alpha: number, forward: number): void {
  drawn.motes.push(ball(at, size * 1.25, SHADOW, 0.8 * alpha, forward, 1));
  drawn.motes.push(ball(at, size, hue, alpha, forward + 1, 2));
  drawn.motes.push(lightBall(at, size * 0.5, '#ffffff', alpha, forward + 2));
}

/** The five orbs wheeling in on the ball as it gathers, each trailing a band of its hue, over a seal of light turning on the floor. */
function layWheel(
  drawn: Staged,
  line: BeamLine,
  floor: Point,
  cell: number,
  wide: number,
  hues: readonly string[],
  seconds: number,
  gather: number
): void {
  const turned = seconds * 1.4 + gather * gather * 9;
  drawn.floor.push(
    floorMark('crest', floor, cell * (1.6 + 1.2 * gather), 0.07, SHADOW, 0.6 * gather, 'color', 0, turned * 0.4)
  );
  drawn.floor.push(
    floorMark('crest', floor, cell * (1.6 + 1.2 * gather), 0.035, '#ffffff', gather, 'light', 0, turned * 0.4)
  );
  const out = wide * (2.2 - 1.75 * gather * gather);
  hues.forEach((hue, index) => {
    const at = (back: number): Point => {
      const turn = turned - back + (index / hues.length) * Math.PI * 2;
      return onLine(line, 0, Math.cos(turn) * out, Math.sin(turn) * out);
    };
    const shown = Math.min(1, gather * 5);
    drawn.ribbons.push({
      points: [at(1.1), at(0.8), at(0.5), at(0.25), at(0)],
      widths: [0, cell * 0.08, cell * 0.16, cell * 0.22, cell * 0.26],
      color: hue,
      core: mixColor(hue, '#ffffff', 0.6),
      alpha: shown,
      blend: 'color',
    });
    layHueOrb(drawn, at(0), cell * (0.24 + 0.12 * gather), hue, shown, cell * 0.5);
  });
}

/** Rays of every hue thrown off the piece the beam strikes, turning slowly and flickering. */
function layFlower(
  drawn: Staged,
  at: Point,
  cell: number,
  hues: readonly string[],
  seconds: number,
  power: number
): void {
  const forward = cell * 0.6;
  hues.forEach((hue, index) => {
    for (const twin of [0, 1]) {
      const spin = seconds * 0.9 + ((index * 2 + twin) * Math.PI) / (hues.length * 2);
      const flicker = 0.7 + 0.3 * Math.sin(seconds * 31 + index * 2.1 + twin);
      drawn.motes.push({
        ...glow(at, cell * 0.55, hue, power * flicker, forward),
        shape: 'flare',
        trail: twin === 0 ? 7 : 4.5,
        spin,
      });
    }
  });
  drawn.motes.push({ ...glow(at, cell * 0.9, '#ffffff', power, forward + 1), shape: 'star', spin: seconds * 2 });
}

/** The beam of many hues as a colossal beam is drawn. */
export const PRISM_BEAM: ColossalLook = {
  wide: 1,
  colorsOf: (ramp) => [...prismHuesOf(ramp[1]), '#ffffff'],
  orbOf: () => rampOf('#ffffff', '#b9b4ff', 7),
  lightOf: () => '#fff6e8',
  floorOf: (ramp, share) => prismHuesOf(ramp[1])[Math.floor(share * 7.3) % STRANDS],
  layBody: (drawn, pose, ramp, glare) => {
    const hues = prismHuesOf(ramp[1]).map((hue) => mixColor(hue, '#ffffff', glare * 0.5));
    const strands = strandsOf(pose, hues, 40);
    layBeamBody(drawn, pose, [
      { wide: 1.9, color: ramp[5], alpha: 0.16 + 0.3 * glare, blend: 'light', soft: 1, flows: 0.5 },
      { wide: 1.42 + 0.3 * glare, color: SHADOW, alpha: 0.86, blend: 'color', torn: 0.3, flows: 0.7 },
    ]);
    drawn.ribbons.push(...strands.halos, ...strands.far);
    layBeamBody(drawn, pose, [
      { wide: 0.78 + 0.4 * glare, color: ramp[4], alpha: 1, blend: 'color', torn: 0.4, flows: 1.3 },
      { wide: 0.52 + 0.4 * glare, color: '#ffffff', alpha: 1, blend: 'color', torn: 0.4, flows: 1.9 },
    ]);
    layBeamStreaks(drawn, pose, 10, [hues[0], hues[2]], 0.3);
    drawn.ribbons.push(...strands.near);
    layBeamShreds(drawn, pose, pose.wide, hues, 26);
  },
  layGathering: (drawn, stage, line, floor, ramp, gather) => {
    layWheel(drawn, line, floor, stage.cell, stage.cell, prismHuesOf(ramp[1]), stage.seconds, gather);
  },
  layPouring: (drawn, stage, pose, ramp, since) => {
    const hues = prismHuesOf(ramp[1]);
    const floor = { x: pose.line.from.x, y: pose.line.from.y, z: stage.groundZ };
    hues.forEach((hue, index) =>
      layShockRing(
        drawn,
        floor,
        stage.cell * 0.5,
        stage.cell * (4 + index * 0.5),
        stage.cell * 0.3,
        hue,
        since - index * 0.06,
        0.5
      )
    );
    const strikes = Math.hypot(stage.x - pose.line.from.x, stage.y - pose.line.from.y);
    layFlower(drawn, onLine(pose.line, strikes), stage.cell, hues, stage.seconds, pose.power * (1 - pose.failing));
  },
};
