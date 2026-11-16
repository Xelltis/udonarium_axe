import { type EffectKind } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of darkness are told apart by, and when each of them strikes. What rises out of a
 * shadow is written one way and drawn two: below the highest grade black spikes stab up out of the
 * target's own shadow, and at the highest a mire opens over the floor and hands of shadow rise out of
 * it, seize all it has caught and drag at them until it closes. A black sun is written one way and
 * drawn two as well: below the highest grade a sphere clamps onto its target, drinks the light about
 * it, falls in on itself and bursts; at the highest it hangs over the table as an eclipse, needles of
 * pale light fall from its rim and its corona flares. A draining hooks its target, pulls the life out
 * of it for as long as it holds, and snaps.
 */

/** What rises out of a shadow: spikes, or a mire of hands. */
export type ShadowLook = 'spike' | 'abyss';
/** What a black sun is drawn as: a sphere on its target, or an eclipse over the table. */
export type OrbLook = 'orb' | 'eclipse';

type Graded = Pick<EffectPreset, 'gradeLevel'>;
type Lone = Pick<EffectPreset, 'isStaged' | 'effectKind' | 'gradeLevel'>;

/** What rises out of a shadow, by its grade: a mire of hands at the highest, and spikes below it. */
export function shadowLookOf(preset: Graded): ShadowLook {
  return preset.gradeLevel === 3 ? 'abyss' : 'spike';
}

/** What a black sun is drawn as, by its grade: an eclipse at the highest, and a sphere below it. */
export function orbLookOf(preset: Graded): OrbLook {
  return preset.gradeLevel === 3 ? 'eclipse' : 'orb';
}

/**
 * When each look strikes, in seconds, and at the most as a share of its playback: spikes as they stab,
 * a mire as its hands seize and again as it closes, a sphere as it bursts, an eclipse as its corona
 * flares, and a draining as it hooks and as it snaps.
 */
const STRIKES: Record<ShadowLook | OrbLook | 'drain', readonly (readonly [seconds: number, share: number])[]> = {
  spike: [[0.5, 0.42]],
  abyss: [
    [1, 0.3],
    [2.95, 0.72],
  ],
  orb: [[1.74, 0.5]],
  eclipse: [[2.62, 0.63]],
  drain: [
    [0.42, 0.13],
    [2.02, 0.625],
  ],
};

function lookOf(kind: EffectKind, grade: 1 | 2 | 3): keyof typeof STRIKES | undefined {
  if (kind === 'shadow') return shadowLookOf({ gradeLevel: grade });
  if (kind === 'darkorb') return orbLookOf({ gradeLevel: grade });
  return kind === 'drain' ? 'drain' : undefined;
}

/**
 * When a look of darkness strikes, in seconds of a playback of a length, earliest first. Nothing for
 * a look of any other kind.
 */
export function darkStrikesAt(kind: EffectKind, grade: 1 | 2 | 3, durationS: number): number[] | undefined {
  const look = lookOf(kind, grade);
  return look && STRIKES[look].map(([seconds, share]) => Math.min(seconds, durationS * share));
}

/** Where through its playback the landing of a look of darkness sounds, as a share of it; nothing for any other. */
export function darkSoundsAt(kind: EffectKind, grade: 1 | 2 | 3, durationS: number): number | undefined {
  if (kind === 'drain') return undefined;
  const strikes = darkStrikesAt(kind, grade, durationS);
  return strikes && durationS > 0 ? strikes[0] / durationS : undefined;
}

/** Whether an effect stabs up out of the floor under what it strikes, on its own: spikes of shadow, which lift a piece. */
export function stabsFromBelow(preset: Lone): boolean {
  return !preset.isStaged && preset.effectKind === 'shadow' && shadowLookOf(preset) === 'spike';
}

/** Whether an effect comes down on what it strikes from over it, on its own: an eclipse, which presses a piece down. */
export function fallsAsEclipse(preset: Lone): boolean {
  return !preset.isStaged && preset.effectKind === 'darkorb' && orbLookOf(preset) === 'eclipse';
}
