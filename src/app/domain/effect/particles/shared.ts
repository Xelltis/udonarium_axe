export { clamp01, fadeInOut, seededRandom } from '@axe/domain/effect/timeline/shared';
import { clamp01 } from '@axe/domain/effect/timeline/shared';
/**
 * The shared groundwork.
 *
 * Only the shape of one particle and the smoothing of colour and time. It refers to no family of effects.
 */

export type ParticleShape = 'glow' | 'streak' | 'smoke' | 'chunk' | 'bubble';

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

/** The ramp from white heat through the light colour to the dark. It always passes through white, since it is the difference in brightness that catches the eye. */
export interface ColorRamp {
  hot: string;
  mid: string;
  cool: string;
}

export const HOT = '#ffffff';

/** The colour of flame, falling from white heat through the light and dark colours towards smoke. */
export function flameColor(local: number, ramp: ColorRamp): string {
  if (local < 0.2) return ramp.hot;
  if (local < 0.55) return ramp.mid;
  return ramp.cool;
}

/** Eases a 0 to 1 progress so it starts fast and slows to a stop; input outside that range is clamped. */
export function easeOutQuad(value: number): number {
  const clamped = clamp01(value);
  return 1 - (1 - clamped) * (1 - clamped);
}
