import { clamp } from '@axe/core/util/clamp';
import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { type Point } from '@axe/domain/effect/scene/parts';

/*
 * What every wind is drawn of. Wind has no colour of its own, and white alone is lost on a bright
 * table, so each part of it is laid over its own shadow: a band is white in its middle and a deep
 * slate at its edge, a shred of dust is laid dark and then pale, and what winds about a column is
 * drawn by halves, the far half dark and behind the column and the near half bright and before it.
 * What the wind carries is cut out of bands too, so that it can pass before the column and behind it:
 * a leaf is a band drawn to a point at both ends, a twig a thin one and a stone a thick one.
 */

/** The colours a wind is drawn in, from an effect's ramp. */
export interface WindPaint {
  /** The shadow under everything, and the far side of what turns. */
  readonly shadow: string;
  /** The edge of a band, and the shaded side of a column. */
  readonly edge: string;
  /** The body of a column where the light falls on it. */
  readonly pale: string;
  /** Dust torn off the floor, where it is thick and where the light catches it. */
  readonly dustDeep: string;
  readonly dust: string;
}

/** The earth a wind tears off the floor, in its shadow and in the light. */
const DUST_DEEP = '#6f5a43';
const DUST_PALE = '#cdb78f';

/** The colours a wind of a ramp is drawn in. */
export function windPaintOf(ramp: readonly string[]): WindPaint {
  return {
    shadow: mixColor(ramp[0], ramp[1], 0.3),
    edge: mixColor(ramp[1], ramp[2], 0.25),
    pale: mixColor(ramp[4], '#ffffff', 0.35),
    dustDeep: mixColor(DUST_DEEP, ramp[0], 0.12),
    dust: mixColor(DUST_PALE, ramp[3], 0.1),
  };
}

/** Eases from 0 below one bound to 1 above the other. */
export function smooth(from: number, to: number, value: number): number {
  const share = clamp((value - from) / (to - from), 0, 1);
  return share * share * (3 - 2 * share);
}

/** A number from 0 to 1 for a whole number and a salt, the same wherever it is asked: what one of many parts is told apart by. */
export function scatter(index: number, salt: number): number {
  const mixed = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return mixed - Math.floor(mixed);
}

/** A point moved along a way of length one by a distance. */
export function alongWay(from: Point, way: Point, by: number): Point {
  return { x: from.x + way.x * by, y: from.y + way.y * by, z: from.z + way.z * by };
}

/** The kinds of thing a wind carries. */
export type DebrisKind = 'leaf' | 'twig' | 'stone';

/** The kind of the nth thing a wind carries: six in ten are leaves, two twigs and two stones. */
export function debrisKindOf(index: number): DebrisKind {
  const pick = index % 10;
  return pick < 6 ? 'leaf' : pick < 8 ? 'twig' : 'stone';
}

/** The colours of leaves, each its edge and its middle: green, yellowed and brown, so that some show on any ground. */
const LEAF_COLOURS = [
  ['#4f6a1c', '#c4d862'],
  ['#8a6a1e', '#f0c65a'],
  ['#6d4421', '#c98a4c'],
  ['#3e5a22', '#9fc45a'],
] as const;
const TWIG_COLOURS = ['#4a3626', '#8a6a4a'] as const;
const STONE_COLOURS = ['#463e3a', '#958a80'] as const;

/** One thing a wind carries, as it is at a moment. */
export interface DebrisPose {
  readonly kind: DebrisKind;
  readonly at: Point;
  /** How long it is, in table pixels. */
  readonly size: number;
  /** How far it has turned about, and how far it is tipped up from lying flat, in radians. */
  readonly turn: number;
  readonly tip: number;
  readonly alpha: number;
  readonly variant: number;
}

/**
 * The band a thing a wind carries is cut out of: a leaf drawn to a point at both ends, which shows
 * its pale underside as it turns over, a thin twig, or a thick stone.
 */
