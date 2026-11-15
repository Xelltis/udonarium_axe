import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectBlend, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The parts the looks of space and time are drawn with. Space has no colour of its own: what shows it
 * is light bent, gathered and torn, so every line of light here is laid over a sheath of the effect's
 * deep colour, which keeps it on a bright table; what turns about a piece or a point is drawn by halves,
 * its far half behind what it turns about and its near half before it; and what is drawn across the
 * eye, as a seam or an arc of bent light, is laid out on the screen itself, the same from every side.
 */

/** The colours of space: its black, its deep shadow, the edge of what it bends, the glow of that edge, and its pale light. */
export interface SpaceTones {
  readonly ink: string;
  readonly deep: string;
  readonly edge: string;
  readonly glow: string;
  readonly pale: string;
}

/**
 * The colours of space, from an effect's ramp: those between its two colours kept as they are, or, given
 * a share for `vivid`, taken to at least that much colour, as a ramp from a deep colour and a pale one
 * runs through greys.
 */
export function spaceTonesOf(ramp: readonly string[], vivid = 0): SpaceTones {
  return {
    ink: mixColor('#000000', ramp[0], 0.35),
    deep: mixColor(ramp[0], ramp[1], 0.4),
    edge: coloured(mixColor(ramp[1], ramp[2], 0.45), vivid),
    glow: coloured(ramp[3], vivid),
    pale: ramp[5],
  };
}

/** A colour taken to at least a share of colour, its hue and lightness kept. */
export function coloured(color: string, least: number): string {
  if (least <= 0) return color;
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(color.slice(at, at + 2), 16) / 255);
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const light = (high + low) / 2;
  const reach = 1 - Math.abs(2 * light - 1);
  if (reach <= 0 || high - low >= least * reach) return color;
  const middle = light;
  const spread = (least * reach) / Math.max(high - low, 1e-6);
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, middle + (value - middle) * spread)) * 255);
  return `#${[r, g, b].map((value) => channel(value).toString(16).padStart(2, '0')).join('')}`;
}

/** A way across the screen, as `aside` takes it: to the right and up as the eye sees them. */
export interface Aside {
  readonly right: number;
  readonly up: number;
}

/** How a line laid across the screen is painted: a sheath of colour about a pale heart, the light glowing round it, and how much of it is seen. */
export interface ScreenLinePaint {
  readonly sheath: string;
  readonly light: string;
  readonly heart?: string;
  readonly alpha: number;
  readonly wide: number;
  readonly forward: number;
}

/**
 * Lays a line across the screen through points set off from a middle, as `aside` sets them, so that a
 * seam or an arc of bent light faces the eye from every side: along each step of it a flare of light
 * glowing wide, and over it a flare of the sheath's colour with a narrower one of its pale heart, since
 * colour is laid over light.
 */
export function layScreenLine(drawn: Staged, middle: Point, steps: readonly Aside[], paint: ScreenLinePaint): void {
  if (paint.alpha <= 0.01 || paint.wide < 0.3) return;
  for (let index = 1; index < steps.length; index++) {
    const from = steps[index - 1];
    const to = steps[index];
    const right = to.right - from.right;
    const up = to.up - from.up;
    const long = Math.hypot(right, up);
    if (long < 0.5) continue;
    const aside = { right: (from.right + to.right) / 2, up: (from.up + to.up) / 2 };
    const spin = Math.atan2(up, right);
    const flare = (size: number, color: string, alpha: number, blend: EffectBlend, nearer: number) =>
      drawn.motes.push({
        ...middle,
        size,
        color,
        alpha,
        blend,
        shape: 'flare',
        trail: Math.max(1, (long * 1.4) / size),
        spin,
        aside,
        forward: paint.forward + nearer,
      });
    flare(paint.wide * 4, paint.light, paint.alpha * 0.8, 'light', 0);
    flare(paint.wide * 2.4, paint.sheath, Math.min(1, paint.alpha * 1.1), 'color', 1);
    flare(paint.wide, paint.heart ?? '#ffffff', paint.alpha, 'color', 2);
  }
}

/** Points round an arc on the screen about a middle, from one turn to another, in radians, as `aside` takes them. */
export function screenArc(radius: number, from: number, to: number, steps: number, squash = 1): Aside[] {
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const turn = from + ((to - from) * index) / steps;
    return { right: Math.cos(turn) * radius, up: Math.sin(turn) * radius * squash };
  });
}

/**
 * Points round a circle about a middle, tipped from level by `tilt` about a level line headed
 * `heading`, from one turn to another, in radians.
 */
