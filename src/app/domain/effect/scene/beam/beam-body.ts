import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectBlend, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, hueOf, type Point, wayBetween } from '@axe/domain/effect/scene/parts';

/*
 * The body of a beam: one unbroken stream from its muzzle to where it ends, laid in sheets one over
 * another, the widest and darkest first. A dark rim keeps it on a bright floor where light alone
 * would wash out; a sheath of its colour is its body; within that it pales, and its heart is white.
 * Every sheet has its edges torn by a pattern that runs down it faster than the one under it, so the
 * body pours rather than standing as a plate. It leaves its muzzle by a narrow neck, swells, runs on
 * with swells travelling down it, and narrows and fades where it ends, into the licks it breaks up
 * in; licks stream off its edges all the way down it, so that it pours rather than standing as a
 * plate. As it fails it thins from the muzzle first. Streaks of white race down its heart, and rings shed at the muzzle
 * ride down it, each drawn by halves so that it passes behind the body and before it.
 */

/** The dark laid under a beam, so that it reads on a bright floor. */
const BEAM_SHADOW = '#070a22';
/** How wide a beam still is where it ends, as a share of its width, and the share of its tail it fades out over: it ends in licks, not in a point. */
const END_WIDE = 0.5;
const FADES_OVER = 0.75;
/** How fast the pattern of a beam runs down it, in widths of the beam a second. */
const FLOWS = 9;

/** The line a beam runs along: its ends, the way it runs, two ways across it, and how long it is. */
export interface BeamLine {
  readonly from: Point;
  readonly to: Point;
  readonly way: Point;
  /** Across it, level. */
  readonly side: Point;
  /** Across it, up as near as may be. */
  readonly lift: Point;
  readonly length: number;
}

/** The line from one point to another. */
export function beamLineOf(from: Point, to: Point): BeamLine {
  const { way, length } = wayBetween(from, to);
  return { from, to, way, ...acrossOf(way), length };
}

/** A point of a line, as far along it and as far aside and up from it as given, in table pixels. */
export function onLine(line: BeamLine, along: number, aside = 0, up = 0): Point {
  return {
    x: line.from.x + line.way.x * along + line.side.x * aside + line.lift.x * up,
    y: line.from.y + line.way.y * along + line.side.y * aside + line.lift.y * up,
    z: line.from.z + line.way.z * along + line.side.z * aside + line.lift.z * up,
  };
}

/** A beam as it is at a moment. */
export interface BeamPose {
  readonly line: BeamLine;
  /** How wide the sheath of its body is, in table pixels. */
  readonly wide: number;
  /** How wide it is without its flicker, in table pixels, where that is known. */
  readonly steady?: number;
  readonly seconds: number;
  readonly seed: number;
  /** How much of it is there, from nothing to 1. */
  readonly power: number;
  /** How far its head has got along its line, from 0 to 1. */
  readonly reached: number;
  /** How far it has failed, from 0 to 1: it thins from its muzzle first. */
  readonly failing: number;
  /** Over how much of its far end it is drawn out to a point, in table pixels. */
  readonly tail: number;
  /** How wide its neck is where it leaves the muzzle, as a share of its width. */
  readonly neck?: number;
  /** How high the floor under it is, which nothing wound about it is drawn below, and how much of its detail it keeps, from 1 down, where several are fired at once. */
  readonly floorZ?: number;
  readonly detail?: number;
}

/** One sheet of a beam's body. */
export interface BeamSheet {
  /** How wide it is, as a share of the beam's width. */
  readonly wide: number;
  readonly color: string;
  readonly core?: string;
  readonly alpha: number;
  readonly blend: EffectBlend;
  /** How deep the pattern eats into its edges, how soft they are, and how fast the pattern runs against the beam's own pace. */
  readonly torn?: number;
  readonly soft?: number;
  readonly flows?: number;
}

function smooth(share: number): number {
  const held = Math.min(1, Math.max(0, share));
  return held * held * (3 - 2 * held);
}

