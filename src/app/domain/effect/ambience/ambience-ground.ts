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
  fadeInOut,
  HOT,
  seededRandom,
  withAlpha,
} from '@axe/domain/effect/particles/shared';

/**
 * The effects laid over one marked-off part of the ground.
 *
 * The surface itself, such as the water of a marsh or the glow of lava, is drawn flat on
 * the board, and what rises from it, such as steam or miasma, on a sheet facing the camera.
 * Flat alone, what rises spreads sideways; facing alone, the marsh floats.
 */
export interface GroundAmbienceSpec {
  kind: AmbienceKind;
  /** Empty for the colour of its kind. */
  color: string;
  /** Between none and all. At none no particles are made. */
  density: number;
  elapsed: number;
  /** How large an area is drawn. */
  width: number;
  height: number;
  /** How large one cell is. The particles are sized by the cell rather than by the area. */
  unit: number;
  /** How far the phase is offset, so several of these side by side do not move together. */
  phase?: number;
  /**
   * Which of the sheets the rise is split into through the depth this one is.
   *
   * One sheet over a wide area puts the far and the near at the same depth, which looks
   * like a band pasted on the board. Near and far are raised separately to give it body.
   */
  sliceIndex?: number;
  sliceCount?: number;
}

/** How many sheets the rise is split into. One is enough while the depth is shallow. */
export function vaporSliceCount(depth: number, unit: number): number {
  const cells = unit > 0 ? depth / unit : 0;
  return Math.min(Math.max(Math.round(cells / 2.5), 1), MAX_VAPOR_SLICES);
}

/** How tall each sheet is, in cells. A wall of flame is no wall unless it reaches. */
export function vaporCellsOf(kind: AmbienceKind): number {
  return VAPOR_CELLS[kind] ?? DEFAULT_VAPOR_CELLS;
}

const SURFACE_SEED = 40993;
const VAPOR_SEED = 15683;
const MAX_SURFACE_PARTICLES = 420;
/**
 * The cap on the rising particles counts per sheet.
 * Capped across the whole area, each sheet thins as it widens until a few flames float apart.
 */
const MAX_VAPOR_PER_SLICE = 150;
const MAX_VAPOR_SLICES = 5;
const DEFAULT_VAPOR_CELLS = 2.6;

const VAPOR_CELLS: Partial<Record<AmbienceKind, number>> = {
  blaze: 6.5,
  vent: 3.4,
  miasma: 3.2,
  fog: 2,
  frost: 1.8,
};
const DEFAULT_UNIT = 50;

/**
 * How many particles a cell of surface holds at full density.
 * Counted by area, the default size would show a handful and read as no marsh at all.
 *
 * Water has none of its own: one pond is often laid as many areas side by side, and drawn
 * area by area it would show a seam at every join, so the water layer draws it whole.
 */
const SURFACE_PER_CELL: Record<AmbienceKind, number> = {
  swamp: 9,
  vent: 6,
  lava: 10,
  blaze: 18,
  frost: 14,
  miasma: 4,
  bloom: 10,
  fog: 0,
  rain: 0,
  storm: 0,
  snow: 0,
  ash: 0,
  ember: 0,
  sand: 0,
  water: 0,
  underwater: 0,
};

/** How many rising particles a cell of width holds at full density. */
const VAPOR_PER_CELL: Record<AmbienceKind, number> = {
  vent: 14,
  swamp: 8,
  fog: 12,
  miasma: 8,
  lava: 10,
  blaze: 70,
  frost: 6,
  bloom: 8,
  rain: 0,
  storm: 0,
  snow: 0,
  ash: 0,
  ember: 0,
  sand: 0,
  water: 0,
  underwater: 0,
};

/**
 * The margin taken outside the canvas, against one cell.
 *
 * The particles are cut to the canvas. One as wide as the area is cut at its skirt even
 * with its centre in the middle, so thinning it does not take the square edge away.
 * The canvas is widened by the radius of the largest particle, so everything fades out inside it.
 */