export function tippedCircle(
  middle: Point,
  radius: number,
  steps: number,
  tilt: number,
  heading: number,
  from = 0,
  to = Math.PI * 2
): Point[] {
  const cosTilt = Math.cos(tilt);
  const sinTilt = Math.sin(tilt);
  const cosHead = Math.cos(heading);
  const sinHead = Math.sin(heading);
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const turn = from + ((to - from) * index) / steps;
    const along = Math.cos(turn) * radius;
    const across = Math.sin(turn) * radius;
    const level = across * cosTilt;
    return {
      x: middle.x + along * cosHead - level * sinHead,
      y: middle.y + along * sinHead + level * cosHead,
      z: middle.z + across * sinTilt,
    };
  });
}

/** How a band that winds about something is painted: its sheath of colour, its pale heart and the light glowing round it, how wide and how much of each is seen. */
export interface WoundPaint {
  readonly sheath: string;
  readonly light: string;
  readonly heart?: string;
  readonly wide: number;
  readonly alpha: number;
  readonly lit: number;
  /** How much less of it is seen on the near side of what it winds about. */
  readonly nearShare: number;
  readonly alphas?: readonly number[];
}

/**
 * Lays a band wound about a point, or about a point for each of its points, by halves: on each side a
 * band of light glowing wide under a band of the sheath's colour taken to its pale heart in its middle,
 * since colour is laid over light; the far half whole behind what it winds about and the near half
 * before it, as much as `nearShare` leaves of it.
 */
export function layWound(
  drawn: Staged,
  points: readonly Point[],
  about: Point | readonly Point[],
  paint: WoundPaint
): void {
  if (points.length < 2 || (paint.alpha <= 0.01 && paint.lit <= 0.01)) return;
  const hubs = Array.isArray(about) ? [...about] : points.map(() => about as Point);
  for (const [half, share] of [
    ['far', 1],
    ['near', paint.nearShare],
  ] as const) {
    const band: Omit<EffectRibbon, 'color' | 'alpha' | 'blend' | 'widths'> = {
      points: [...points],
      about: hubs,
      half,
      alphas: paint.alphas,
    };
    if (paint.lit > 0.01) {
      drawn.ribbons.push({
        ...band,
        widths: paint.wide * 1.8,
        color: paint.light,
        alpha: Math.min(1, paint.lit) * (0.3 + 0.7 * share) * 0.7,
        blend: 'light',
        soft: 0.8,
      });
    }
    if (paint.alpha > 0.01) {
      drawn.ribbons.push({
        ...band,
        widths: paint.wide,
        color: paint.sheath,
        core: paint.heart ?? '#ffffff',
        alpha: paint.alpha * share,
        blend: 'color',
      });
    }
  }
}

/** Lays a band along the floor, lifted a hair off it: light glowing wide under a band of the sheath's colour about a pale heart. */
export function layFloorLine(
  drawn: Staged,
  points: readonly Point[],
  wide: number,
  sheath: string,
  light: string,
  alpha: number,
  lit: number,
  alphas?: readonly number[]
): void {
  if (points.length < 2) return;
  const lifted = points.map((point) => ({ x: point.x, y: point.y, z: point.z + 1 }));
  if (lit > 0.01) {
    drawn.ribbons.push({
      points: lifted,
      widths: wide * 2,
      color: light,
      alpha: Math.min(1, lit) * 0.8,
      alphas,
      blend: 'light',
      soft: 0.8,
    });
  }
  if (alpha > 0.01) {
    drawn.ribbons.push({ points: lifted, widths: wide, color: sheath, core: '#ffffff', alpha, alphas, blend: 'color' });
  }
}

/**
 * Lays a ring on the floor as a line of light: a halo of light wider than it, a sheath of the deep
 * colour over that, and a pale heart over the sheath, since colour is laid over light. `width` is how
 * wide the sheath is, as a share of the radius, as a ring takes it.
 */
export function layFloorRing(
  drawn: Staged,
  floor: Point,
  radius: number,
  width: number,
  tones: SpaceTones,
  alpha: number,
  heart = tones.pale
): void {
  if (alpha <= 0.01 || radius < 1) return;
  drawn.floor.push(floorMark('ring', floor, radius, Math.min(1, width * 2.4), tones.glow, 0.55 * alpha, 'light', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width, tones.deep, 0.85 * alpha, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius, width * 0.38, heart, alpha, 'color', 0));
}

/** A number from 0 to 1 for a whole number and a salt, the same wherever it is asked. */
export function scatterOf(index: number, salt: number): number {
  const mixed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return mixed - Math.floor(mixed);
}
