/**
 * How a piece crosses a zone: walking through it from outside, walking out of it from inside
 * without being in it, or leaving it while in it.
 */
export type ZoneCrossing = 'pass' | 'escape' | 'leave';

/** The bodies a zone holds by side: those in it, and those standing in it without being in it. */
export interface ZoneSideCounts {
  readonly members: ReadonlyMap<string, number>;
  readonly inside: ReadonlyMap<string, number>;
}

/** The piece crossing, as the counting sees it. */
export interface ZoneMover {
  readonly side: string;
  readonly count: number;
}

/**
 * Whether a zone holds a piece crossing it, rather than letting it by.
 *
 * It lets the piece by where the piece's side outnumbers every other side in the zone by the ratio.
 * Walking through or out of a zone, the piece counts itself with its side's pieces in the zone;
 * leaving a zone it is in, it counts only the others of its side in it. The other sides count
 * everyone of theirs standing in the zone, in it or not.
 */
export function zoneHolds(counts: ZoneSideCounts, mover: ZoneMover, crossing: ZoneCrossing, ratio: number): boolean {
  const ownInZone = counts.members.get(mover.side) ?? 0;
  const own = crossing === 'leave' ? Math.max(0, ownInZone - mover.count) : ownInZone + mover.count;
  let others = 0;
  for (const [side, count] of counts.members) if (side !== mover.side) others += count;
  for (const [side, count] of counts.inside) if (side !== mover.side) others += count;
  return !(own > ratio * others);
}

/** Why a piece in a zone may leave it, or that it may not. */
export type LeaveReason = 'prepared' | 'outnumbers' | 'overflow' | 'held';

export interface LeaveInput {
  readonly counts: ZoneSideCounts;
  readonly mover: ZoneMover;
  readonly ratio: number;
  readonly overflowing: boolean;
  /** The round the piece said it would leave in, empty where it has not; `0` while no round is being kept. */
  readonly leaveRound: string;
  readonly round: number;
  /** Whether a round is being kept at all, so a round said in can be told from the one now. */
  readonly roundsKept: boolean;
  /** The kind of move an overflowing zone is left by at once, or empty for any kind. */
  readonly leaveKind: string;
  /** The kind of move the piece means to make. */
  readonly kind: string;
}

/**
 * Whether a piece said it would leave in time for this move: in an earlier round, or at all while no
 * round is being kept.
 */
export function hasPreparedToLeave(leaveRound: string, round: number, roundsKept: boolean): boolean {
  if (leaveRound === '') return false;
  const said = Number(leaveRound);
  return !roundsKept || !Number.isFinite(said) || said < round;
}

/**
 * Whether a piece standing in a zone without being in it may walk out of it unheld: out of one
 * holding more than its limit by the room's one kind of move whatever the count, and otherwise where
 * it said it would leave in time or its side outnumbers the rest by the ratio.
 */
export function mayEscape(input: LeaveInput): boolean {
  if (input.overflowing) return input.leaveKind === '' || input.kind === input.leaveKind;
  if (hasPreparedToLeave(input.leaveRound, input.round, input.roundsKept)) return true;
  return !zoneHolds(input.counts, input.mover, 'escape', input.ratio);
}

/**
 * Whether a piece in a zone may walk out of it, and why.
 *
 * Out of a zone holding more than its limit a piece goes at once, by the one kind of move the room
 * names for it, and says nothing beforehand. Otherwise it goes where its side outnumbers the rest by
 * the ratio, or where it said it would leave in an earlier round; said while no round is being kept,
 * it may go on its next move.
 */
export function leaveReasonOf(input: LeaveInput): LeaveReason {
  if (input.overflowing) return input.leaveKind === '' || input.kind === input.leaveKind ? 'overflow' : 'held';
  if (!zoneHolds(input.counts, input.mover, 'leave', input.ratio)) return 'outnumbers';
  if (hasPreparedToLeave(input.leaveRound, input.round, input.roundsKept)) return 'prepared';
  return 'held';
}
