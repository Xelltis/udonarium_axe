import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of earth are told apart by, and when each of them does what it does. A bolt that
 * lands in rubble is a shot of rock, a boulder thrown that breaks where it lands, unless it is of
 * another element. Rubble heaves the ground three times, and an upheaval runs to its target, bursts
 * up under it, stands and breaks; both throw what stands over them up rather than back. A quake tears
 * a rift from its caster to its target below the highest grade, and at the highest over an area
 * heaves the ground of all of it three times.
 */

/** The families that have an element other than earth: a shot of one of them is of that element, whatever it lands in. */
const OTHER_ELEMENTS: ReadonlySet<string> = new Set(['炎', '氷', '雷', '風', '闇', '聖', '状態異常', '回復', '強化']);
/** The particles of the other elements: a shot that carries one of them along its way is of that element. */
const OTHER_MOTES: ReadonlySet<string> = new Set(['frost', 'arc', 'leaf', 'haze']);

/**
 * Whether a shot is a shot of rock: a bolt that lands in rubble, unless what it carries along its
 * way says it is of another element. Its own choice of particle says first, and it is of rock unless
 * that is the particle of another element; with none chosen its family says, and it is of rock unless
 * the family has another element of its own. Any other shot is drawn as its look has it.
 */
export function isRockShot(preset: EffectPreset): boolean {
  if (preset.effectKind !== 'projectile' || preset.projectileLook !== 'bolt' || preset.impactEffectKind !== 'rubble') {
    return false;
  }
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? !OTHER_MOTES.has(effectMoteOf(preset)) : !OTHER_ELEMENTS.has(preset.tagName.trim());
}

/** How many times rubble heaves the ground. */
export const RUBBLE_HEAVES = 3;
/** Where through its playback rubble first heaves, as a share of it. */
export const RUBBLE_FIRST_HEAVE = 0.08;
/** How long rubble leaves between its heaves at the most, in seconds, and as a share of what is left of a short playback. */
const HEAVE_GAP_S = 0.3;
const HEAVE_GAP_SHARE = 0.15;

/**
 * When rubble heaves the ground, in seconds: three times, the first where `firstAt` says or a
 * little way into its playback, the others a beat apart after it, closer in a playback too short for
 * that.
 */
export function rubbleHeavesOf(durationS: number, firstAt = durationS * RUBBLE_FIRST_HEAVE): number[] {
  const gap = Math.max(0.05, Math.min(HEAVE_GAP_S, (durationS - firstAt) * HEAVE_GAP_SHARE));
  return Array.from({ length: RUBBLE_HEAVES }, (_unused, heave) => firstAt + gap * heave);
}

/** How long the fangs of an upheaval take to run from its caster to its target at the most, in seconds, and as a share of the time before it bursts. */
const RUN_S = 0.35;
const RUN_SHARE = 0.6;
/** How long the pillars of an upheaval stand at the least, and where through its playback they start to break. */
const STANDS_LEAST_S = 0.8;
const BREAKS_AT_SHARE = 0.65;
/** How long light takes to climb the cracks of a pillar, how long it takes to break from its top down, and to sink away. */
const CLIMBS_S = 0.35;
const BREAKS_S = 0.35;
const SINKS_S = 0.5;

/** The moments of an upheaval, in seconds of its playback. */
export interface UpheavalTiming {
  /** When the first fang breaks the ground before its caster. */
  readonly runsAt: number;
  /** When the great pillar bursts up under the target. */
  readonly burstsAt: number;
  /** When light starts to climb the cracks of the pillars. */
  readonly cracksAt: number;
  /** When the pillars start to break from their tops. */
  readonly breaksAt: number;
  /** When the last of them has sunk away. */
  readonly sunkAt: number;
}

/** The moments of an upheaval that bursts at a moment of a playback of a length; see {@link UpheavalTiming}. */
export function upheavalTimingOf(durationS: number, burstsAt: number): UpheavalTiming {
  const cracksAt = Math.max(burstsAt + STANDS_LEAST_S, durationS * BREAKS_AT_SHARE);
  const breaksAt = cracksAt + CLIMBS_S;
  return {
    runsAt: burstsAt - Math.min(RUN_S, burstsAt * RUN_SHARE),
    burstsAt,
    cracksAt,
    breaksAt,
    sunkAt: breaksAt + BREAKS_S + SINKS_S,
  };
}

/**
 * Whether an effect heaves the ground under what it strikes, on its own rather than as a stage of a
 * run: rubble, an upheaval or a quake, which throws a piece up off the floor rather than back from
 * its caster.
 */
export function heavesGround(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return (
    !preset.isStaged &&
    (preset.effectKind === 'rubble' || preset.effectKind === 'upheaval' || preset.effectKind === 'quake')
  );
}

/** What a quake is drawn as: a rift torn from its caster to its target, or the ground of an area heaving. */
export type QuakeLook = 'rift' | 'quake';

type Quaking = Pick<EffectPreset, 'effectKind' | 'gradeLevel' | 'areaRadiusCells'>;

/** What a quake is drawn as: the ground of an area heaving at the highest grade over an area, and a rift otherwise. */
export function quakeLookOf(preset: Pick<EffectPreset, 'gradeLevel' | 'areaRadiusCells'>): QuakeLook {
  return preset.gradeLevel === 3 && preset.areaRadiusCells > 0 ? 'quake' : 'rift';
}

/**
 * When a quake strikes, in seconds and at the most as a share of its playback: a rift as it reaches
 * its target, and the ground of an area at each of its three great heaves.
 */
const QUAKE_STRIKES: Record<QuakeLook, readonly (readonly [seconds: number, share: number])[]> = {
  rift: [[0.3, 0.14]],
  quake: [
    [0.42, 0.09],
    [1.88, 0.38],
    [2.68, 0.54],
  ],
};
/** How long before a quake first strikes its landing sounds, in seconds: the crack of rock peaks that much after it starts. */
const QUAKE_SOUNDS_BEFORE_S = 0.1;

/** When a quake strikes, in seconds of a playback of a length, earliest first; nothing for a look of any other kind. */
export function quakeStrikesOf(preset: Quaking, durationS: number): number[] | undefined {
  if (preset.effectKind !== 'quake') return undefined;
  return QUAKE_STRIKES[quakeLookOf(preset)].map(([seconds, share]) => Math.min(seconds, durationS * share));
}

/** Where through its playback the landing of a quake sounds, as a share of it; nothing for any other kind. */
export function quakeSoundsAt(preset: Quaking, durationS: number): number | undefined {
  const strikes = quakeStrikesOf(preset, durationS);
  return strikes && durationS > 0 ? Math.max(0, strikes[0] - QUAKE_SOUNDS_BEFORE_S) / durationS : undefined;
}