/** How wide a beam is at a distance along it, as a share of its width: see the header. */
export function beamSwellAt(pose: BeamPose, along: number): number {
  const { wide, seconds, seed } = pose;
  const long = pose.line.length;
  const head = long * pose.reached;
  const neck = pose.neck ?? 0.62;
  const root = neck + (1 - neck) * smooth(along / (wide * 0.45));
  const bulge = (along - wide * 0.75) / (wide * 0.6);
  const flare = 1 + 0.26 * Math.exp(-bulge * bulge);
  const pulse =
    1 +
    0.06 * Math.sin(Math.PI * 2 * (along / (wide * 2.6) - seconds * 2.8)) +
    0.035 * Math.sin(Math.PI * 2 * (along / (wide * 1.1) - seconds * 5.1) + seed);
  const tail = Math.max(1, Math.min(pose.tail, head));
  const end = END_WIDE + (1 - END_WIDE) * Math.pow(1 - smooth((along - (head - tail)) / tail), 0.55);
  const failed = Math.min(1, Math.max(0, 1 - pose.failing * (1.7 - (0.7 * along) / Math.max(1, long))));
  return root * flare * pulse * end * failed;
}

/** How much of a beam is there at a distance along it, from 1 down to nothing where it ends: it fades out over the last of its tail. */
export function beamFadeAt(pose: BeamPose, along: number): number {
  const head = pose.line.length * pose.reached;
  const tail = Math.max(1, Math.min(pose.tail, head) * FADES_OVER);
  return 1 - smooth((along - (head - tail)) / tail);
}

/** The points a beam's sheets are laid through, from its muzzle to where its head has got, how wide it is at each, and how much of it is there. */
export function beamSpineOf(
  pose: BeamPose,
  count: number
): { readonly points: Point[]; readonly swell: number[]; readonly fade: number[] } {
  const head = pose.line.length * pose.reached;
  const points: Point[] = [];
  const swell: number[] = [];
  const fade: number[] = [];
  for (let index = 0; index <= count; index++) {
    const along = (head * index) / count;
    points.push(onLine(pose.line, along));
    swell.push(beamSwellAt(pose, along));
    fade.push(beamFadeAt(pose, along));
  }
  return { points, swell, fade };
}

/** Lays the sheets of a beam's body, what is under first. */
export function layBeamBody(drawn: Staged, pose: BeamPose, sheets: readonly BeamSheet[], count = 36): void {
  if (pose.power <= 0 || pose.reached <= 0) return;
  const { points, swell, fade } = beamSpineOf(pose, count);
  sheets.forEach((sheet, index) => {
    const frays = (sheet.torn ?? 0) > 0 || (sheet.soft ?? 0) > 0;
    drawn.ribbons.push({
      points,
      widths: swell.map((share) => pose.wide * sheet.wide * share),
      color: sheet.color,
      core: sheet.core,
      alpha: sheet.alpha * pose.power,
      alphas: fade,
      blend: sheet.blend,
      thins: true,
      torn: sheet.torn,
      soft: sheet.soft,
      flowed: frays ? (pose.seconds * FLOWS * (sheet.flows ?? 1)) / sheet.wide + index * 3.7 + (pose.seed % 11) : 0,
    });
  });
}

/**
 * The sheets of a great beam's body: a halo of light about it, its dark rim, the sheath of its
 * colour, the pale within it and its white heart. `glare` is how much of the white of its release is
 * still on it, from 1 as it fires to nothing once it has settled into its colour.
 */
export function greatBeamSheets(ramp: readonly string[], glare: number): BeamSheet[] {
  const hue = hueOf(ramp);
  const dark = mixColor(ramp[0], BEAM_SHADOW, 0.6);
  const whiter = (color: string, share: number) => mixColor(color, '#ffffff', glare * share);
  return [
    { wide: 2.4, color: hue, alpha: 0.3 + 0.3 * glare, blend: 'light', soft: 1, flows: 0.5 },
    { wide: 1.52 + 0.3 * glare, color: dark, alpha: 0.9, blend: 'color', torn: 0.2, flows: 0.6 },
    { wide: 1.22 + 0.3 * glare, color: whiter(ramp[1], 0.4), alpha: 1, blend: 'color', torn: 0.3, flows: 0.8 },
    { wide: 1 + 0.3 * glare, color: whiter(hue, 0.6), alpha: 1, blend: 'color', torn: 0.4 },
    { wide: 0.74 + 0.35 * glare, color: whiter(ramp[3], 0.8), alpha: 1, blend: 'color', torn: 0.5, flows: 1.3 },
    { wide: 0.5 + 0.4 * glare, color: whiter(ramp[5], 1), alpha: 1, blend: 'color', torn: 0.5, flows: 1.6 },
    { wide: 0.26 + 0.45 * glare, color: '#ffffff', alpha: 1, blend: 'color', torn: 0.35, flows: 2 },
  ];
}

