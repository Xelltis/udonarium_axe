import { seededRandom } from '@axe/core/util/seeded-random';
import { ambienceDensityOf, type AmbienceKind } from '@axe/domain/effect/ambience/ambience-kind';

/** The kinds of weather the scene lets fall as drops and flakes round the camera, rather than the screen. */
export const WEATHER_FALL_KINDS: readonly AmbienceKind[] = ['rain', 'storm', 'snow'];

/** Whether the scene lets a kind of weather fall itself, so that nothing else draws its drops and its flashes. */
export function fallsInScene(kind: AmbienceKind): boolean {
  return WEATHER_FALL_KINDS.includes(kind);
}

/**
 * Drops or flakes falling through the air over the board, in table pixels and seconds: as many as
 * fall over a square a thousand pixels across, how fast and which way, how large each is, and how
 * far a flake sways as it falls.
 */
export interface WeatherFall {
  /** Long streaks drawn along the way they fall, or round flakes. */
  readonly shape: 'streak' | 'flake';
  readonly colour: string;
  readonly perMegapixel: number;
  /** Which way and how fast, across the board, down it, and down out of the sky. */
  readonly velocity: { readonly x: number; readonly y: number; readonly z: number };
  /** For a streak, how wide and how long; for a flake, how wide, the same both ways. */
  readonly widthPx: number;
  readonly lengthPx: number;
  readonly swayPx: number;
  /** How opaque the most opaque of them is, from 0 to 1. */
  readonly opacity: number;
  /** Whether lightning strikes in it. */
  readonly flashes: boolean;
  readonly density: number;
}

/** The most drops the scene draws at once, however wide the camera takes in. */
export const MAX_WEATHER_FALL = 6000;

const FALLS: Partial<
  Record<AmbienceKind, Omit<WeatherFall, 'colour' | 'density' | 'perMegapixel'> & { full: number }>
> = {
  rain: {
    shape: 'streak',
    full: 520,
    velocity: { x: 90, y: 30, z: -1100 },
    widthPx: 2.2,
    lengthPx: 48,
    swayPx: 0,
    opacity: 0.6,
    flashes: false,
  },
  storm: {
    shape: 'streak',
    full: 760,
    velocity: { x: 260, y: 70, z: -1500 },
    widthPx: 2.6,
    lengthPx: 64,
    swayPx: 0,
    opacity: 0.65,
    flashes: true,
  },
  snow: {
    shape: 'flake',
    full: 320,
    velocity: { x: 18, y: 6, z: -70 },
    widthPx: 7,
    lengthPx: 7,
    swayPx: 14,
    opacity: 0.9,
    flashes: false,
  },
};

/**
 * The drops or flakes a kind of weather lets fall through the scene, at its colour and as thick as it
 * is laid, or null for weather that does not fall there or is laid at nothing.
 */
export function weatherFallOf(kind: AmbienceKind, colour: string, density: number): WeatherFall | null {
  const fall = FALLS[kind];
  const level = ambienceDensityOf(density);
  if (!fall || !(level > 0)) return null;
  const { full, ...rest } = fall;
  return { ...rest, colour, density: level, perMegapixel: full * level };
}

/**
 * How many drops fall within a square of the board this many table pixels across, as thick as the
 * weather falls, held to what the scene draws at once.
 */
export function weatherFallCount(fall: WeatherFall, acrossPx: number): number {
  if (!(acrossPx > 0)) return 0;
  return Math.min(MAX_WEATHER_FALL, Math.round((fall.perMegapixel * acrossPx * acrossPx) / 1_000_000));
}

/**
 * How wide a square of the board the drops are kept falling over, to take in this many table pixels:
 * in steps that double, so that the drops do not move as the camera draws in and out, but only where
 * it crosses a step.
 */
export function weatherFallSquarePx(acrossPx: number): number {
  const wanted = Math.min(Math.max(acrossPx, 256), 8192);
  return 2 ** Math.ceil(Math.log2(wanted));
}

/**
 * How wide a square round where the camera looks the drops are kept falling over, for a camera
 * standing this far off it: about as wide as it takes in.
 */
export function weatherFallSpanPx(distancePx: number): number {
  return weatherFallSquarePx(distancePx * 1.6);
}

/**
 * Where each drop starts within the square it falls over, as shares of it across, down and up, and a
 * fourth number of its own that sets how opaque, how large and how far through its sway it is. The
 * same on every screen, so the same drops fall everywhere.
 */
export function weatherFallSeeds(count: number): Float32Array {
  const random = seededRandom(9137);
  const seeds = new Float32Array(Math.max(0, count) * 4);
  for (let index = 0; index < seeds.length; index++) seeds[index] = random();
  return seeds;
}
