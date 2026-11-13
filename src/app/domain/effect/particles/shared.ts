import { clamp01 } from '@axe/core/util/clamp';

export { clamp01 };
export { seededRandom } from '@axe/core/util/seeded-random';
/*
 * The particles the weather and the ambience lay onto a canvas: the shape of one, the canvas they
 * lie on, and the smoothing of their time.
 */

/**
 * How a particle is drawn. A glow, a streak and a bubble are light, added over what is drawn; a puff,
 * smoke and a chunk are colour, laid over it: a fireball is a body of flame, coloured to its edge,
 * with only its heart and its sparks giving light, or the light of its many puffs runs together into
 * a white the colour is lost in.
 */
export type ParticleShape = 'glow' | 'streak' | 'smoke' | 'chunk' | 'bubble' | 'puff';

export interface EffectParticle {
  x: number;
  y: number;
  size: number;
  /** Used for a streak alone: which way it travels. */
  angle: number;
  /** How far a streak is drawn out. At one it is a circle. */
  stretch: number;
  color: string;
  alpha: number;
  shape: ParticleShape;
}

export interface EffectParticleLayer {
  /** How large the canvas is. */
  width: number;
  height: number;
  /** Where the feet of the target fall on it. */
  originX: number;
  originY: number;
  particles: EffectParticle[];
}

/** White heat, which the hottest particles are drawn in. */
export const HOT = '#ffffff';

/**
 * It rises to full over the given share and falls away over the rest. A progress that is not a
 * number falls back to nothing, rather than slipping past the guard that keeps a particle unmade.
 */
export function fadeInOut(value: number, rise: number): number {
  const clamped = clamp01(value);
  if (clamped < rise) return clamped / rise;
  return 1 - (clamped - rise) / (1 - rise);
}
