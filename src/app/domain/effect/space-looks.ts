import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of space and time are told apart by, and when each of them comes to its beat. A warp
 * is written one way and drawn two: below the highest grade a piece blinks out of where it stands and
 * back, space folding shut on it at a seam of light; at the highest a circle is written on the floor and
 * what is called comes up through it. Gravity is written one way and drawn two as well: below the
 * highest grade a lens of black hangs over its target and crushes it into the floor; at the highest a
 * singularity opens over the table, drags all it takes in round it, and falls in on itself.
 */

/** What a warp is drawn as: a blink out and back, or a summoning. */
export type WarpLook = 'blink' | 'summon';
/** What gravity is drawn as: a crush, or a singularity. */
export type GravityLook = 'crush' | 'singularity';

type Graded = Pick<EffectPreset, 'gradeLevel'>;
type Lone = Pick<EffectPreset, 'isStaged' | 'effectKind' | 'gradeLevel'>;

/** What a warp is drawn as, by its grade: a summoning at the highest, and a blink below it. */
export function warpLookOf(preset: Graded): WarpLook {
  return preset.gradeLevel === 3 ? 'summon' : 'blink';
}

/** What gravity is drawn as, by its grade: a singularity at the highest, and a crush below it. */
export function gravityLookOf(preset: Graded): GravityLook {
  return preset.gradeLevel === 3 ? 'singularity' : 'crush';
}

/**
 * When each look comes to its beat, in seconds, and at the most as a share of its playback: a blink as
 * it snaps shut, a summoning as what it calls arrives, a crush as it comes down, and a singularity as
 * it falls in on itself.
 */
const BEATS: Record<WarpLook | GravityLook, readonly [seconds: number, share: number]> = {
  blink: [0.86, 0.62],
  summon: [1.92, 0.55],
  crush: [0.58, 0.33],
  singularity: [1.5, 0.4],
};

/** How long a crush holds its target down after it comes down, in seconds, and at the most as a share of its playback. */
const CRUSH_HOLDS: readonly [seconds: number, share: number] = [0.56, 0.3];

/** When a look of space and time comes to its beat, in seconds of a playback of a length. */
export function spaceBeatAt(look: WarpLook | GravityLook, durationS: number): number {
  const [seconds, share] = BEATS[look];
  return Math.min(seconds, durationS * share);
}

/** When a crush lets its target go, in seconds of a playback of a length: some while after it comes down. */
export function crushLetsGoAt(durationS: number): number {
  const [seconds, share] = CRUSH_HOLDS;
  return spaceBeatAt('crush', durationS) + Math.min(seconds, durationS * share);
}

/**
 * When gravity strikes, in seconds of a playback of a length: as a crush comes down or a singularity
 * falls in on itself. Nothing for a look of any other kind; a warp strikes nothing.
 */
export function spaceStrikesAt(kind: EffectKind, grade: 1 | 2 | 3, durationS: number): number[] | undefined {
  if (kind !== 'gravity') return undefined;
  return [spaceBeatAt(gravityLookOf({ gradeLevel: grade }), durationS)];
}

/** Where through its playback the landing of gravity sounds, as a share of it; nothing for any other look. */
export function spaceSoundsAt(kind: EffectKind, grade: 1 | 2 | 3, durationS: number): number | undefined {
  const strikes = spaceStrikesAt(kind, grade, durationS);
  return strikes && durationS > 0 ? strikes[0] / durationS : undefined;
}

/** Whether an effect on its own is a look of space and time, which moves the pieces it is cast on in its own way. */
export function movesAsSpace(preset: Lone): boolean {
  return !preset.isStaged && (preset.effectKind === 'warp' || preset.effectKind === 'gravity');
}
