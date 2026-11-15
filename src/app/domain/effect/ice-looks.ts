import { EFFECT_MOTE_OPTIONS, effectMoteOf } from '@axe/domain/effect/effect-motes';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * Which ice a preset strikes with, and when each of them does what it does. Ice that strikes is
 * written one way, as frost, and drawn four: the least of it, of the lowest grade and over no area,
 * is hail driven onto the target; the greatest over an area is the cold that stills all of it at
 * once, and the greatest on its targets alone a pillar of ice that closes each of them in; every
 * other, and the ice another look lands with, freezes its target in a crown of crystals. A whirlwind
 * of ice is a blizzard, and a bolt that lands in ice an icicle, unless it is of another element.
 */

/** The ways ice that strikes is drawn. */
export type FrostLook = 'hail' | 'freeze' | 'zero' | 'coffin';

type Freezing = Pick<EffectPreset, 'effectKind' | 'gradeLevel' | 'areaRadiusCells'>;

/**
 * The ice a frost is drawn as: hail for one of the lowest grade over no area; for one of the
 * highest, the cold that stills an area where it is over one and a pillar that closes its target in
 * where it is not; and a crown of crystals for any other, and for the ice another look lands with.
 */
export function frostLookOf(preset: Freezing): FrostLook {
  if (preset.effectKind !== 'frost') return 'freeze';
  if (preset.gradeLevel === 1) return preset.areaRadiusCells <= 0 ? 'hail' : 'freeze';
  if (preset.gradeLevel === 3) return preset.areaRadiusCells > 0 ? 'zero' : 'coffin';
  return 'freeze';
}

/** The families that have an element other than ice: a shot or a whirlwind of one of them is of that element. */
const OTHER_ELEMENTS: ReadonlySet<string> = new Set(['炎', '雷', '風', '闇', '聖', '状態異常', '土', '回復', '強化']);

type Carrying = Pick<EffectPreset, 'moteStyle' | 'tagName'>;

/** Whether a preset's own choice of particle is frost, where it has chosen one. */
function choosesFrost(preset: Carrying): boolean | null {
  const chosen = preset.moteStyle !== '' && EFFECT_MOTE_OPTIONS.includes(preset.moteStyle);
  return chosen ? effectMoteOf(preset) === 'frost' : null;
}

/**
 * Whether a whirlwind is a blizzard: one that carries frost along its way. Its own choice of
 * particle says first, and with none chosen its family says, and it is a blizzard only in the
 * family of ice. Any other whirlwind is the wind it always was.
 */
export function isBlizzard(preset: Carrying & Pick<EffectPreset, 'effectKind'>): boolean {
  if (preset.effectKind !== 'vortex') return false;
  return choosesFrost(preset) ?? preset.tagName.trim() === '氷';
}

/** Whether an effect is a blizzard on its own, rather than a run with one among its stages. */
export function blowsAsBlizzard(preset: Carrying & Pick<EffectPreset, 'effectKind' | 'isStaged'>): boolean {
  return !preset.isStaged && isBlizzard(preset);
}

/**
 * Whether a shot is an icicle: a bolt that lands in ice, unless what it carries along its way says
 * it is of another element. Its own choice of particle says first, and it is of ice only where that
 * is frost; with none chosen its family says, and it is of ice unless the family has another element
 * of its own, as the family of shots has none. Any other shot is drawn as its look has it.
 */
export function isIceShot(
  preset: Carrying & Pick<EffectPreset, 'effectKind' | 'projectileLook' | 'impactEffectKind'>
): boolean {
  if (preset.effectKind !== 'projectile' || preset.projectileLook !== 'bolt' || preset.impactEffectKind !== 'frost') {
    return false;
  }
  return choosesFrost(preset) ?? !OTHER_ELEMENTS.has(preset.tagName.trim());
}

/** How many great shards hail drives onto its target. */
export const HAIL_SHARDS = 3;
/** When the first great shard of hail strikes at the latest, in seconds, and as a share of a short playback. */
const HAIL_FIRST_S = 0.12;
const HAIL_FIRST_SHARE = 0.1;
/** How long after the first each great shard of hail strikes at the most, in seconds, and as a share of a short playback. */
const HAIL_AFTER_S = [0, 0.2, 0.34] as const;
const HAIL_AFTER_SHARE = [0, 0.12, 0.2] as const;

/**
 * When the great shards of hail strike, in seconds: three of them, the first where `firstAt` says
 * or a little way into its playback, the second a beat after it and the third hard on the second.
 */
export function hailStrikesOf(
  durationS: number,
  firstAt = Math.min(HAIL_FIRST_S, durationS * HAIL_FIRST_SHARE)
): number[] {
  return Array.from(
    { length: HAIL_SHARDS },
    (_unused, shard) => firstAt + Math.min(HAIL_AFTER_S[shard], durationS * HAIL_AFTER_SHARE[shard])
  );
}

/** How long crystals stand at the least before they crack, and where through a playback they start to. */
const STANDS_LEAST_S = 0.45;
const CRACKS_AT_SHARE = 0.62;
/** How long cracks take to climb a crystal, and how long it takes to break from its top down. */
const CLIMBS_S = 0.3;
const BREAKS_S = 0.3;

/** The moments of ice that freezes its target, in seconds of its playback. */
export interface FreezeTiming {
  /** When the crystals burst up about the target. */
  readonly burstsAt: number;
  /** When cracks start to climb them. */
  readonly cracksAt: number;
  /** When they start to break from their tops. */
  readonly breaksAt: number;
  /** When the last of them has fallen. */
  readonly fallenAt: number;
}

