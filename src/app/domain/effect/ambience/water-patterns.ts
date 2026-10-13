import { seededRandom } from '@axe/domain/effect/particles/shared';

/** How many pixels a side of a water pattern tile is drawn at. */
export const WATER_PATTERN_TILE_PX = 192;

/** The waves summed into one smooth field, each a whole number of times across the tile so it repeats. */
interface Wave {
  readonly fx: number;
  readonly fy: number;
  readonly phase: number;
  readonly weight: number;
}

/**
 * A smooth field over one tile, from 0 to 1, repeating without a seam.
 *
 * It is a handful of slow waves running different ways, each fitting the tile a whole number of
 * times, summed and stretched to fill the range. Laid in white and coloured by whatever wears it,
 * one tile serves water of every colour.
 */
export interface SmoothField {
  readonly size: number;
  readonly waves: readonly Wave[];
}

/**
 * The field one seed gives; the same seed always gives the same field.
 *
 * `finest` is how many times across the tile the finest wave runs. Few and slow, the field is soft
 * clouds; with finer waves mixed in, each weaker the finer it is, edges drawn from it come out
 * ragged the way scum and weed lie on water rather than round as spilt drops.
 */
export function smoothFieldOf(seed: number, size = WATER_PATTERN_TILE_PX, count = 9, finest = 2): SmoothField {
  const random = seededRandom(seed);
  const waves: Wave[] = [];
  const span = finest * 2 + 1;
  for (let index = 0; index < count; index++) {
    const fx = Math.floor(random() * span) - finest;
    const fy = Math.floor(random() * span) - finest;
    const phase = random() * Math.PI * 2;
    const jitter = random();
    if (fx === 0 && fy === 0) continue;
    const reach = Math.hypot(fx, fy);
    waves.push({ fx, fy, phase, weight: (0.5 + jitter * 0.5) / Math.pow(reach, 0.9) });
  }
  return { size, waves };
}

/** The field at a point, from 0 to 1. */
export function smoothFieldAt(field: SmoothField, x: number, y: number): number {
  let sum = 0;
  let most = 0;
  for (const wave of field.waves) {
    sum += wave.weight * Math.sin(((wave.fx * x + wave.fy * y) / field.size) * Math.PI * 2 + wave.phase);
    most += wave.weight;
  }
  return most > 0 ? 0.5 + (0.5 * sum) / most : 0.5;
}

/**
 * The clouds of silt in murky water, as alpha over one tile: soft and everywhere, thicker in
 * some places than others, which is what tells murky water from water merely coloured.
 */
export function cloudAlpha(field: SmoothField): Uint8ClampedArray {
  const values = spreadOf(field);
  return toAlpha(values, (value) => smoothstep(0.1, 0.9, value));
}

/**
 * The scum floating on dirty water, as alpha over one tile: ragged patches with clear water
 * between them, covering about `coverage` of the surface whatever the seed.
 *
 * A patch is not one even film: it is thick in places and thin in others, read from the same
 * field at twice the fineness, which is what makes it scum rather than a painted shape.
 */
export function scumAlpha(field: SmoothField, coverage = 0.35): Uint8ClampedArray {
  const values = spreadOf(field);
  const finer = spreadOf(field, 2);
  const edge = quantileOf(values, 1 - coverage);
  return toAlpha(values, (value, index) => smoothstep(edge - 0.03, edge + 0.03, value) * (0.35 + 0.65 * finer[index]));
}

/**
 * The rim of the scum, as alpha over one tile: a thin line along the edge of each patch, where
 * the film stands up and catches the light.
 */
export function scumRimAlpha(field: SmoothField, coverage = 0.35): Uint8ClampedArray {
  const values = spreadOf(field);
  const edge = quantileOf(values, 1 - coverage);
  return toAlpha(values, (value) => smoothstep(edge - 0.035, edge, value) * (1 - smoothstep(edge, edge + 0.02, value)));
}

function quantileOf(values: Float32Array, share: number): number {
  const sorted = Float32Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(share * sorted.length)))];
}

/** How many lines a current draws across one tile. */
const STREAK_LINES = 22;

/**
 * The streaks a current draws on the water, as alpha over one tile: thin soft lines running along
 * the tile's x, each wandering a little up and down and brightening and fading along its length,
 * so what is carried past reads as moving water rather than as rain. Every wander and every
 * swell fits the tile a whole number of times, so the tile repeats without a seam.
 */
export function streakAlpha(seed: number, size = WATER_PATTERN_TILE_PX): Uint8ClampedArray {
  const random = seededRandom(seed);
  const lines = Array.from({ length: STREAK_LINES }, () => ({
    y: random() * size,
    wander: (1 + random() * 3) * (size / 192),
    wanderTimes: 1 + Math.floor(random() * 2),
    wanderPhase: random() * Math.PI * 2,
    swellTimes: 1 + Math.floor(random() * 3),
    swellPhase: random() * Math.PI * 2,
    width: (0.7 + random() * 1.1) * (size / 192),
    strength: 0.45 + random() * 0.55,
  }));
  const alpha = new Uint8ClampedArray(size * size);
  for (let x = 0; x < size; x++) {
    const turn = ((x + 0.5) / size) * Math.PI * 2;
    for (const line of lines) {
      const centre = line.y + line.wander * Math.sin(turn * line.wanderTimes + line.wanderPhase);
      // Bright for a stretch and gone for a stretch, so the lines break up rather than stripe the water.
      const swell = Math.max(Math.sin(turn * line.swellTimes + line.swellPhase), 0);
      const strength = line.strength * swell * swell;
      if (strength < 0.01) continue;
      const reach = Math.ceil(line.width * 3);
      for (let dy = -reach; dy <= reach; dy++) {
        const y = Math.round(centre) + dy;
        const off = (y + 0.5 - centre) / line.width;
        const value = strength * Math.exp(-off * off);
        const at = (((y % size) + size) % size) * size + x;
        alpha[at] = Math.max(alpha[at], Math.round(Math.min(value, 1) * 255));
      }
    }
  }
  return alpha;
}

/**
 * The field over the whole tile, stretched so its lowest is 0 and its highest 1. Summed from
 * many waves the values gather about the middle, and a threshold set on the plain range would
 * fall on nearly nothing.
 */
function spreadOf(field: SmoothField, fineness = 1): Float32Array {
  const size = field.size;
  const values = new Float32Array(size * size);
  let low = Infinity;
  let high = -Infinity;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = smoothFieldAt(field, (x + 0.5) * fineness, (y + 0.5) * fineness);
      values[y * size + x] = value;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  const range = high - low;
  for (let index = 0; index < values.length; index++) values[index] = range > 0 ? (values[index] - low) / range : 0.5;
  return values;
}

function toAlpha(values: Float32Array, shape: (value: number, index: number) => number): Uint8ClampedArray {
  const alpha = new Uint8ClampedArray(values.length);
  for (let index = 0; index < values.length; index++) alpha[index] = Math.round(shape(values[index], index) * 255);
  return alpha;
}

function smoothstep(from: number, to: number, value: number): number {
  const t = Math.min(Math.max((value - from) / (to - from), 0), 1);
  return t * t * (3 - 2 * t);
}