const SURFACE_PAD_UNITS = 0.9;
/** The margin for the rise comes from the largest particle, with a little added to it. */
const VAPOR_PAD_MARGIN_UNITS = 0.2;

/**
 * The surface drawn flat on the board: what happens on it, such as bubbles or a glow.
 * The origin is the top left of the area, and the canvas spreads a margin beyond it.
 */
export function groundSurfaceLayer(spec: GroundAmbienceSpec): EffectParticleLayer {
  perfCounters.bump(PERF_AMBIENCE_LAYER);
  const width = Math.max(spec.width, 0);
  const height = Math.max(spec.height, 0);
  const unit = unitOf(spec);
  const pad = unit * SURFACE_PAD_UNITS;
  const layer: EffectParticleLayer = {
    width: width + pad * 2,
    height: height + pad * 2,
    originX: pad,
    originY: pad,
    particles: [],
  };

  const density = ambienceDensityOf(spec.density);
  const cells = (width * height) / (unit * unit);
  const count = Math.min(Math.round(SURFACE_PER_CELL[spec.kind] * cells * density), MAX_SURFACE_PARTICLES);
  if (count < 1) return layer;

  const color = ambienceColorOf(spec.kind, spec.color);
  const shade = ambiencePalette(spec.kind).secondary;
  const random = seededRandom(SURFACE_SEED);
  const elapsed = elapsedOf(spec);
  const shortest = Math.min(width, height);

  for (let index = 0; index < count; index++) {
    const r = randomsOf(random);
    const particle = surfaceParticle(spec.kind, r, elapsed, width, height, unit, color, shade);
    if (!particle) continue;
    // It thins at the edge as well: the margin guards against a cut edge, but thick to the rim the marsh reads as square.
    particle.alpha *= falloff(
      Math.min(particle.x, width - particle.x, particle.y, height - particle.y),
      marginOf(unit * 0.6, shortest)
    );
    layer.particles.push(particle);
  }
  return layer;
}

/**
 * What rises, drawn facing the camera. The origin is the middle of the near edge.
 * The canvas spreads a margin to the sides and above.
 */
export function groundVaporLayer(spec: GroundAmbienceSpec): EffectParticleLayer {
  perfCounters.bump(PERF_AMBIENCE_LAYER);
  const width = Math.max(spec.width, 0);
  const height = Math.max(spec.height, 0);
  const unit = unitOf(spec);
  const largest = largestVapor(spec.kind);
  const padX = unit * (largest.width / 2 + VAPOR_PAD_MARGIN_UNITS);
  const padY = unit * (largest.height / 2 + VAPOR_PAD_MARGIN_UNITS);
  const layer: EffectParticleLayer = {
    width: width + padX * 2,
    height: height + padY * 2,
    originX: width / 2 + padX,
    originY: height + padY,
    particles: [],
  };

  const density = ambienceDensityOf(spec.density);
  const slices = Math.max(Math.round(spec.sliceCount ?? 1), 1);
  const sliceIndex = Math.max(Math.round(spec.sliceIndex ?? 0), 0);
  const total = Math.round((VAPOR_PER_CELL[spec.kind] * width * density) / unit);
  const count = Math.min(Math.round(total / slices), MAX_VAPOR_PER_SLICE);
  if (count < 1) return layer;

  const color = ambienceColorOf(spec.kind, spec.color);
  const shade = ambiencePalette(spec.kind).secondary;
  // Each sheet takes its own seed and phase; the same on both, the near and the far would lay one picture over another and give it no body.
  const random = seededRandom(VAPOR_SEED + sliceIndex * 7919);
  const elapsed = elapsedOf(spec) + sliceIndex * 211;
  const columns = Math.min(Math.max(Math.round(width / (unit * 1.8)), 1), 8);

  for (let index = 0; index < count; index++) {
    const r = randomsOf(random);
    const particle = vaporParticle(spec.kind, r, elapsed, width, height, unit, color, shade, columns);
    if (!particle) continue;
    particle.alpha *= falloff(width / 2 - Math.abs(particle.x), marginOf(unit * 0.5, width));
    layer.particles.push(particle);
  }
  return layer;
}