/** When ice that freezes its target bursts up at the latest, in seconds, and as a share of a short playback. */
const FREEZE_BURSTS_S = 0.26;
const FREEZE_BURSTS_SHARE = 0.1;

/** The moments of ice that bursts up at a moment of a playback of a length; see {@link FreezeTiming}. */
export function freezeTimingOf(
  durationS: number,
  burstsAt = Math.min(FREEZE_BURSTS_S, durationS * FREEZE_BURSTS_SHARE)
): FreezeTiming {
  const cracksAt = Math.max(burstsAt + STANDS_LEAST_S, durationS * CRACKS_AT_SHARE);
  const breaksAt = cracksAt + CLIMBS_S;
  return { burstsAt, cracksAt, breaksAt, fallenAt: breaksAt + BREAKS_S };
}

/** When the cold that stills an area freezes it at the latest, in seconds, and as a share of a short playback. */
const ZERO_FREEZES_S = 0.5;
const ZERO_FREEZES_SHARE = 0.2;
/** How long an area stands frozen at the least, and where through a playback it is let go. */
const ZERO_HOLDS_LEAST_S = 0.8;
const ZERO_SHATTERS_SHARE = 0.65;

/** The moments of the cold that stills an area, in seconds of its playback. */
export interface ZeroTiming {
  /** When the cold front breaks out of its middle and everything it reaches freezes. */
  readonly freezesAt: number;
  /** When cracks start to run through the ice. */
  readonly cracksAt: number;
  /** When all of it shatters. */
  readonly shattersAt: number;
}

/** The moments of the cold that stills an area, of a playback of a length; see {@link ZeroTiming}. */
export function zeroTimingOf(
  durationS: number,
  freezesAt = Math.min(ZERO_FREEZES_S, durationS * ZERO_FREEZES_SHARE)
): ZeroTiming {
  const shattersAt = Math.max(freezesAt + ZERO_HOLDS_LEAST_S, durationS * ZERO_SHATTERS_SHARE);
  return { freezesAt, cracksAt: shattersAt - Math.min(0.45, (shattersAt - freezesAt) * 0.4), shattersAt };
}

/** When a pillar of ice seals its target in at the latest, in seconds, and as a share of a short playback. */
const COFFIN_SEALS_S = 0.62;
const COFFIN_SEALS_SHARE = 0.2;
/** How long the pillar stands sealed at the least, and where through a playback it shatters. */
const COFFIN_HOLDS_LEAST_S = 0.8;
const COFFIN_SHATTERS_SHARE = 0.66;
/** How many cracks run through the pillar before it shatters, and how far apart, as a share of the time it stands. */
export const COFFIN_CRACKS = 3;
const COFFIN_CRACKS_OVER = 0.55;

/** The moments of a pillar of ice that closes its target in, in seconds of its playback. */
export interface CoffinTiming {
  /** When the pillar closes over the target. */
  readonly sealsAt: number;
  /** When each crack runs through it. */
  readonly cracksAt: readonly number[];
  /** When it shatters. */
  readonly shattersAt: number;
}

/** The moments of a pillar of ice, of a playback of a length; see {@link CoffinTiming}. */
export function coffinTimingOf(
  durationS: number,
  sealsAt = Math.min(COFFIN_SEALS_S, durationS * COFFIN_SEALS_SHARE)
): CoffinTiming {
  const shattersAt = Math.max(sealsAt + COFFIN_HOLDS_LEAST_S, durationS * COFFIN_SHATTERS_SHARE);
  const over = (shattersAt - sealsAt) * COFFIN_CRACKS_OVER;
  const cracksAt = Array.from(
    { length: COFFIN_CRACKS },
    (_unused, crack) => shattersAt - over + (over * crack) / COFFIN_CRACKS
  );
  return { sealsAt, cracksAt, shattersAt };
}

/**
 * When a frost cast on its own strikes its target, in seconds of its playback: hail at each of its
 * great shards; ice that freezes as it bursts up; the cold that stills an area as it freezes and as
 * it shatters; and a pillar as it seals and as it shatters.
 */
export function frostStrikesOf(preset: Freezing, durationS: number): number[] {
  switch (frostLookOf(preset)) {
    case 'hail':
      return hailStrikesOf(durationS);
    case 'zero': {
      const timing = zeroTimingOf(durationS);
      return [timing.freezesAt, timing.shattersAt];
    }
    case 'coffin': {
      const timing = coffinTimingOf(durationS);
      return [timing.sealsAt, timing.shattersAt];
    }
    default:
      return [freezeTimingOf(durationS).burstsAt];
  }
}

/** How long a blizzard takes to wind up about its target, and to blow itself out, in seconds. */
const BLIZZARD_WINDS_UP_S = 0.45;
const BLIZZARD_BLOWS_OUT_S = 0.7;
/** How long before the end of its playback a blizzard starts to blow itself out, in seconds. */
const BLIZZARD_FAILS_BEFORE_END_S = 0.4;

/** The moments of a blizzard, in seconds of its playback. */
export interface BlizzardTiming {
  /** When it blows whole about its target. */
  readonly blowsAt: number;
  /** When it starts to fail, and when it is gone. */
  readonly failsAt: number;
  readonly goneAt: number;
}

/** The moments of a blizzard of a playback of a length: one too short to do both winds up and fails in halves of it. */
export function blizzardTimingOf(durationS: number): BlizzardTiming {
  const failsAt = Math.max(durationS * 0.5, durationS - BLIZZARD_FAILS_BEFORE_END_S);
  return { blowsAt: Math.min(BLIZZARD_WINDS_UP_S, durationS * 0.5), failsAt, goneAt: failsAt + BLIZZARD_BLOWS_OUT_S };
}
