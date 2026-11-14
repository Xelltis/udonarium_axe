import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/** How long a breath is drawn in before it bursts out, in seconds, and at the most as a share of its playback. */
const INHALES_S = 0.25;
const INHALES_AT_MOST = 0.15;
/** How long the front of the stream takes from the mouth to the furthest it reaches, in seconds. */
const REACHES_IN_S = 0.15;
/** The share of its playback a breath is blown for before it fails. */
const BLOWN_FOR = 0.8;
/** How long a failing breath takes to thin away at the mouth, in seconds. */
const TAPERS_S = 0.3;
/** How many times a second a breath surges, and how far it sinks between surges, as a share of its full force. */
const SURGES_HZ = 3;
const SURGE_DEPTH = 0.15;
/** The family a breath that heals is of: it is breathed gently, pushes nothing and burns nothing. */
const HEALING_TAG = '回復';

/**
 * The moments of a breath on its own clock, in seconds: it is drawn in until it bursts, its front
 * reaches the furthest it goes, it is blown steadily until it fails, and it has thinned away at the
 * mouth once it is spent; the last of the stream runs on after that.
 */
export interface BreathTiming {
  readonly burstsAt: number;
  readonly reachesAt: number;
  readonly failsAt: number;
  readonly spentAt: number;
}

/** The moments of a breath that plays for a length, in seconds. */
export function breathTimingOf(durationS: number): BreathTiming {
  const burstsAt = Math.min(INHALES_S, durationS * INHALES_AT_MOST);
  const reachesAt = burstsAt + REACHES_IN_S;
  const failsAt = Math.max(durationS * BLOWN_FOR, reachesAt + 0.2);
  return { burstsAt, reachesAt, failsAt, spentAt: failsAt + TAPERS_S };
}

/**
 * How hard a breath blows at a moment of its own clock, as a share of its full force: it surges a
 * few times a second and never blows evenly, however long it is blown for.
 */
export function breathSurgeAt(seconds: number, seed: number): number {
  const phase = (seed % 97) * 0.13;
  const wave = 0.7 * Math.sin(seconds * Math.PI * 2 * SURGES_HZ + phase) + 0.3 * Math.sin(seconds * 17.3 + phase * 2.1);
  return 1 - SURGE_DEPTH * (0.5 - 0.5 * wave);
}

/** Whether a breath is one that heals, breathed gently over those it is meant for rather than blown at them. */
export function isGentleBreath(preset: Pick<EffectPreset, 'tagName'>): boolean {
  return preset.tagName.trim() === HEALING_TAG;
}