/**
 * The fill of the surface itself.
 *
 * It stays even where no particles are made. A marsh that does not read as a marsh takes
 * information off the board.
 */
export function groundSurfaceWash(kind: AmbienceKind, color: string, density: number): string {
  const tint = ambienceColorOf(kind, color);
  const shade = ambiencePalette(kind).secondary;
  const strength = 0.45 + ambienceDensityOf(density) * 0.55;

  switch (kind) {
    case 'swamp':
      return blobs(
        blob('32% 38%', tint, 0.72 * strength),
        blob('72% 66%', tint, 0.6 * strength),
        blob('50% 50%', shade, 0.85 * strength)
      );
    case 'lava':
      return blobs(
        blob('40% 44%', tint, 0.85 * strength),
        blob('66% 62%', tint, 0.7 * strength),
        blob('50% 50%', shade, 0.9 * strength)
      );
    case 'blaze':
      // The ground itself sinks dark, as a burn does. Lit brightly it becomes glowing ground
      // rather than burning ground; the brightness belongs to the flame.
      return blobs(
        blob('44% 46%', tint, 0.55 * strength),
        blob('64% 58%', tint, 0.45 * strength),
        blob('50% 50%', shade, 0.72 * strength)
      );
    case 'frost':
      return blobs(blob('50% 50%', tint, 0.62 * strength), blob('36% 62%', shade, 0.5 * strength));
    case 'fog':
      return blobs(blob('42% 46%', tint, 0.82 * strength), blob('58% 56%', tint, 0.74 * strength));
    case 'miasma':
      return blobs(blob('46% 48%', tint, 0.62 * strength), blob('50% 50%', shade, 0.72 * strength));
    case 'vent':
      return blob('50% 52%', shade, 0.6 * strength);
    case 'bloom':
      return blob('50% 50%', tint, 0.45 * strength);
    default:
      return '';
  }
}

/**
 * A mass that always fades out at the edge of its box.
 * At the default reach, a mass off the centre runs past the box and is cut in a straight line where it does.
 */
function blob(position: string, color: string, alpha: number): string {
  return (
    `radial-gradient(ellipse closest-side at ${position}, ${withAlpha(color, round(alpha))} 0%,` +
    ` ${withAlpha(color, round(alpha * 0.55))} 52%, transparent 100%)`
  );
}

function blobs(...layers: string[]): string {
  return layers.join(', ');
}

