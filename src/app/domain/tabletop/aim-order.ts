import type { BattleSide } from '@axe/domain/battle/battle-lineup';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/**
 * A piece's body as the order it is aimed at in reads it: the line from its feet to its head in the
 * room, upright on the floor, and out from the face on a wall or a board.
 */
export interface AimBody {
  readonly feet: Vec3;
  readonly head: Vec3;
}

/**
 * A piece as the order it is aimed at in reads it: its body where it stands in the room, its height
 * above the floor plan included, the side of the fight it is on, and the piece it is one with, its
 * body for a part and itself for any other.
 */
export interface AimCandidate extends AimBody {
  readonly identifier: string;
  readonly side: BattleSide | null;
  readonly whole: string;
}

/** Below this, a length is taken as none. */
const NONE = 1e-9;

/** How near two gaps may be, in table pixels, and be taken as one (see `compareGaps`). */
const AS_NEAR_PX = 1e-6;

/**
 * How far apart two bodies are: between the nearest points of the lines from their feet to their
 * heads. Pieces standing on one floor are as far apart as they stand across it, however tall either
 * is; a piece flying over another is as far as the gap between the feet of the one and the head of
 * the other. A body whose feet and head are one point is read as that point.
 */
export function bodyGap(a: AimBody, b: AimBody): number {
  const along = minus(a.head, a.feet);
  const alongOther = minus(b.head, b.feet);
  const between = minus(a.feet, b.feet);
  const long = dot(along, along);
  const longOther = dot(alongOther, alongOther);
  const towardOther = dot(alongOther, between);
  let s = 0;
  let t = 0;
  if (long <= NONE && longOther > NONE) {
    t = clamp01(towardOther / longOther);
  } else if (long > NONE) {
    const toward = dot(along, between);
    if (longOther <= NONE) {
      s = clamp01(-toward / long);
    } else {
      const across = dot(along, alongOther);
      const square = long * longOther - across * across;
      s = square > NONE ? clamp01((across * towardOther - toward * longOther) / square) : 0;
      t = (across * s + towardOther) / longOther;
      if (t < 0) {
        t = 0;
        s = clamp01(-toward / long);
      } else if (t > 1) {
        t = 1;
        s = clamp01((across - toward) / long);
      }
    }
  }
  return Math.hypot(
    a.feet.x + along.x * s - (b.feet.x + alongOther.x * t),
    a.feet.y + along.y * s - (b.feet.y + alongOther.y * t),
    a.feet.z + along.z * s - (b.feet.z + alongOther.z * t)
  );
}

/**
 * How two gaps compare, nearer first: none where they are as near as each other to a millionth of a
 * pixel, as the sums that reach two equal gaps may differ in their last digits, so that what stands
 * as near is put in the order of the room.
 */
export function compareGaps(a: number, b: number): number {
  return Math.abs(a - b) > AS_NEAR_PX ? a - b : 0;
}

function minus(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The order the pieces are aimed at in, one at a time, from a piece: the pieces of the other side of
 * the fight where the piece stands on one, else every piece but those it is one with (itself, its
 * parts, its body), nearest first in the room by how far their bodies are apart (see `bodyGap`), and
 * of two as near, to a millionth of a pixel (see `compareGaps`), the one first in the room. With no
 * piece to go from, every piece, in the order of the room.
 */
export function aimOrder(from: AimCandidate | null, candidates: readonly AimCandidate[]): string[] {
  if (!from) return candidates.map((candidate) => candidate.identifier);
  const opposed = (candidate: AimCandidate) =>
    candidate.whole !== from.whole && (from.side === null || (candidate.side !== null && candidate.side !== from.side));
  const distance = (candidate: AimCandidate) => bodyGap(from, candidate);
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => opposed(candidate))
    .map((entry) => ({ ...entry, gap: distance(entry.candidate) }))
    .sort((a, b) => compareGaps(a.gap, b.gap) || a.index - b.index)
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
