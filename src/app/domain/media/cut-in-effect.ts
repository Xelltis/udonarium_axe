/**
 * The small, always-running touches a layer can be given.
 *
 * An effect is a function of the clock and nothing else, so the same answer comes out
 * wherever it is asked for: the keyframes handed to the browser, the still frame drawn
 * when nothing may animate, and the canvas the video export paints on.
 */

export const CUT_IN_EFFECTS = ['none', 'glow', 'shadow', 'blink', 'shake', 'pulse', 'float'] as const;
export type CutInEffect = (typeof CUT_IN_EFFECTS)[number];

export interface EffectSample {
  /** Added to where the layer already is, in the cut-in's own coordinates. */
  dx: number;
  dy: number;
  /** Multiplied into the scale and the opacity the layer already has. */
  scaleMul: number;
  opacityMul: number;
  /** How far the light spreads, and how far the shadow falls, in pixels. */
  glowPx: number;
  shadowPx: number;
}

const STILL: EffectSample = { dx: 0, dy: 0, scaleMul: 1, opacityMul: 1, glowPx: 0, shadowPx: 0 };

/** Whether a stored value names one of the running touches a layer can be given. */
export function isCutInEffect(value: unknown): value is CutInEffect {
  return typeof value === 'string' && (CUT_IN_EFFECTS as readonly string[]).includes(value);
}

/** Whether the effect changes as the clock runs, rather than sitting still. */
export function effectMovesOverTime(effect: CutInEffect): boolean {
  return effect === 'blink' || effect === 'shake' || effect === 'pulse' || effect === 'float';
}

/**
 * What an effect does to a layer at a moment on the cut-in's clock.
 *
 * The strength is held between 0 and 3, and one that is not a number reads as 1. At no
 * strength, or for no effect, the layer is left as it is. Blinking ignores the strength.
 */
export function effectAt(effect: CutInEffect, ms: number, strength = 1): EffectSample {
  const force = Number.isFinite(strength) ? Math.min(3, Math.max(0, strength)) : 1;
  if (effect === 'none' || force <= 0) return STILL;

  switch (effect) {
    case 'glow':
      return { ...STILL, glowPx: 10 * force };
    case 'shadow':
      return { ...STILL, shadowPx: 6 * force };
    case 'blink':
      return { ...STILL, opacityMul: ms % 600 < 360 ? 1 : 0.15 };
    case 'shake':
      return { ...STILL, dx: Math.sin(ms / 37) * 4 * force, dy: Math.cos(ms / 29) * 3 * force };
    case 'pulse':
      return { ...STILL, scaleMul: 1 + Math.sin(ms / 260) * 0.07 * force };
    case 'float':
      return { ...STILL, dy: Math.sin(ms / 620) * 8 * force };
    default:
      return STILL;
  }
}

/** The filter an effect asks for, on top of whatever blur the layer already has. */
export function effectFilter(sample: { glowPx: number; shadowPx: number }, colour: string): string[] {
  const parts: string[] = [];
  if (sample.glowPx > 0) parts.push(`drop-shadow(0 0 ${round(sample.glowPx)}px ${colour || '#ffffff'})`);
  if (sample.shadowPx > 0) {
    parts.push(
      `drop-shadow(${round(sample.shadowPx / 2)}px ${round(sample.shadowPx / 2)}px ${round(sample.shadowPx)}px rgba(0, 0, 0, 0.65))`
    );
  }
  return parts;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
