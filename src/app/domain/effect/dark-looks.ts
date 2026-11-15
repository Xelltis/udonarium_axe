import { type EffectKind } from '@axe/domain/effect/effect-kind';

/*
 * When the looks of darkness strike. A draining hooks its target, pulls the life out of it for as
 * long as it holds, and snaps.
 */

/**
 * When each look strikes, in seconds, and at the most as a share of its playback: a draining as it
 * hooks and as it snaps.
 */
const STRIKES: Record<'drain', readonly (readonly [seconds: number, share: number])[]> = {
  drain: [
    [0.42, 0.13],
    [2.02, 0.625],
  ],
};

/**
 * When a look of darkness strikes, in seconds of a playback of a length, earliest first. Nothing for
 * a look of any other kind.
 */
export function darkStrikesAt(kind: EffectKind, _grade: 1 | 2 | 3, durationS: number): number[] | undefined {
  if (kind !== 'drain') return undefined;
  return STRIKES[kind].map(([seconds, share]) => Math.min(seconds, durationS * share));
}
