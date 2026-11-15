import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * Which wind a preset blows. A whirlwind is written one way, as a vortex, and drawn two: the least of
 * them, of the lowest grade and over no area, is a gust thrown from its caster onto the target, and
 * every other is a tornado standing over it. A bolt that lands in a whirlwind is a shot of wind, a knot
 * of air that bursts where it lands, unless it is of another element.
 */

/** The winds a vortex is drawn as. */
export type WindLook = 'gust' | 'tornado';

type Whirling = Pick<EffectPreset, 'effectKind' | 'gradeLevel' | 'areaRadiusCells'>;

/**
 * The wind a vortex is drawn as: a gust for one of the lowest grade over no area, and a tornado for
 * any other, and for the whirlwind another look lands with.
 */
export function windLookOf(preset: Whirling): WindLook {
  return preset.effectKind === 'vortex' && preset.gradeLevel === 1 && preset.areaRadiusCells <= 0 ? 'gust' : 'tornado';
}

/** Whether an effect is a gust on its own, rather than a run with one among its stages. */
export function isGust(preset: Whirling & Pick<EffectPreset, 'isStaged'>): boolean {
  return !preset.isStaged && preset.effectKind === 'vortex' && windLookOf(preset) === 'gust';
}

/** Whether an effect is a tornado on its own, rather than a run with one among its stages. */
export function isTornado(preset: Whirling & Pick<EffectPreset, 'isStaged'>): boolean {
  return !preset.isStaged && preset.effectKind === 'vortex' && windLookOf(preset) === 'tornado';
}

/** The families that have an element of their own: a shot of one of them is of that element, whatever it lands in. */
const OTHER_ELEMENTS: ReadonlySet<string> = new Set(['炎', '氷', '雷', '闇', '聖', '状態異常', '土', '回復', '強化']);

/**
 * Whether a shot is a shot of wind: a bolt that lands in a whirlwind, unless what it carries along
 * its way says it is of another element. Its own choice of particle says first, and it is of wind
 * only where that is leaves; with none chosen its family says, and it is of wind unless the family
 * has an element of its own, as the family of shots has none. Any other shot is drawn as its look has it.
 */
export function isWindShot(preset: EffectPreset): boolean {
  if (preset.effectKind !== 'projectile' || preset.projectileLook !== 'bolt' || preset.impactEffectKind !== 'vortex') {
    return false;
  }
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? effectMoteOf(preset) === 'leaf' : !OTHER_ELEMENTS.has(preset.tagName.trim());
}

/** How long a gust gathers at its caster's feet before it is thrown, in seconds. */
const GUST_GATHERS_S = 0.1;
/** How long the wall of a gust takes to cross from its caster to its target, in seconds. */
const GUST_CROSSES_S = 0.25;
/** The latest a gust strikes its target, as a share of its playback, however short that is. */
const GUST_STRIKES_BY = 0.45;

/** When a gust is thrown and when its wall strikes the target, in seconds of its playback. */
export function gustTimingOf(durationS: number): { readonly thrownAt: number; readonly strikesAt: number } {
  const strikesAt = Math.min(GUST_GATHERS_S + GUST_CROSSES_S, durationS * GUST_STRIKES_BY);
  return { thrownAt: strikesAt * (GUST_GATHERS_S / (GUST_GATHERS_S + GUST_CROSSES_S)), strikesAt };
}

/** How long a tornado takes to rise from the swirl on the ground, and to thin away, in seconds. */
const TORNADO_RISES_S = 0.5;
const TORNADO_THINS_S = 0.6;
/** How long before the end of its playback a tornado starts to thin, in seconds. */
const TORNADO_THINS_BEFORE_END_S = 0.3;

/**
 * When a tornado stands whole and when it starts to thin and is gone, in seconds of its playback: one
 * too short to do both rises and thins in halves of it.
 */
export function tornadoTimingOf(durationS: number): {
  readonly risenAt: number;
  readonly thinsAt: number;
  readonly goneAt: number;
} {
  const thinsAt = Math.max(durationS * 0.5, durationS - TORNADO_THINS_BEFORE_END_S);
  return { risenAt: Math.min(TORNADO_RISES_S, durationS * 0.5), thinsAt, goneAt: thinsAt + TORNADO_THINS_S };
}
