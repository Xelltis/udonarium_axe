import { type EffectPreset } from '@axe/domain/effect/effect-preset';

/*
 * What the looks of lightning are told apart by, and when each of them strikes. A bolt is written one
 * way and drawn three: at the lowest grade it snaps from its caster's hand onto the target, or drops a
 * short way out of the air where there is no caster; at the middle grade a leader feels its way down
 * from the sky and the bolt comes back up it; and at the highest a storm gathers, a column of
 * lightning stands on the target and ends in one last stroke. A current of lightning on one target
 * holds between it and its caster, and on two or more it chains from each to the next.
 */

/** The lightnings a bolt is drawn as. */
export type BoltLook = 'snap' | 'strike' | 'storm';

/** The lightning a bolt is drawn as, by its grade: a snap, a strike out of the sky, and a storm. */
export function boltLookOf(preset: Pick<EffectPreset, 'gradeLevel'>): BoltLook {
  return preset.gradeLevel === 1 ? 'snap' : preset.gradeLevel === 3 ? 'storm' : 'strike';
}

/** How long each bolt is seen coming before it strikes, in seconds, and at the most as a share of its playback. */
const COMES_FOR: Record<BoltLook, readonly [seconds: number, share: number]> = {
  snap: [0.08, 0.1],
  strike: [0.2, 0.2],
  storm: [0.55, 0.3],
};
/** How long the column of a storm stands before its last stroke, in seconds, and at the most as a share of what is left of its playback. */
const STANDS_S = 1;
const STANDS_SHARE = 0.45;

/**
 * When a bolt strikes, in seconds of a playback of a length: once, after its leader, and a storm a
 * second time, the last stroke its column ends in.
 */
export function boltStrokesOf(grade: 1 | 2 | 3, durationS: number): number[] {
  const look = boltLookOf({ gradeLevel: grade });
  const [seconds, share] = COMES_FOR[look];
  const first = Math.min(seconds, durationS * share);
  return look === 'storm' ? [first, stormEndsAt(durationS, first)] : [first];
}

/** When the column of a storm that struck at a moment ends in its last stroke, in seconds of a playback of a length. */
export function stormEndsAt(durationS: number, struckAt: number): number {
  return struckAt + Math.min(STANDS_S, Math.max(0, durationS - struckAt) * STANDS_SHARE);
}

/** Where through its playback a current of lightning reaches its target, as a share of it. */
export const CURRENT_REACHES_AT = 0.1;
/** Where through its playback a current of lightning lets go of its target, as a share of it. */
export const CURRENT_BREAKS_AT = 0.78;

/** Whether an effect is a bolt or a current of lightning on its own, rather than a run with one among its stages. */
export function isLightning(preset: Pick<EffectPreset, 'isStaged' | 'effectKind'>): boolean {
  return !preset.isStaged && (preset.effectKind === 'bolt' || preset.effectKind === 'arc');
}
