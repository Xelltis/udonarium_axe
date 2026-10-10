import { PERF_AMBIENCE_LAYER, perfCounters } from '@axe/core/util/perf-counters';
import {
  ambienceColorOf,
  ambienceDensityOf,
  type AmbienceKind,
  ambiencePalette,
} from '@axe/domain/effect/ambience/ambience-kind';
import {
  clamp01,
  type EffectParticle,
  type EffectParticleLayer,
  seededRandom,
  withAlpha,
} from '@axe/domain/effect/particles/shared';

/**
 * The weather over the whole map, drawn on one sheet across the screen.
 *
 * It is worked out afresh from the elapsed time each pass, and the positions wrap at the edges.
 * It holds no state, so a dropped frame does not disturb the fall.
 */
export interface SkyAmbienceSpec {
  kind: AmbienceKind;
  /** Empty for the colour of its kind. */
  color: string;
  /** Between none and all. At none nothing is made. */
  density: number;
  /** The elapsed time. The wrapping happens inside, so it may be passed as it is. */
  elapsed: number;
  /** How large an area is drawn. */
  width: number;
  height: number;
}

const SEED = 7717;
const MAX_PARTICLES = 700;

/** How many particles a megapixel holds at full density. */
const DENSITY_PER_AREA: Record<AmbienceKind, number> = {
  rain: 420,
  storm: 620,
  snow: 260,
  ash: 200,
  ember: 170,
  sand: 420,
  fog: 170,
  miasma: 80,
  bloom: 140,
  swamp: 120,
  vent: 90,
  lava: 120,
  blaze: 120,
  frost: 180,
};

/**
 * The particles of the map-wide weather at one moment, ready to draw across the screen.
 *
 * Every particle comes from a fixed seed and the elapsed time, so the same moment looks the same on every
 * screen. The count grows with the area and the density, up to a cap. Kinds that only lie on the ground
 * make no particles here.
 */
export function skyAmbienceLayer(spec: SkyAmbienceSpec): EffectParticleLayer {
  perfCounters.bump(PERF_AMBIENCE_LAYER);
  const width = Math.max(spec.width, 0);
  const height = Math.max(spec.height, 0);
  const layer: EffectParticleLayer = { width, height, originX: 0, originY: 0, particles: [] };

  const density = ambienceDensityOf(spec.density);
  const count = particleCount(spec.kind, width, height, density);
  if (count < 1) return layer;

  const color = ambienceColorOf(spec.kind, spec.color);
  const random = seededRandom(SEED);
  const elapsed = Number.isFinite(spec.elapsed) ? spec.elapsed : 0;

  for (let index = 0; index < count; index++) {
    const a = random();
    const b = random();
    const c = random();
    const d = random();
    const particle = emit(spec.kind, { a, b, c, d }, elapsed, width, height, color);
    if (particle) layer.particles.push(particle);
  }
  return layer;
}

/**
 * The colour of the air. Particles alone never reach thick fog, so a wash is laid over them.
 *
 * The direction runs from the back of the board to the front, and the wash is thicker at the back than the front.
 * Washed evenly, a dense one is a coloured sheet laid over everything and the depth is gone.
 */
export function skyAmbienceWash(kind: AmbienceKind, color: string, density: number, direction = 'to bottom'): string {
  const raw = ambienceDensityOf(density);
  if (raw <= 0) return '';

  const level = raw;
  const tint = ambienceColorOf(kind, color);
  const shade = ambiencePalette(kind).secondary;
  const depth = (far: number, near: number, paint: string) =>
    `linear-gradient(${direction}, ${withAlpha(paint, round(far * level))} 0%,` +
    ` ${withAlpha(paint, round(((far + near) / 2) * level))} 45%, ${withAlpha(paint, round(near * level))} 100%)`;

  switch (kind) {
    case 'fog':
      // The wash carries only the colour of the air; the density belongs to the overlapping cloud, and thickened by the wash it becomes a lump.
      return depth(0.55, 0.12, tint);
    case 'rain':
      return depth(0.42, 0.12, shade);
    case 'storm':
      return depth(0.72, 0.28, shade);
    case 'snow':
      return depth(0.34, 0.12, tint);
    case 'ash':
      return depth(0.52, 0.16, shade);
    case 'ember':
      return `radial-gradient(ellipse at 50% 120%, ${withAlpha(tint, round(0.45 * level))}, transparent 70%)`;
    case 'sand':
      return depth(0.5, 0.18, tint);
    case 'miasma':
      return (
        `radial-gradient(ellipse at 50% 110%, ${withAlpha(tint, round(0.42 * level))}, transparent 76%),` +
        ` ${depth(0.46, 0.1, shade)}`
      );
    default:
      return '';
  }
}

