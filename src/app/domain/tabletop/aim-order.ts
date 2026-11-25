import type { BattleSide } from '@axe/domain/battle/battle-lineup';

/**
 * A piece as the order it is aimed at in reads it: where it stands in the room, its height above the
 * floor plan included, the side of the fight it is on, and the piece it is one with, its body for a
 * part and itself for any other.
 */
export interface AimCandidate {
  readonly identifier: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly side: BattleSide | null;
  readonly whole: string;
}

/**
 * The order the pieces are aimed at in, one at a time, from a piece: the pieces of the other side of
 * the fight where the piece stands on one, else every piece but those it is one with (itself, its
 * parts, its body), nearest first in the room, and of two as near the one first in the room. With no
 * piece to go from, every piece, in the order of the room.
 */
export function aimOrder(from: AimCandidate | null, candidates: readonly AimCandidate[]): string[] {
  if (!from) return candidates.map((candidate) => candidate.identifier);
  const opposed = (candidate: AimCandidate) =>
    candidate.whole !== from.whole && (from.side === null || (candidate.side !== null && candidate.side !== from.side));
  const distance = (candidate: AimCandidate) =>
    Math.hypot(candidate.x - from.x, candidate.y - from.y, candidate.z - from.z);
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => opposed(candidate))
    .sort((a, b) => distance(a.candidate) - distance(b.candidate) || a.index - b.index)
    .map(({ candidate }) => candidate.identifier);
}

/**
 * The piece aimed at next in an order, a step on (1) or back (-1) from the first of it aimed at now,
 * round from the end to the start: the first, or the last going back, where none of it is aimed at.
 * Null for an order of none.
 */
export function nextAim(order: readonly string[], aimed: ReadonlySet<string>, step: 1 | -1): string | null {
  if (order.length < 1) return null;
  const now = order.findIndex((identifier) => aimed.has(identifier));
  if (now < 0) return step === 1 ? order[0] : order[order.length - 1];
  return order[(now + step + order.length) % order.length];
}
