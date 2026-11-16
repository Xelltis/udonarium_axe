import { hexChannels } from '@axe/core/util/hex-color';
import {
  beamFadeAt,
  type BeamLine,
  type BeamPose,
  beamSwellAt,
  layBeamBody,
  layBeamLicks,
  layBeamStreaks,
  onLine,
} from '@axe/domain/effect/scene/beam/beam-body';
import { type ColossalLook } from '@axe/domain/effect/scene/beam/colossal';
import { layBeamShreds } from '@axe/domain/effect/scene/beam/great-beam';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import { ball, floorMark, glow, lightBall, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The beam of many hues: one thick body in a dark sheath, its colour laid down it in wide bands of
 * five hues, each blending into the next, that pour down it from the muzzle the way it runs, a white
 * heart through the middle of them and tongues of every hue licking off its edges. Its hues are taken
 * round the wheel of colour from the colour it is given, so no one of them washes over the table. It
 * gathers as five orbs of its hues wheeling in on the ball over a seal of light; it is let go in rings
 * of every hue, and throws rays of every hue off the piece it strikes.
 */

/** How many hues it is laid in. */
const HUES = 5;
/** How long a band of one hue is down the beam, in widths of it, and how far into the next it blends, as a share of that. */
const BAND_LONG = 2;
const BAND_BLENDS = 0.3;
/** How fast its bands pour down it, in widths of the beam a second. */
const BAND_FLOWS = 6.5;
/** How wide its bands are, and the pale within them, as shares of the beam's width. */
const BAND_WIDE = 1.2;
const PALE_WIDE = 0.72;
/** The dark laid under the beam. */
const SHADOW = '#0b0718';
/** How many tongues lick off its edges where it keeps all its detail. */
const LICKS = 20;

/**
 * The hues of the beam: as many colours round the wheel of colour, evenly apart, as it is laid in,
 * the first of them of the hue of the colour given, all of them as vivid as a colour can be.
 */
export function prismHuesOf(color: string): string[] {
  const [r, g, b] = (hexChannels(color) ?? [255, 79, 216]).map((channel) => channel / 255);
  const high = Math.max(r, g, b);
  const span = high - Math.min(r, g, b);
  const first =
    span < 0.01 ? 0 : high === r ? ((g - b) / span + 6) % 6 : high === g ? (b - r) / span + 2 : (r - g) / span + 4;
  return Array.from({ length: HUES }, (_unused, index) => vivid((first + (index * 6) / HUES) % 6));
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

/**
 * The bands of hue down a beam, the nearest the muzzle first, each as a band through the stretch of the
 * beam it covers: it blends in over the one before it, and runs whole to its end, under the next. They
 * pour down the beam the way it runs, each keeping its hue as it goes.
 */
function bandsOf(pose: BeamPose, hues: readonly string[], wide: number, pale: number): EffectRibbon[] {
  const head = pose.line.length * pose.reached;
  const steady = pose.steady ?? pose.wide;
  const long = steady * BAND_LONG;
  const flowed = pose.seconds * BAND_FLOWS * steady + (pose.seed % 7) * long;
  const passed = Math.floor(flowed / long);
  const shift = flowed - passed * long;
  const bands: EffectRibbon[] = [];
  for (let band = -1; band * long + shift < head; band++) {
    const from = band * long + shift;
    const blended = from + long * BAND_BLENDS;
    const to = Math.min(head, from + long * (1 + BAND_BLENDS));
    const hue = hues[(((band - passed) % hues.length) + hues.length) % hues.length];
    const alongs = [from, (from + blended) / 2, blended, (blended + to) / 2, to]
      .map((along) => Math.max(0, Math.min(head, along)))
      .filter((along, index, all) => index === 0 || along > all[index - 1] + 0.5);
    if (alongs.length < 2) continue;
    bands.push({
      points: alongs.map((along) => onLine(pose.line, along)),
      widths: alongs.map((along) => pose.wide * wide * beamSwellAt(pose, along)),
      color: pale > 0 ? mixColor(hue, '#ffffff', pale) : hue,
      core: mixColor(hue, '#ffffff', pale + 0.32),
      alpha: pose.power,
      alphas: alongs.map((along) => Math.min(1, (along - from) / (blended - from)) * beamFadeAt(pose, along)),
      blend: 'color',
      thins: true,
    });
  }
  return bands;
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
      const wheeled = onLine(line, 0, Math.cos(turn) * out, Math.sin(turn) * out);
      return { ...wheeled, z: Math.max(wheeled.z, floor.z + 1) };
    };
    const shown = Math.min(1, gather * 5);
    drawn.ribbons.push({
      points: [at(1.1), at(0.8), at(0.5), at(0.25), at(0)],
      widths: [0, cell * 0.04, cell * 0.08, cell * 0.11, cell * 0.13],
      color: hue,
      core: mixColor(hue, '#ffffff', 0.6),
      alpha: shown,
      blend: 'color',
    });
    layHueOrb(drawn, at(0), cell * (0.2 + 0.08 * gather), hue, shown, cell * 0.5);
  });
}