/** How long between strikes. There is one flash within each. */
const STRIKE_CYCLE_MS = 5200;
/** How long a flash takes to go. */
const STRIKE_SPAN_MS = 460;

/**
 * How hard the lightning flashes. Only weather that carries it flashes at all.
 *
 * It is worked out from the elapsed time alone, so every screen flashes on the same beat.
 * It flashes twice rather than once; once alone it is a camera rather than lightning.
 */
export function skyAmbienceFlash(kind: AmbienceKind, elapsed: number, density: number): number {
  if (kind !== 'storm') return 0;
  const level = ambienceDensityOf(density);
  if (level <= 0) return 0;

  const time = Number.isFinite(elapsed) ? Math.max(elapsed, 0) : 0;
  const cycle = Math.floor(time / STRIKE_CYCLE_MS);
  const random = seededRandom(cycle * 2654435761 + 17);
  const at = 400 + random() * (STRIKE_CYCLE_MS - STRIKE_SPAN_MS - 800);
  const power = 0.45 + random() * 0.55;

  const local = time - cycle * STRIKE_CYCLE_MS - at;
  if (local < 0 || local > STRIKE_SPAN_MS) return 0;

  const first = Math.exp(-local / 70);
  const second = local > 150 ? Math.exp(-(local - 150) / 60) * 0.75 : 0;
  return clamp01((first + second) * power * (0.35 + level * 0.65));
}

function particleCount(kind: AmbienceKind, width: number, height: number, density: number): number {
  if (density <= 0 || width <= 0 || height <= 0) return 0;
  const area = (width * height) / 1_000_000;
  const count = Math.round(DENSITY_PER_AREA[kind] * area * density);
  return Math.min(count, MAX_PARTICLES);
}

interface Randoms {
  a: number;
  b: number;
  c: number;
  d: number;
}

function emit(
  kind: AmbienceKind,
  r: Randoms,
  elapsed: number,
  width: number,
  height: number,
  color: string
): EffectParticle | null {
  switch (kind) {
    case 'rain':
      return rain(r, elapsed, width, height, color);
    case 'snow':
      return snow(r, elapsed, width, height, color);
    case 'ash':
      return ash(r, elapsed, width, height, color);
    case 'ember':
      return ember(r, elapsed, width, height, color);
    case 'sand':
      return sand(r, elapsed, width, height, color);
    case 'storm':
      return storm(r, elapsed, width, height, color);
    case 'fog':
      return haze(r, elapsed, width, height, color, 0.01, 0.3);
    case 'miasma':
      return haze(r, elapsed, width, height, color, 0.005, 0.22);
    case 'bloom':
      return bloom(r, elapsed, width, height, color);
    default:
      return null;
  }
}

function rain(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const speed = 1.1 + r.c * 0.8;
  const span = height + 160;
  return {
    x: wrap(r.a * (width + 200) + elapsed * 0.12, width + 200) - 100,
    y: wrap(r.b * span + elapsed * speed, span) - 80,
    size: 2.2 + r.d * 1.8,
    angle: 1.42,
    stretch: 9 + r.c * 11,
    color,
    alpha: 0.3 + r.d * 0.4,
    shape: 'streak',
  };
}

function snow(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const speed = 0.045 + r.c * 0.06;
  const span = height + 80;
  return {
    x: wrap(r.a * width + Math.sin(elapsed * 0.0006 + r.a * TAU) * 24, width),
    y: wrap(r.b * span + elapsed * speed, span) - 40,
    size: 3 + r.d * 5,
    angle: 0,
    stretch: 1,
    color,
    alpha: 0.55 + r.d * 0.45,
    shape: 'glow',
  };
}

function ash(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const speed = 0.02 + r.c * 0.035;
  const span = height + 80;
  return {
    x: wrap(r.a * width + Math.sin(elapsed * 0.0004 + r.a * TAU) * 36, width),
    y: wrap(r.b * span + elapsed * speed, span) - 40,
    size: 2.8 + r.d * 6,
    angle: 0,
    stretch: 1,
    color,
    alpha: 0.3 + r.d * 0.35,
    shape: 'smoke',
  };
}

