import { type ReplayEvent, ReplayEventKind, type ReplayTargetSnapshot } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

/**
 * What an event is to someone reading the session back.
 *
 * - `story`: what was said and staged — lines, dice, chapters, scenes, music, cut-ins, turns, votes
 * - `board`: what happened to the pieces — moves, arrivals, removals, flips, rolls, values, effects
 * - `system`: the running of the room — joins, roles, owners, locks, looks, bare edits
 * - `hidden`: what only rebuilds the board — the parts of a piece arriving with it, and the cue
 *   for a change of value that is already recorded as that change
 */
export const ReplayEventCategory = {
  Story: 'story',
  Board: 'board',
  System: 'system',
  Hidden: 'hidden',
} as const;

export type ReplayEventCategory = (typeof ReplayEventCategory)[keyof typeof ReplayEventCategory];

const STORY_KINDS: ReadonlySet<ReplayEventKind> = new Set([
  ReplayEventKind.ChatMessage,
  ReplayEventKind.ChatDice,
  ReplayEventKind.Marker,
  ReplayEventKind.TableChange,
  ReplayEventKind.TurnChange,
  ReplayEventKind.VoteStart,
  ReplayEventKind.VoteFinish,
  ReplayEventKind.MediaCutIn,
  ReplayEventKind.MediaBgm,
  ReplayEventKind.VnScene,
]);

const BOARD_KINDS: ReadonlySet<ReplayEventKind> = new Set([
  ReplayEventKind.ObjectCreate,
  ReplayEventKind.ObjectRemove,
  ReplayEventKind.ObjectMove,
  ReplayEventKind.ObjectRotate,
  ReplayEventKind.ObjectFace,
  ReplayEventKind.ObjectDiceRoll,
  ReplayEventKind.ObjectShuffle,
  ReplayEventKind.ObjectValue,
  ReplayEventKind.EffectCast,
]);

/** The detail flag that marks an event as happening to a part of a piece rather than the piece. */
export const REPLAY_PART_FLAG = 'part';

/** Where an event belongs when the session is read back or turned into a video. Unknown kinds count as `system`. */
export function replayEventCategory(event: ReplayEvent): ReplayEventCategory {
  if (isPartArrivalOrRemoval(event) || isValueCue(event)) return ReplayEventCategory.Hidden;
  if (STORY_KINDS.has(event.kind)) return ReplayEventCategory.Story;
  if (BOARD_KINDS.has(event.kind)) return ReplayEventCategory.Board;
  return ReplayEventCategory.System;
}

function isPartArrivalOrRemoval(event: ReplayEvent): boolean {
  if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return false;
  return event.detail[REPLAY_PART_FLAG] === true;
}

/** The cue that plays a resource's feedback. The change itself is recorded as the part's own value event. */
function isValueCue(event: ReplayEvent): boolean {
  return event.kind === ReplayEventKind.ObjectValue && Array.isArray(event.detail['changes']);
}

/**
 * The objects in a recording that are parts of a piece: what the manifest records with an owner, and
 * on the first board, every data element and every card held in a stack.
 *
 * The board covers what was there before recording began and was never touched, which the manifest
 * does not list.
 */
export function replayPartIdentifiers(
  targets: readonly ReplayTargetSnapshot[],
  board: readonly ReplayObjectSnapshot[]
): Set<string> {
  const parts = new Set<string>();
  for (const target of targets) if (target.ownerIdentifier) parts.add(target.identifier);

  const aliasOf = new Map(board.map((snapshot) => [snapshot.identifier, snapshot.aliasName]));
  for (const snapshot of board) {
    const parent = snapshot.syncData['parentIdentifier'];
    if (typeof parent !== 'string' || parent.length < 1) continue;
    if (snapshot.aliasName === 'data' || aliasOf.get(parent) === 'card-stack') parts.add(snapshot.identifier);
  }
  return parts;
}

/**
 * Flags the arrivals and removals of parts, for recordings written before the recorder flagged them
 * itself. Other events, and events already flagged, come back as they were.
 */
export function flagReplayParts(events: readonly ReplayEvent[], parts: ReadonlySet<string>): ReplayEvent[] {
  if (parts.size < 1) return [...events];
  return events.map((event) => {
    if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return event;
    if (!event.targetId || !parts.has(event.targetId) || event.detail[REPLAY_PART_FLAG] === true) return event;
    return { ...event, detail: { ...event.detail, [REPLAY_PART_FLAG]: true } };
  });
}
