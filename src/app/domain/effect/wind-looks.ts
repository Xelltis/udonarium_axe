import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * Which wind a preset blows. A whirlwind is written one way, as a vortex, and drawn two: the least of
 * them, of the lowest grade and over no area, is a gust thrown from its caster onto the target, and
 * every other is a tornado standing over it; one told to carry lightning is a storm, a tornado crowned
 * with a thundercloud. A bolt that lands in a whirlwind is a shot of wind, a knot of air that bursts
 * where it lands, unless it is of another element, and a crescent thrown that lands in one is a wave of
 * the void. A cut of the family of wind is made of sickles of wind.
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

/** Whether a whirlwind is a storm: one whose own choice of particle is lightning, whatever its grade. */
export function isStormWind(preset: Pick<EffectPreset, 'effectKind' | 'moteStyle'>): boolean {
  return preset.effectKind === 'vortex' && preset.moteStyle.trim() === 'arc';
}

/** Whether an effect is a storm on its own, rather than a run with one among its stages. */
export function blowsAsStorm(preset: Pick<EffectPreset, 'effectKind' | 'moteStyle' | 'isStaged'>): boolean {
  return !preset.isStaged && isStormWind(preset);
}

/** Whether an effect is a gust on its own, rather than a run with one among its stages or a storm. */
export function isGust(preset: Whirling & Pick<EffectPreset, 'isStaged' | 'moteStyle'>): boolean {
  return !preset.isStaged && preset.effectKind === 'vortex' && windLookOf(preset) === 'gust' && !isStormWind(preset);
}

/** Whether an effect is a tornado on its own, rather than a run with one among its stages or a storm. */
export function isTornado(preset: Whirling & Pick<EffectPreset, 'isStaged' | 'moteStyle'>): boolean {
  return !preset.isStaged && preset.effectKind === 'vortex' && windLookOf(preset) === 'tornado' && !isStormWind(preset);
}

/**
 * When a storm's lightning strikes, in seconds and at the most as a share of its playback: three
 * strokes once its cloud has gathered, the last two close together.
 */
const STORM_STRIKES: readonly (readonly [seconds: number, share: number])[] = [
  [0.9, 0.27],
  [1.58, 0.48],
  [2.02, 0.61],
];
/** How long after it starts the thunder a storm lands with first cracks, in seconds. */
const THUNDER_CRACKS_AFTER_S = 0.28;

/** When a storm's lightning strikes, in seconds of a playback of a length, earliest first. */
export function stormStrikesOf(durationS: number): number[] {
  return STORM_STRIKES.map(([seconds, share]) => Math.min(seconds, durationS * share));
}

/** Where through its playback the landing of a storm sounds, as a share of it: its thunder cracking as the first stroke strikes. */
export function stormSoundsAt(
  preset: Pick<EffectPreset, 'effectKind' | 'moteStyle'>,
  durationS: number
): number | undefined {
  if (!isStormWind(preset) || durationS <= 0) return undefined;
  return Math.max(0, stormStrikesOf(durationS)[0] - THUNDER_CRACKS_AFTER_S) / durationS;
}

/**
 * Whether a cut is made of sickles of wind: its own choice of particle says first, and it is of wind
 * only where that is leaves; with none chosen it is of wind in the family of wind alone.
 */
export function cutsAsWind(preset: Pick<EffectPreset, 'effectKind' | 'moteStyle' | 'tagName'>): boolean {
  if (preset.effectKind !== 'slash') return false;
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? effectMoteOf(preset) === 'leaf' : preset.tagName.trim() === '風';
}

/** Whether a shot is a wave of the void: a crescent thrown that lands in a whirlwind. */
export function fliesAsVacuum(
  preset: Pick<EffectPreset, 'effectKind' | 'projectileLook' | 'impactEffectKind'>
): boolean {
  return (
    preset.effectKind === 'projectile' && preset.projectileLook === 'crescent' && preset.impactEffectKind === 'vortex'
  );
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
