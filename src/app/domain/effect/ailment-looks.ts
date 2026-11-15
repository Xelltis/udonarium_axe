import { effectMoteOf } from '@axe/domain/effect/effect-motes';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * The looks a curse takes for a state a piece is put in: asleep, bound, turned to stone.
 *
 * Each is told by the particles the effect names, as the element of a breath is, and not by a kind
 * of its own: a room shared with a version of the tool that has never heard of one reads the name as
 * no choice at all and falls back on the family's particles, so there the effect plays as the plain
 * curse it always was rather than as nothing.
 */

/** The looks of a curse that are a state of their own, by the name each is stored under. */
export const AILMENT_LOOKS = [
  'poison',
  'bleed',
  'burn',
  'sleep',
  'petrify',
  'confuse',
  'charm',
  'fear',
  'blind',
  'silence',
  'slow',
  'bind',
] as const;

/** A look of a curse that is a state of its own. */
export type AilmentLook = (typeof AILMENT_LOOKS)[number];

/** What a curse is drawn as: one of the states, a paralysis, which is a curse run through by a current, or the curse itself. */
export type CurseLook = AilmentLook | 'shock' | 'curse';

/** Whether a stored choice of particles names a state. */
export function isAilmentLook(value: unknown): value is AilmentLook {
  return AILMENT_LOOKS.includes(value as AilmentLook);
}

/**
 * What a curse is drawn as: the state its particles name; a paralysis where they are a current,
 * named outright or given by its family; and the curse itself for anything else.
 */
export function curseLookOf(preset: Pick<EffectPreset, 'moteStyle' | 'tagName'>): CurseLook {
  if (isAilmentLook(preset.moteStyle)) return preset.moteStyle;
  return effectMoteOf(preset) === 'arc' ? 'shock' : 'curse';
}

/** Whether an effect is a curse on its own, rather than a run with one among its stages. */
export function isCurseAlone(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && preset.effectKind === 'curse';
}

/** How long into each look it takes hold of its target, in seconds, and the most of its length that may be. */
const TAKES_HOLD_S: Record<CurseLook, number> = {
  poison: 0.3,
  bleed: 0.18,
  burn: 0.24,
  sleep: 0.62,
  petrify: 0.78,
  confuse: 0.3,
  charm: 0.32,
  fear: 0.4,
  blind: 0.3,
  silence: 0.3,
  slow: 0.42,
  bind: 0.9,
  shock: 0.12,
  curse: 0.4,
};
const TAKES_HOLD_BY = 0.56;

/**
 * When a curse takes hold of its target, in seconds of its playback: the instant the band shuts over
 * the eyes, the vines draw tight or the stone closes over the head, at which everything holds still.
 * A look given less time than it wants takes hold a little past its middle.
 */
export function takesHoldAt(look: CurseLook, durationS: number): number {
  return Math.min(TAKES_HOLD_S[look], durationS * TAKES_HOLD_BY);
}