function ember(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const speed = 0.05 + r.c * 0.09;
  const span = height + 100;
  const flicker = 0.55 + 0.45 * Math.sin(elapsed * 0.006 + r.a * 12);
  return {
    x: wrap(r.a * width + Math.sin(elapsed * 0.0012 + r.b * TAU) * 20, width),
    y: height + 50 - wrap(r.b * span + elapsed * speed, span),
    size: 2.2 + r.d * 3.6,
    angle: 0,
    stretch: 1,
    color,
    alpha: clamp01((0.5 + r.d * 0.5) * flicker),
    shape: 'glow',
  };
}

/** Driving rain: leaning further than rain that falls straight, with spray torn off by the wind mixed in. */
function storm(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const gust = 1 + 0.35 * Math.sin(elapsed * 0.00035);
  const spray = r.d > 0.78;
  const speed = (spray ? 1.9 + r.c * 1.1 : 1.5 + r.c * 1.1) * gust;
  const span = height + 260;
  const slant = spray ? 0.62 : 0.92;

  return {
    // Carried by the wind, it travels far sideways as it falls.
    x: wrap(r.a * (width + 900) + elapsed * speed * 0.62, width + 900) - 450,
    y: wrap(r.b * span + elapsed * speed, span) - 130,
    size: spray ? 1.4 + r.d * 1.4 : 2.4 + r.d * 2.2,
    angle: slant,
    stretch: spray ? 16 + r.c * 16 : 11 + r.c * 13,
    color,
    alpha: spray ? 0.14 + r.d * 0.2 : 0.32 + r.d * 0.42,
    shape: 'streak',
  };
}

function sand(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const speed = 0.55 + r.c * 0.75;
  const span = width + 320;
  return {
    x: wrap(r.a * span + elapsed * speed, span) - 160,
    y: r.b * height + Math.sin(elapsed * 0.001 + r.a * TAU) * 14,
    size: 2 + r.d * 3,
    angle: 0.06,
    stretch: 8 + r.c * 15,
    color,
    alpha: 0.22 + r.d * 0.3,
    shape: 'streak',
  };
}

/**
 * The masses of drifting cloud, which fog and miasma share.
 *
 * A single thin wash is only a coloured sheet held in front.
 * The density comes from the masses overlapping, and without a wide spread of size and speed it is wallpaper of one cloud repeated.
 */
function haze(
  r: Randoms,
  elapsed: number,
  width: number,
  height: number,
  color: string,
  speed: number,
  alpha: number
): EffectParticle {
  const base = Math.max(width, height);
  const phase = r.a * TAU;
  // Each swells, twists and bleeds on its own beat; in step, they all breathe together.
  const churn = elapsed * 0.00016;
  const swell = 0.82 + 0.18 * Math.sin(churn * 1.7 + phase);
  const size = base * (0.07 + Math.pow(r.d, 1.7) * 0.46) * swell;
  const span = width + size;
  const drift = speed * (0.35 + r.a * 1.9);

  return {
    x: wrap(r.a * span + elapsed * drift + Math.sin(churn * 1.3 + phase) * base * 0.05, span) - size / 2,
    y:
      r.b * height +
      Math.sin(churn * 1.9 + phase) * height * 0.09 +
      Math.cos(churn * 1.1 + phase * 0.7) * height * 0.05,
    size,
    // Moved alone it reads as a sheet sliding, so it turns slowly and changes shape.
    angle: phase + churn * (0.6 + r.c * 0.9),
    stretch: 0.5 + r.c * 0.4 + 0.22 * Math.sin(churn * 2.3 + phase * 1.7),
    color,
    alpha: alpha * (0.5 + r.c * 0.9) * (0.72 + 0.28 * Math.sin(churn * 2.7 + phase * 2.1)),
    shape: 'smoke',
  };
}

function bloom(r: Randoms, elapsed: number, width: number, height: number, color: string): EffectParticle {
  const pulse = 0.45 + 0.55 * Math.sin(elapsed * 0.0022 + r.a * 9);
  return {
    x: wrap(r.a * width + Math.sin(elapsed * 0.00035 + r.a * TAU) * 44, width),
    y: wrap(r.b * height + Math.cos(elapsed * 0.00028 + r.b * TAU) * 34, height),
    size: 2.4 + r.d * 4.6,
    angle: 0,
    stretch: 1,
    color,
    alpha: clamp01((0.45 + r.d * 0.5) * pulse),
    shape: 'glow',
  };
}

const TAU = Math.PI * 2;

function wrap(value: number, span: number): number {
  if (span <= 0) return 0;
  const remainder = value % span;
  return remainder < 0 ? remainder + span : remainder;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
