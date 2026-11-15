import { clamp } from '@axe/core/util/clamp';
import { outCubic, type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The parts the looks of earth are built of, but for the rocks they throw and the dust they raise,
 * which are beside this: crags of rock standing out of the ground, and slabs of the floor levered up;
 * fissures run across the floor, glowing while they are hot; crescents of force racing out over it;
 * and the dent a blow leaves. Rock is colour, in browns, greys and ochres, and only what glows in a
 * crack is light.
 *
 * Every length is in cells and every speed in cells a second.
 */

const ROCK_PALE = '#a18c6c';
const ROCK = '#7b6652';
const ROCK_DEEP = '#544336';
const EARTH = '#3d2e22';
const SOIL_DUST = '#8f7a61';
const SAND = '#bda47c';
const MOLTEN = '#ff6a1e';
const WHITE_HOT = '#ffd9a2';

/** The colours a look of earth is drawn in, its preset's own colours taken into each a little. */
export interface EarthTones {
  /** Rock, from its palest to its deepest. */
  readonly rock: readonly [string, string, string];
  /** Broken ground and the dark of a crack. */
  readonly earth: string;
  readonly dust: string;
  readonly sand: string;
  /** What glows in a crack, and the hottest of it. */
  readonly glow: string;
  readonly hot: string;
}

/** The colours of earth for a preset's ramp. */
export function earthTonesOf(ramp: readonly string[]): EarthTones {
  return {
    rock: [mixColor(ROCK_PALE, ramp[2], 0.2), mixColor(ROCK, ramp[1], 0.22), mixColor(ROCK_DEEP, ramp[1], 0.2)],
    earth: mixColor(EARTH, ramp[0], 0.3),
    dust: mixColor(SOIL_DUST, ramp[2], 0.25),
    sand: mixColor(SAND, ramp[3], 0.3),
    glow: mixColor(MOLTEN, ramp[2], 0.25),
    hot: mixColor(WHITE_HOT, ramp[4], 0.3),
  };
}

/** How fast a crag is told to fly, in table pixels a second, for it to be drawn out along its way: it goes nowhere. */
const CRAG_PACE = 100;

/**
 * A crag of rock standing out of a root along a way of length one, as tall and as wide as given, in
 * table pixels; `broken` of its length gone from its top, and veins of `glow` climbed `veins` of the
 * way up it. It is held to its own depth, so a piece standing before it hides it.
 */
export function crag(
  root: Point,
  way: Point,
  tall: number,
  wide: number,
  color: string,
  alpha: number,
  look: { readonly variant: number; readonly broken?: number; readonly veins?: number; readonly glow?: string }
): EffectMote {
  const reach = Math.max(tall, wide * 1.01);
  return {
    x: root.x + way.x * reach,
    y: root.y + way.y * reach,
    z: root.z + way.z * reach,
    size: wide,
    color,
    core: look.glow,
    alpha: clamp(alpha, 0, 1),
    blend: 'color',
    shape: 'crag',
    velocity: { x: way.x * CRAG_PACE, y: way.y * CRAG_PACE, z: way.z * CRAG_PACE },
    trail: (reach - wide) / CRAG_PACE,
    spin: Math.round(clamp(look.broken ?? 0, 0, 0.99) * 100) + clamp(look.veins ?? 0, 0, 0.995),
    variant: look.variant,
    forward: 2,
    exactDepth: true,
  };
}
/** A slab of the floor levered up by what bursts under it. */
export interface Slab {
  /** Where its outer edge stays on the floor, in table pixels, and the way out from the burst, of length one. */
  readonly hinge: Point;
  readonly out: { readonly x: number; readonly y: number };
  /** How long and how wide it is, in cells. */
  readonly long: number;
  readonly wide: number;
  /** When it is levered up, in seconds, how steeply it stands at its steepest, and how steeply it is left, in radians. */
  readonly liftsAt: number;
  readonly peak: number;
  readonly rests: number;
  readonly tone: number;
  readonly variant: number;
}

/** The share of a crag's length broken off to leave a slab of it. */
const SLAB_BROKEN = 0.72;
/** How long a slab takes to be levered up, and to fall back to where it is left, in seconds. */
const SLAB_LIFTS_S = 0.12;
const SLAB_SETTLES_S = 0.34;

/** Slabs of the floor about a foot, between two distances from it, each levered up as what bursts reaches it at a speed. */
export function throwSlabs(
  th: Thrower,
  foot: Point,
  count: number,
  ring: readonly [number, number],
  burstsAt: number,
  speed: number,
  fan?: { readonly toward: number; readonly spread: number }
): Slab[] {
  const U = th.cell;
  return Array.from({ length: count }, (_unused, index) => {
    const turn = fan
      ? fan.toward + ((index + th.range(0.1, 0.9)) / count - 0.5) * 2 * fan.spread
      : ((index + th.range(0.1, 0.9)) / count) * Math.PI * 2;
    const far = th.range(ring[0], ring[1]);
    const out = { x: Math.cos(turn), y: Math.sin(turn) };
    return {
      hinge: { x: foot.x + out.x * far * U, y: foot.y + out.y * far * U, z: foot.z },
      out,
      long: th.range(0.3, 0.52),
      wide: th.range(0.3, 0.5),
      liftsAt: burstsAt + far / speed,
      peak: th.range(0.95, 1.35),
      rests: th.range(0.3, 0.75),
      tone: Math.floor(th.range(0, 2.99)),
      variant: th.range(0, 6),
    };
  });
}

/** A slab at a moment: levered up fast about its outer edge, fallen back to lie tilted over the hole it left. */
export function drawSlab(drawn: Staged, slab: Slab, t: number, cell: number, tones: EarthTones, alpha: number): void {
  const since = t - slab.liftsAt;
  if (since < 0) return;
  const falling = clamp((since - SLAB_LIFTS_S) / SLAB_SETTLES_S, 0, 1);
  const tilt =
    since < SLAB_LIFTS_S
      ? slab.peak * outCubic(since / SLAB_LIFTS_S)
      : slab.rests + (slab.peak - slab.rests) * (1 - falling) * (1 - falling);
  const way = { x: -slab.out.x * Math.cos(tilt), y: -slab.out.y * Math.cos(tilt), z: Math.sin(tilt) };
  const long = cell * slab.long;
  const hole = {
    x: slab.hinge.x - slab.out.x * long * 0.5,
    y: slab.hinge.y - slab.out.y * long * 0.5,
    z: slab.hinge.z,
  };
  drawn.floor.push(floorMark('scorch', hole, long * 0.85, 1, tones.earth, 0.7 * alpha, 'color', slab.variant));
  drawn.motes.push(
    crag(slab.hinge, way, long / (1 - SLAB_BROKEN), cell * slab.wide, tones.rock[slab.tone] ?? tones.rock[1], alpha, {
      variant: slab.variant,
      broken: SLAB_BROKEN,
    })
  );
}

/**
 * A fissure run across the floor from one point to another, as wide as given, in table pixels: dark,
 * and glowing along its middle while it is hot, from 1 white-hot through its glow to 0 gone cold.
 */
export function layFissure(
  drawn: Staged,
  from: Point,
  to: Point,
  wide: number,
  tones: EarthTones,
  heat: number,
  alpha: number,
  seed: number
): void {
  const reach = Math.hypot(to.x - from.x, to.y - from.y) / 2;
  if (reach < 1 || alpha <= 0) return;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 };
  const turn = Math.atan2(from.y - to.y, to.x - from.x);
  const look = (Math.abs(seed) % 97) / 9.7;
  drawn.floor.push(floorMark('fissure', middle, reach, wide / reach, tones.earth, 0.9 * alpha, 'color', look, turn));
  if (heat <= 0.02) return;
  const color = heat > 0.75 ? tones.hot : heat > 0.35 ? tones.glow : mixColor(tones.glow, '#7a1c0c', 0.6);
  drawn.floor.push(
    floorMark(
      'fissure',
      middle,
      reach,
      (wide * 0.55) / reach,
      color,
      alpha * Math.min(1, heat * 1.6),
      'light',
      look,
      turn
    )
  );
}