interface Randoms {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** A particle's worth is drawn at once, so the elapsed time does not change how much randomness is used. */
function randomsOf(random: () => number): Randoms {
  return { a: random(), b: random(), c: random(), d: random(), e: random(), f: random() };
}

function elapsedOf(spec: GroundAmbienceSpec): number {
  const elapsed = Number.isFinite(spec.elapsed) ? spec.elapsed : 0;
  const phase = Number.isFinite(spec.phase) ? (spec.phase as number) : 0;
  return elapsed + phase;
}

function unitOf(spec: GroundAmbienceSpec): number {
  return Number.isFinite(spec.unit) && spec.unit > 0 ? spec.unit : DEFAULT_UNIT;
}

function surfaceParticle(
  kind: AmbienceKind,
  r: Randoms,
  elapsed: number,
  width: number,
  height: number,
  unit: number,
  color: string,
  shade: string
): EffectParticle | null {
  const x = r.a * width;
  const y = r.b * height;

  switch (kind) {
    case 'blaze': {
      // Burning ground is embers glinting over a black burn.
      const ember = r.e > 0.3;
      const flicker = 0.3 + 0.7 * Math.sin(elapsed * (ember ? 0.007 : 0.0015) + r.c * 14);
      return {
        x,
        y,
        size: unit * (ember ? 0.12 + r.d * 0.16 : 0.4 + r.d * 0.5),
        angle: 0,
        stretch: ember ? 1 : 0.7,
        color: ember ? color : shade,
        alpha: clamp01((ember ? 0.5 + r.d * 0.5 : 0.3 + r.d * 0.3) * flicker),
        shape: ember ? 'glow' : 'smoke',
      };
    }
    case 'swamp': {
      const cycle = 1400 + r.c * 2200;
      const local = wrap(r.d * cycle + elapsed, cycle) / cycle;
      return {
        x,
        y,
        size: unit * (0.1 + local * 0.22),
        angle: 0,
        stretch: 1,
        color,
        alpha: fadeInOut(local, 0.4) * 0.85,
        shape: 'glow',
      };
    }
    case 'lava': {
      const pulse = 0.45 + 0.55 * Math.sin(elapsed * 0.0018 + r.c * 12);
      return {
        x,
        y,
        size: unit * (0.24 + r.d * 0.3),
        angle: 0,
        stretch: 0.7,
        color,
        alpha: clamp01((0.45 + r.d * 0.5) * pulse),
        shape: 'glow',
      };
    }
    case 'frost': {
      const twinkle = 0.35 + 0.65 * Math.sin(elapsed * 0.0026 + r.c * 15);
      return {
        x,
        y,
        size: unit * (0.08 + r.d * 0.12),
        angle: 0,
        stretch: 1,
        color,
        alpha: clamp01((0.35 + r.d * 0.5) * twinkle),
        shape: 'glow',
      };
    }
    case 'miasma': {
      return {
        x: wrap(x + Math.sin(elapsed * 0.0005 + r.c * 8) * unit * 0.5, width),
        y: wrap(y + Math.cos(elapsed * 0.0004 + r.d * 8) * unit * 0.4, height),
        size: unit * (0.6 + r.d * 0.8),
        angle: 0,
        stretch: 0.8,
        color,
        alpha: 0.16 + r.d * 0.2,
        shape: 'smoke',
      };
    }
    case 'bloom': {
      const pulse = 0.4 + 0.6 * Math.sin(elapsed * 0.0016 + r.c * 11);
      return {
        x: wrap(x + Math.sin(elapsed * 0.0004 + r.a * TAU) * unit * 0.3, width),
        y: wrap(y + Math.cos(elapsed * 0.00035 + r.b * TAU) * unit * 0.25, height),
        size: unit * (0.07 + r.d * 0.1),
        angle: 0,
        stretch: 1,
        color,
        alpha: clamp01((0.4 + r.d * 0.5) * pulse),
        shape: 'glow',
      };
    }
    case 'vent': {
      const pulse = 0.3 + 0.7 * Math.sin(elapsed * 0.0012 + r.c * 9);
      return {
        x,
        y,
        size: unit * (0.2 + r.d * 0.26),
        angle: 0,
        stretch: 0.6,
        color,
        alpha: clamp01((0.25 + r.d * 0.3) * pulse),
        shape: 'smoke',
      };
    }
    default:
      return null;
  }
}

interface RisingOptions {
  /** How long one particle lasts. */
  life: number;
  /** How far up the sheet it rises. */
  reach: number;
  /** How large it starts, against one cell. */
  size: number;
  /** How much larger it grows as it rises. */
  grow: number;
  alpha: number;
  /** How far it sways, against one cell. */
  sway: number;
  shape: EffectParticle['shape'];
  /** True to gather the vents together, false to scatter them across the surface. */
  clustered: boolean;
  /** True to draw it in the darker colour, which is the smoke standing over the flame. */
  shaded?: boolean;
  /** True to burn white at the root and lose the colour as it rises. */
  hot?: boolean;
  /**
   * How it rises: evenly at one, and lingering at the root before reaching above that.
   * Fastest at the moment it appears, it has left the floor by the time it thickens and hangs in the air.
   */
  ease?: number;
  /** How far it is drawn out upwards: a circle at one and twice as tall as it is wide at two, which is what makes a tongue of flame. */
  stretch?: number;
  /** How much more it is drawn out as it rises. */
  stretchGrow?: number;
  /** How high it starts. The smoke over a flame starts partway up. */
  from?: number;
  /** How quickly it thickens. The smaller it is the sooner. */
  rise?: number;
  /**
   * How much the sizes vary, by default a little either way.
   * A blaze needs small tongues beside great columns, or it is an even campfire.
   * The higher the bias the more small ones there are and the rarer the large.
   */
  scaleMin?: number;
  scaleMax?: number;
  scaleBias?: number;
  /** How much the lifetimes vary. At one they match; higher, they stop going out on the same beat. */
  lifeSpread?: number;
}

/**
 * How each kind rises. Where there are two or more, each particle takes one of them.
 * Flame needs both the bright tongue and the dark smoke; either alone does not burn.
 */
const VAPOR_OPTIONS: Partial<Record<AmbienceKind, readonly RisingOptions[]>> = {
  vent: [{ life: 2400, reach: 1, size: 0.7, grow: 1.7, alpha: 0.75, sway: 0.5, shape: 'smoke', clustered: true }],
  swamp: [{ life: 5200, reach: 0.45, size: 0.8, grow: 1.5, alpha: 0.45, sway: 1, shape: 'smoke', clustered: false }],
  fog: [{ life: 8000, reach: 0.35, size: 1.5, grow: 1.3, alpha: 0.85, sway: 1.5, shape: 'smoke', clustered: false }],
  miasma: [{ life: 4200, reach: 0.8, size: 1, grow: 1.8, alpha: 0.6, sway: 1.1, shape: 'smoke', clustered: false }],
  lava: [{ life: 1800, reach: 0.7, size: 0.24, grow: -0.1, alpha: 0.9, sway: 0.6, shape: 'glow', clustered: true }],
  frost: [{ life: 6000, reach: 0.3, size: 0.9, grow: 1, alpha: 0.4, sway: 1.2, shape: 'smoke', clustered: false }],
  bloom: [{ life: 5000, reach: 0.85, size: 0.18, grow: 0, alpha: 0.85, sway: 0.9, shape: 'glow', clustered: false }],
  blaze: [
    // It is the ground that burns, so a bed of fire is laid clinging to the floor first.
    // Without it the flame hangs in the air like the smoke of a campfire.
    {
      life: 900,
      reach: 0.1,
      size: 1.3,
      grow: 0.25,
      alpha: 0.6,
      sway: 0.12,
      shape: 'glow',
      clustered: false,
      hot: true,
      stretch: 0.8,
      stretchGrow: 0.4,
      rise: 0.18,
      scaleMin: 0.7,
      scaleMax: 1.8,
      scaleBias: 1.2,
      lifeSpread: 0.6,
    },
    {
      life: 620,
      reach: 0.5,
      size: 0.72,
      grow: -0.42,
      alpha: 0.62,
      sway: 0.22,
      shape: 'glow',
      clustered: false,
      hot: true,
      ease: 1.7,
      stretch: 2.2,
      stretchGrow: 1.4,
      rise: 0.05,
      scaleMin: 0.6,
      scaleMax: 1.8,
      scaleBias: 1.3,
      lifeSpread: 0.5,
    },
    {
      life: 1400,
      reach: 0.95,
      size: 0.8,
      grow: -0.48,
      alpha: 0.55,
      sway: 0.45,
      shape: 'glow',
      clustered: false,
      hot: true,
      ease: 2,
      stretch: 2.8,
      stretchGrow: 2.2,
      rise: 0.05,
      scaleMin: 0.7,
      scaleMax: 2.6,
      scaleBias: 1.5,
      lifeSpread: 0.6,
    },
    // The sparks carried up. Light scattered high makes the fire read far larger.
    {
      life: 2200,
      reach: 1,
      size: 0.07,
      grow: -0.03,
      alpha: 1,
      sway: 2.4,
      shape: 'glow',
      clustered: false,
      hot: true,
      ease: 1.2,
      stretch: 1.6,
      stretchGrow: 0.6,
      rise: 0.06,
      scaleMin: 0.5,
      scaleMax: 2,
      scaleBias: 2,
      lifeSpread: 0.8,
    },
    {
      life: 3400,
      reach: 1,
      from: 0.45,
      size: 0.6,
      grow: 2,
      alpha: 0.42,
      sway: 0.9,
      shape: 'smoke',
      clustered: false,
      shaded: true,
      scaleMin: 0.6,
      scaleMax: 1.6,
      scaleBias: 1.4,
      lifeSpread: 0.5,
    },
  ],
};

function vaporParticle(
  kind: AmbienceKind,
  r: Randoms,
  elapsed: number,
  width: number,
  height: number,
  unit: number,
  color: string,
  shade: string,
  columns: number
): EffectParticle | null {
  const variants = VAPOR_OPTIONS[kind];
  if (!variants || variants.length < 1) return null;
  const options = variants[Math.min(Math.floor(r.e * variants.length), variants.length - 1)];

  const life = options.life * (1 + (options.lifeSpread ?? 0) * (r.f - 0.5));
  const local = wrap(r.a * life + elapsed, life) / life;
  const climb = options.ease ? Math.pow(local, options.ease) : local;
  const from = options.from ?? 0;
  const base = options.clustered
    ? ((Math.floor(r.b * columns) + 0.5) / columns - 0.5) * width + (r.c - 0.5) * unit * 0.4
    : (r.b - 0.5) * width;

  // Smoke and haze that only rise read as a sheet sliding; each mass turns and twists slowly on its own beat.
  const churn = options.shape === 'smoke' ? elapsed * 0.00022 + r.b * TAU : 0;

  return {
    x: base + Math.sin(elapsed * 0.0008 + r.a * TAU) * unit * options.sway * local,
    y: -(from + climb * (options.reach - from)) * height,
    size: unit * (options.size + options.grow * local) * scaleOf(options, r.d),
    angle: churn === 0 ? 0 : churn * (0.5 + r.c),
    stretch:
      (options.stretch ?? 1) + (options.stretchGrow ?? 0) * local + (churn === 0 ? 0 : 0.18 * Math.sin(churn * 2.1)),
    // Losing the colour all the way up leaves particles that add nothing where they are laid additively, and the flame goes thin.
    // Only the root burns white; the rest keeps the colour of flame and fades by density.
    color: options.hot ? (local < 0.14 ? HOT : color) : options.shaded ? shade : color,
    alpha: clamp01(fadeInOut(local, options.rise ?? 0.22) * options.alpha * (0.7 + r.c * 0.6)),
    shape: options.shape,
  };
}

function scaleOf(options: RisingOptions, random: number): number {
  const min = options.scaleMin ?? 0.7;
  const max = options.scaleMax ?? 1.3;
  return min + (max - min) * Math.pow(random, options.scaleBias ?? 1);
}

/** How wide and tall the largest particle can be, against one cell, which is what sets the margin of the canvas. */
function largestVapor(kind: AmbienceKind): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const options of VAPOR_OPTIONS[kind] ?? []) {
    const scale = scaleOf(options, 1);
    // Both the size and the stretch change over the lifetime, and looking at the ends alone misses the largest of the two together.
    // What the twist adds is counted too; without it the moment it swells is cut by the edge.
    const churn = options.shape === 'smoke' ? 0.2 : 0;
    for (const local of [0, 0.5, 1]) {
      const size = (options.size + options.grow * local) * scale;
      if (size <= 0) continue;
      width = Math.max(width, size);
      height = Math.max(height, size * ((options.stretch ?? 1) + (options.stretchGrow ?? 0) * local + churn));
    }
  }
  return { width, height };
}

const TAU = Math.PI * 2;

/**
 * It thins towards the edge of the box.
 * The canvas is cut to that box, and an edge still thick where it is cut shows as a square.
 */
function falloff(distanceToEdge: number, margin: number): number {
  if (margin <= 0) return 1;
  return clamp01(distanceToEdge / margin);
}

/**
 * How wide the thinning runs: wider for a larger particle, and capped over a small area.
 * Thinned across the whole width there is no thick core left and nothing looks placed at all.
 */
function marginOf(desired: number, span: number): number {
  return Math.min(desired, span * 0.35);
}

function wrap(value: number, span: number): number {
  if (span <= 0) return 0;
  const remainder = value % span;
  return remainder < 0 ? remainder + span : remainder;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