/**
 * Rays of every hue thrown off the piece the beam strikes, turning slowly and flickering, over a white
 * heart, and rings of every hue racing out over the floor under it.
 */
function layFlower(
  drawn: Staged,
  at: Point,
  floorZ: number,
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
        ...glow(at, cell * 0.8, hue, power * flicker, forward),
        shape: 'flare',
        trail: twin === 0 ? 7 : 4.5,
        spin,
      });
    }
  });
  drawn.motes.push({ ...glow(at, cell * 1.2, '#ffffff', power, forward + 1), shape: 'star', spin: seconds * 2 });
  drawn.motes.push(lightBall(at, cell * 0.55 * (0.85 + 0.15 * Math.sin(seconds * 47)), '#ffffff', power, forward + 2));
  const floor = { x: at.x, y: at.y, z: floorZ };
  for (let ring = 0; ring < 3; ring++) {
    const share = (seconds * 2.2 + ring / 3) % 1;
    const hue = hues[(Math.floor(seconds * 2.2 + ring / 3) * 3 + ring) % hues.length];
    const radius = cell * (0.4 + 2 * share);
    drawn.floor.push(
      floorMark('ring', floor, radius, (cell * 0.16 * (1 - share)) / radius, hue, power * (1 - share), 'color', 0)
    );
    drawn.floor.push(
      floorMark('ring', floor, radius, (cell * 0.07 * (1 - share)) / radius, '#ffffff', power * (1 - share), 'light', 0)
    );
  }
}

/** The beam of many hues as a colossal beam is drawn. */
export const PRISM_BEAM: ColossalLook = {
  wide: 1,
  colorsOf: (ramp) => [...prismHuesOf(ramp[1]), '#ffffff'],
  orbOf: () => rampOf('#ffffff', '#b9b4ff', 7),
  lightOf: () => '#fff6e8',
  floorOf: (ramp, share) => prismHuesOf(ramp[1])[Math.floor(share * 7.3) % HUES],
  layBody: (drawn, pose, ramp, glare) => {
    const hues = prismHuesOf(ramp[1]).map((hue) => mixColor(hue, '#ffffff', glare * 0.5));
    const detail = pose.detail ?? 1;
    layBeamBody(drawn, pose, [
      { wide: 2, color: ramp[5], alpha: 0.14 + 0.3 * glare, blend: 'light', soft: 1, flows: 0.5 },
    ]);
    layBeamLicks(drawn, pose, { dark: SHADOW, body: hues, core: '#ffffff' }, Math.max(8, Math.round(LICKS * detail)));
    layBeamBody(drawn, pose, [
      { wide: 1.5 + 0.3 * glare, color: SHADOW, alpha: 0.92, blend: 'color', torn: 0.3, flows: 0.7 },
    ]);
    drawn.ribbons.push(...bandsOf(pose, hues, BAND_WIDE + 0.25 * glare, 0));
    drawn.ribbons.push(...bandsOf(pose, hues, PALE_WIDE + 0.3 * glare, 0.28));
    layBeamBody(drawn, pose, [
      { wide: 0.3 + 0.45 * glare, color: '#ffffff', alpha: 1, blend: 'color', torn: 0.35, flows: 1.9 },
    ]);
    layBeamStreaks(drawn, pose, 12, ['#ffffff', hues[2]], 0.45);
    layBeamShreds(drawn, pose, pose.wide, hues, Math.round(26 * detail));
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
    layFlower(
      drawn,
      onLine(pose.line, strikes),
      stage.groundZ,
      stage.cell,
      hues,
      stage.seconds,
      pose.power * (1 - pose.failing)
    );
  },
};