/**
 * Streaks racing down a beam: thin bands, each on its own line off the middle, run from the muzzle
 * to the end over and over, faster than the body pours; those down its heart are of the first of the
 * colours given, and those out in its sheath of the second.
 */
export function layBeamStreaks(
  drawn: Staged,
  pose: BeamPose,
  count: number,
  colors: readonly string[],
  reach = 0.5
): void {
  if (pose.power <= 0 || pose.reached <= 0) return;
  const next = seededRun(pose.seed * 61 + 5);
  const head = pose.line.length * pose.reached;
  for (let index = 0; index < count; index++) {
    const aside = (next() - 0.5) * 2 * reach;
    const pace = 1.6 + next() * 1.4;
    const long = pose.wide * (1.4 + next() * 2.2);
    const run = (pose.seconds * pace + next()) % 1;
    const heavy = next();
    const at = run * (head + long) - long;
    const from = Math.max(0, at);
    const to = Math.min(head, at + long);
    if (to - from < pose.wide * 0.2) continue;
    const middle = (from + to) / 2;
    const swell = beamSwellAt(pose, middle);
    const off = pose.wide * aside * swell;
    const thick = pose.wide * (0.035 + 0.045 * heavy) * swell;
    drawn.ribbons.push({
      points: [
        onLine(pose.line, from, off, off * 0.2),
        onLine(pose.line, middle, off, off * 0.2),
        onLine(pose.line, to, off, off * 0.2),
      ],
      widths: [0, thick, thick * 0.6],
      color: Math.abs(aside) < reach * 0.45 ? colors[0] : colors[1 % colors.length],
      alpha: 0.9 * pose.power,
      blend: 'color',
    });
  }
}

/** A ring about a line, as it is at a moment: how far along the line, how wide across, how heavy its band is, and how much of it is there. */
export interface BeamRing {
  readonly along: number;
  readonly radius: number;
  readonly thick: number;
  readonly color: string;
  readonly alpha: number;
}

/** How many points a ball laid as a band, and a ring about a beam, are drawn through. */
const BALL_POINTS = 12;
const RING_POINTS = 20;

/**
 * A ring standing about a line, across it, as two bands: the half of it behind the line and the half
 * before it, to be laid either side of the body it rings. None of it is drawn below `floorZ`.
 */
export function beamRingOf(
  line: BeamLine,
  ring: BeamRing,
  floorZ: number
): { readonly far: EffectRibbon; readonly near: EffectRibbon } {
  const centre = onLine(line, ring.along);
  const points: Point[] = [];
  for (let index = 0; index <= RING_POINTS; index++) {
    const turn = (index / RING_POINTS) * Math.PI * 2;
    const point = onLine(line, ring.along, Math.cos(turn) * ring.radius, Math.sin(turn) * ring.radius);
    points.push({ ...point, z: Math.max(floorZ, point.z) });
  }
  const band = (half: 'near' | 'far'): EffectRibbon => ({
    points,
    widths: ring.thick,
    color: ring.color,
    alpha: Math.max(0, ring.alpha),
    blend: 'color',
    about: points.map(() => centre),
    half,
  });
  return { far: band('far'), near: band('near') };
}

/**
 * A ball as bands: a disc turned to the eye about a short line run the way given, `radius` across,
 * for a ball that is to lie over the bands of a beam, which every particle lies under. Its edge may
 * be torn by the pattern the bands share, run round it as far as `flowed` says.
 */
