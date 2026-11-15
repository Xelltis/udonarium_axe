import type { CurseLook } from '@axe/domain/effect/ailment-looks';

/** How often the heart of each look that keeps a beat beats, in seconds: a pulse, a tick, a squeeze. */
export const AILMENT_BEAT_S: Record<CurseLook, number> = {
  poison: 0.8,
  bleed: 0.76,
  burn: 0.6,
  sleep: 0.9,
  petrify: 0.7,
  confuse: 0.66,
  charm: 0.8,
  fear: 1.05,
  blind: 1,
  silence: 0.7,
  slow: 0.9,
  bind: 1.1,
  shock: 0.42,
  curse: 0.9,
};