export function debrisRibbon(pose: DebrisPose): EffectRibbon {
  const { at, size, turn, tip } = pose;
  const way = { x: Math.cos(turn) * Math.cos(tip), y: Math.sin(turn) * Math.cos(tip), z: Math.sin(tip) };
  const half = size * 0.5;
  const ends = [alongWay(at, way, -half), at, alongWay(at, way, half)];
  if (pose.kind === 'twig') {
    return {
      points: ends,
      widths: [size * 0.1, size * 0.16, size * 0.08],
      color: TWIG_COLOURS[0],
      core: TWIG_COLOURS[1],
      alpha: pose.alpha,
      blend: 'color',
    };
  }
  if (pose.kind === 'stone') {
    return {
      points: ends.map((end, index) => alongWay(at, way, (index - 1) * half * 0.7)),
      widths: [size * 0.5, size * 0.85, size * 0.55],
      color: STONE_COLOURS[0],
      core: STONE_COLOURS[1],
      alpha: pose.alpha,
      blend: 'color',
    };
  }
  const [edge, middle] = LEAF_COLOURS[Math.floor(pose.variant) % LEAF_COLOURS.length];
  const turnedOver = Math.sin(turn * 0.5 + pose.variant) > 0.55;
  return {
    points: ends,
    widths: [0, size * 0.52, 0],
    color: turnedOver ? middle : edge,
    core: turnedOver ? '#ffffff' : middle,
    alpha: pose.alpha,
    blend: 'color',
  };
}

/** A band that winds about something, as its two halves: the one behind what it winds about, darkened, and the one before it. */
export interface Halves {
  readonly far: EffectRibbon;
  readonly near: EffectRibbon;
}

/**
 * A band drawn by halves about what it winds about: the half behind it taken towards the shadow and
 * thinner, to be laid before the column is, and the half before it as it is, to be laid after.
 */
export function halvesOf(ribbon: EffectRibbon, about: readonly Point[], shadow: string, dimmed = 0.55): Halves {
  return {
    far: {
      ...ribbon,
      color: mixColor(ribbon.color, shadow, 0.6),
      core: ribbon.core ? mixColor(ribbon.core, shadow, 0.5) : undefined,
      alpha: ribbon.alpha * dimmed,
      about,
      half: 'far',
    },
    near: { ...ribbon, about, half: 'near' },
  };
}

/**
 * A curl of wind: a band wound in from its rim to its middle, lying level, which turns as it fades,
 * white in its middle and shadowed at its edge. What is left turning where a wind has passed.
 */
export function curlRibbon(
  middle: Point,
  radius: number,
  turned: number,
  wide: number,
  alpha: number,
  paint: WindPaint,
  hand: 1 | -1 = 1
): EffectRibbon {
  const steps = 13;
  const points: Point[] = [];
  const widths: number[] = [];
  const alphas: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const turn = turned + hand * share * Math.PI * 2.6;
    const out = radius * (1 - 0.82 * share);
    points.push({
      x: middle.x + Math.cos(turn) * out,
      y: middle.y + Math.sin(turn) * out,
      z: middle.z + radius * 0.25 * share,
    });
    widths.push(wide * Math.sin(Math.PI * Math.min(1, share * 1.1 + 0.05)) ** 0.6);
    alphas.push(Math.min(1, share * 4) * (1 - 0.5 * share));
  }
  return { points, widths, color: paint.edge, core: '#ffffff', alpha, alphas, blend: 'color', torn: 0.35 };
}

/**
 * A streak of wind from its tail to its head: thin, fading to nothing at its tail and brightest at its
 * head, white in its middle and shadowed at its edge, wavering a little about its line.
 */
export function streakRibbon(
  tail: Point,
  head: Point,
  wide: number,
  alpha: number,
  paint: WindPaint,
  waver: { readonly side: Point; readonly by: number; readonly phase: number }
): EffectRibbon {
  const steps = 5;
  const points: Point[] = [];
  const widths: number[] = [];
  const alphas: number[] = [];
  for (let step = 0; step <= steps; step++) {
    const share = step / steps;
    const off = Math.sin(share * 5 + waver.phase) * waver.by * (1 - share);
    points.push({
      x: tail.x + (head.x - tail.x) * share + waver.side.x * off,
      y: tail.y + (head.y - tail.y) * share + waver.side.y * off,
      z: tail.z + (head.z - tail.z) * share + waver.side.z * off,
    });
    widths.push(wide * (0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, share * 0.9 + 0.1)) ** 0.6));
    alphas.push(share ** 1.3);
  }
  return { points, widths, color: paint.edge, core: '#ffffff', alpha, alphas, blend: 'color' };
}

/** Lays bands into what is drawn, leaving out those too faint to show. */
export function layRibbons(drawn: Staged, ribbons: readonly EffectRibbon[]): void {
  for (const ribbon of ribbons) if (ribbon.alpha > 0.01) drawn.ribbons.push(ribbon);
}
