import type { EffectKind } from '@axe/domain/effect/effect-kind';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { hueOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * What a great sword is made of. The technique is one, whatever it is cast in: a blade of radiance
 * raised and brought down, and a torrent loosed along the floor. What it is cast in is told by the
 * look it lands with, and gives the blade and the torrent their substance: light, flame, ice,
 * lightning, stone, shadow or wind. Each is painted the same way, from a heart through an inner and a body
 * to a sheath with a rim about it, so the seven read as one technique; the heart is white-hot for all
 * but shadow, whose heart is black within an edge of its colour.
 *
 * A ramp runs from the deepest shadow at 0 to white at 6.
 */

/** What a great sword is cast in. */
export type SwordElement = 'light' | 'fire' | 'ice' | 'thunder' | 'earth' | 'dark' | 'wind';

/** The colours a great sword is painted in, from its heart out, and what it leaves. */
export interface SwordPaint {
  readonly element: SwordElement;
  readonly ramp: readonly string[];
  readonly heart: string;
  readonly inner: string;
  readonly body: string;
  readonly sheath: string;
  /** The outline about it, which holds it over a bright table. */
  readonly rim: string;
  /** The light it throws about itself. */
  readonly halo: string;
  /** The motes and streaks that fly in it. */
  readonly spark: string;
  /** What it scores the floor with, and what glows in the score while it is hot. */
  readonly score: string;
  readonly ember: string;
}

const INK = '#07030c';
const SOOT = '#17110f';

const ELEMENT_OF: Partial<Record<EffectKind, SwordElement>> = {
  flame: 'fire',
  burst: 'fire',
  nova: 'fire',
  mushroom: 'fire',
  frost: 'ice',
  bolt: 'thunder',
  arc: 'thunder',
  upheaval: 'earth',
  rubble: 'earth',
  impact: 'earth',
  quake: 'earth',
  miasma: 'dark',
  curse: 'dark',
  gravity: 'dark',
  drain: 'dark',
  vortex: 'wind',
};

/** What a great sword that lands with a kind of look is cast in: light, for a look of no element. */
export function swordElementOf(kind: EffectKind): SwordElement {
  return ELEMENT_OF[kind] ?? 'light';
}

/** The paint of a great sword of two colours that lands with a kind of look. */
export function swordPaintOf(kind: EffectKind, light: string, dark: string): SwordPaint {
  const element = swordElementOf(kind);
  const ramp = rampOf(light, dark, 7);
  const hue = hueOf(ramp);
  const base = { element, ramp, halo: hue, spark: ramp[5], score: SOOT, ember: ramp[2] };
  switch (element) {
    case 'fire':
      return {
        ...base,
        heart: '#fffbe6',
        inner: mixColor(ramp[4], '#ffe37a', 0.5),
        body: mixColor(ramp[2], '#ff9a1e', 0.5),
        sheath: mixColor(ramp[1], '#ff3a08', 0.4),
        rim: mixColor(ramp[0], '#3a0a02', 0.5),
        halo: mixColor(ramp[1], '#ff5a10', 0.4),
      };
    case 'ice':
      return {
        ...base,
        heart: '#ffffff',
        inner: mixColor(ramp[5], '#ffffff', 0.5),
        body: mixColor(ramp[3], '#ffffff', 0.25),
        sheath: mixColor(ramp[2], ramp[1], 0.35),
        rim: mixColor(ramp[0], '#0b2a4a', 0.5),
        score: '#27445c',
        ember: '#dff6ff',
      };
    case 'thunder':
      return {
        ...base,
        heart: '#ffffff',
        inner: ramp[5],
        body: mixColor(ramp[3], ramp[2], 0.4),
        sheath: hue,
        rim: mixColor(ramp[0], '#12063a', 0.5),
      };
    case 'earth':
      return {
        ...base,
        heart: '#fff6dc',
        inner: mixColor(ramp[4], '#ffd27a', 0.5),
        body: mixColor(ramp[2], '#ffab32', 0.55),
        sheath: mixColor('#75604c', ramp[1], 0.3),
        rim: '#2b2019',
        halo: mixColor(ramp[1], '#ff9a2a', 0.5),
        score: '#2a1f17',
        ember: '#ff8a2a',
      };
    case 'wind':
      return {
        ...base,
        heart: '#ffffff',
        inner: mixColor(ramp[5], '#f2fff6', 0.5),
        body: mixColor(ramp[4], '#e2fff0', 0.3),
        sheath: mixColor(ramp[2], ramp[1], 0.3),
        rim: mixColor(ramp[0], '#0b2a20', 0.55),
        score: '#3a4436',
        ember: '#f0fff6',
      };
    case 'dark':
      return {
        ...base,
        heart: '#000000',
        inner: INK,
        body: mixColor(ramp[0], INK, 0.3),
        sheath: mixColor(ramp[1], ramp[2], 0.5),
        rim: ramp[4],
        halo: ramp[1],
        spark: ramp[4],
        score: '#0b0612',
        ember: ramp[2],
      };
    default:
      return {
        ...base,
        heart: '#ffffff',
        inner: ramp[5],
        body: ramp[3],
        sheath: mixColor(hue, ramp[2], 0.4),
        rim: mixColor(ramp[0], ramp[1], 0.35),
      };
  }
}

/** The paint of a great sword at the instant it is let go: all of it white, in its own rim. */
export function whitened(paint: SwordPaint, by: number): SwordPaint {
  if (by <= 0 || paint.element === 'dark') return paint;
  const white = (color: string) => mixColor(color, '#ffffff', by);
  return { ...paint, inner: white(paint.inner), body: white(paint.body), sheath: white(paint.sheath) };
}

/** How a band of the sword's substance is laid: how wide, how deep its edge is torn, and how far its pattern has run. */
export interface BandLook {
  readonly alpha: number;
  readonly torn: number;
  readonly flowed: number;
  /** How much of its alpha it has at each point; whole all along without them. */
  readonly alphas?: readonly number[];
}

/**
 * A band of a great sword's substance through points, as wide as `widths` at each: a light about it,
 * its rim, its sheath, its body taken to its inner, and its inner taken to its heart, each torn at
 * its edge by a pattern that runs down it.
 */
export function substanceBands(
  points: readonly Point[],
  widths: readonly number[],
  paint: SwordPaint,
  look: BandLook
): EffectRibbon[] {
  const { alpha, torn, flowed, alphas } = look;
  if (alpha <= 0.01 || points.length < 2) return [];
  const scaled = (by: number, more = 0) => widths.map((width) => (width > 0 ? width * by + more : 0));
  const widest = Math.max(...widths);
  const dark = paint.element === 'dark';
  return [
    {
      points,
      widths: scaled(2.6),
      color: paint.halo,
      alpha: (dark ? 0.5 : 0.34) * alpha,
      alphas,
      blend: dark ? 'color' : 'light',
      soft: 1,
    },
    {
      points,
      widths: scaled(1.2, widest * 0.03),
      color: paint.rim,
      alpha: (dark ? 1 : 0.8) * alpha,
      alphas,
      blend: 'color',
      torn: torn * 1.1,
      flowed,
    },
    {
      points,
      widths: scaled(1.08),
      color: paint.sheath,
      alpha,
      alphas,
      blend: 'color',
      torn,
      soft: 0.1,
      flowed: flowed * 1.15 + 3,
    },
    {
      points,
      widths: scaled(0.74),
      color: paint.body,
      core: paint.inner,
      alpha,
      alphas,
      blend: 'color',
      torn: torn * 0.9,
      flowed: flowed * 1.3 + 5,
    },
    {
      points,
      widths: scaled(0.38),
      color: paint.inner,
      core: paint.heart,
      alpha,
      alphas,
      blend: 'color',
      torn: torn * 0.5,
      flowed: flowed * 1.5 + 7,
    },
  ];
}