/**
 * A crescent of force on the floor about a foot, as far out as `radius` and bowed about the way it
 * races: a torn band of dust, and a pale hard edge leading it.
 */
export function layCrescent(
  drawn: Staged,
  foot: Point,
  toward: number,
  spread: number,
  radius: number,
  thick: number,
  tones: EarthTones,
  alpha: number,
  flowed: number
): void {
  if (alpha <= 0 || radius <= 0) return;
  const steps = 14;
  const arc = (far: number): Point[] =>
    Array.from({ length: steps + 1 }, (_unused, index) => {
      const turn = toward + ((index / steps) * 2 - 1) * spread;
      return { x: foot.x + Math.cos(turn) * far, y: foot.y + Math.sin(turn) * far, z: foot.z + 3 };
    });
  const bowed = Array.from({ length: steps + 1 }, (_unused, index) =>
    Math.pow(Math.sin((Math.PI * index) / steps), 0.6)
  );
  drawn.ribbons.push({
    points: arc(Math.max(1, radius - thick * 0.45)),
    widths: bowed.map((share) => thick * share),
    color: tones.dust,
    core: tones.sand,
    alpha: 0.85 * alpha,
    blend: 'color',
    torn: 0.7,
    soft: 0.3,
    flowed,
  });
  drawn.ribbons.push({
    points: arc(radius),
    widths: bowed.map((share) => thick * 0.3 * share),
    color: tones.sand,
    core: '#fff6e4',
    alpha,
    blend: 'color',
  });
  drawn.ribbons.push({
    points: arc(radius),
    widths: bowed.map((share) => thick * 0.55 * share),
    color: tones.hot,
    alpha: 0.5 * alpha,
    blend: 'light',
  });
}

/** The dent a blow leaves in the floor: broken ground, darker in its middle, with a pale rim raised round it. */
export function layDent(
  drawn: Staged,
  foot: Point,
  reach: number,
  tones: EarthTones,
  alpha: number,
  seed: number
): void {
  if (alpha <= 0) return;
  const look = Math.abs(seed) % 13;
  drawn.floor.push(floorMark('ring', foot, reach * 0.98, 0.3, tones.sand, 0.55 * alpha, 'color', 0));
  drawn.floor.push(floorMark('scorch', foot, reach, 1, tones.earth, 0.8 * alpha, 'color', look));
  drawn.floor.push(
    floorMark('scorch', foot, reach * 0.6, 1, mixColor(tones.earth, '#000000', 0.45), 0.6 * alpha, 'color', look + 3)
  );
  drawn.floor.push(
    floorMark('ring', foot, reach * 1.02, 0.07, mixColor(tones.earth, '#000000', 0.3), 0.45 * alpha, 'color', 0)
  );
}
/** How a way over the floor is turned, in radians, from one point to another; null where they are as good as one. */
export function bearingOf(
  from: { x: number; y: number } | null,
  to: { x: number; y: number },
  least: number
): number | null {
  if (!from) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.hypot(dx, dy) < least ? null : Math.atan2(dy, dx);
}