export function ballBand(
  at: Point,
  way: Point,
  radius: number,
  color: string,
  alpha: number,
  fray: { readonly core?: string; readonly torn?: number; readonly flowed?: number; readonly blend?: EffectBlend } = {}
): EffectRibbon {
  const points: Point[] = [];
  const widths: number[] = [];
  for (let index = 0; index <= BALL_POINTS; index++) {
    const across = (index / BALL_POINTS) * 2 - 1;
    points.push({
      x: at.x + way.x * across * radius,
      y: at.y + way.y * across * radius,
      z: at.z + way.z * across * radius,
    });
    widths.push(2 * radius * Math.sqrt(Math.max(0, 1 - across * across)));
  }
  return {
    points,
    widths,
    color,
    core: fray.core,
    alpha: Math.max(0, alpha),
    blend: fray.blend ?? 'color',
    thins: true,
    torn: fray.torn,
    flowed: fray.flowed,
  };
}

/** The colours the licks of a beam are of: the dark under them, their body, and the pale of their middle. */
export interface LickTones {
  readonly dark: string;
  readonly body: readonly string[];
  readonly core: string;
}

/**
 * The licks of a beam: tongues streaming off its edges down the whole of it, each rooted within the
 * body and leaning out of it the way it runs, carried along it over and over; and a sheaf of longer
 * ones where it ends, which it breaks up in. Each is laid dark first, so that it reads on a bright
 * floor. They lie under the bands of the body, and are seen where they reach out past them.
 */
export function layBeamLicks(drawn: Staged, pose: BeamPose, tones: LickTones, count: number): void {
  if (pose.power <= 0 || pose.reached <= 0) return;
  const { line, wide, seconds } = pose;
  const head = line.length * pose.reached;
  const next = seededRun(pose.seed * 97 + 31);
  const lick = (
    root: Point,
    heading: Point,
    across: number,
    long: number,
    color: string,
    flowed: number,
    variant: number
  ) => {
    const paint = { alpha: pose.power, forward: wide * 0.2, variant };
    const deep = { exactDepth: true };
    drawn.motes.push(
      {
        ...flowingMote('lick', root, heading, across * 1.3, long * 1.12, flowed, { ...paint, color: tones.dark }),
        ...deep,
      },
      { ...flowingMote('lick', root, heading, across, long, flowed, { ...paint, color, core: tones.core }), ...deep }
    );
  };
  for (let index = 0; index < count; index++) {
    const turn = next() * Math.PI * 2;
    const pace = 0.55 + next() * 0.5;
    const phase = next();
    const long = wide * (1.5 + next() * 1.3);
    const leans = 0.16 + next() * 0.16;
    const run = (seconds * pace + phase) % 1;
    const along = run * Math.max(1, head - long * 0.5);
    const swell = beamSwellAt(pose, along) * beamFadeAt(pose, along);
    if (swell < 0.2) continue;
    const out = { aside: Math.cos(turn), up: Math.abs(Math.sin(turn)) * 0.8 };
    const root = onLine(line, along, out.aside * wide * 0.36 * swell, out.up * wide * 0.36 * swell);
    const heading = {
      x: line.way.x + (line.side.x * out.aside + line.lift.x * out.up) * leans,
      y: line.way.y + (line.side.y * out.aside + line.lift.y * out.up) * leans,
      z: line.way.z + (line.side.z * out.aside + line.lift.z * out.up) * leans,
    };
    lick(
      root,
      heading,
      wide * 0.5 * swell,
      long * swell,
      tones.body[index % tones.body.length],
      seconds * 5 + index * 2.3,
      index * 1.7
    );
  }
  const ends = beamSwellAt(pose, head - Math.min(pose.tail, head) * 0.5);
  if (ends < 0.15) return;
  for (let index = 0; index < 5; index++) {
    const aside = (index - 2) * 0.22;
    const root = onLine(line, head - wide * (1.5 + 0.2 * Math.abs(index - 2)), aside * wide * ends, 0);
    const heading = {
      x: line.way.x + line.side.x * aside * 0.45,
      y: line.way.y + line.side.y * aside * 0.45,
      z: line.way.z + line.side.z * aside * 0.45,
    };
    const long = wide * (2.6 - 0.45 * Math.abs(index - 2)) * (0.9 + 0.1 * Math.sin(seconds * 17 + index * 2));
    lick(
      root,
      heading,
      wide * (0.8 - 0.1 * Math.abs(index - 2)) * ends,
      long,
      tones.body[index % tones.body.length],
      seconds * 6 + index * 3.1,
      index * 2.9 + 1
    );
  }
}
