import {
  type ReplayEvent,
  ReplayEventKind,
  type ReplayTargetSnapshot,
  resolveSnapshotAt,
} from '@axe/domain/replay/replay-event';
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

/**
 * Where an event belongs when the session is read back or turned into a video.
 *
 * A notice the tool wrote into the chat — a lost connection, a cleared log, the tutorial — is the
 * running of the room, not the story. Unknown kinds count as `system`.
 */
export function replayEventCategory(event: ReplayEvent): ReplayEventCategory {
  if (isPartArrivalOrRemoval(event) || isValueCue(event)) return ReplayEventCategory.Hidden;
  if (isSystemReplayChat(event)) return ReplayEventCategory.System;
  if (STORY_KINDS.has(event.kind)) return ReplayEventCategory.Story;
  if (BOARD_KINDS.has(event.kind)) return ReplayEventCategory.Board;
  return ReplayEventCategory.System;
}

/** Whether a chat line was written by the tool rather than by anyone at the table, as the chat itself tells them apart. */
export function isSystemReplayChat(event: ReplayEvent): boolean {
  if (event.kind !== ReplayEventKind.ChatMessage) return false;
  return event.detail['from'] === 'System' || String(event.detail['tag'] ?? '').includes('system-message');
}

function isPartArrivalOrRemoval(event: ReplayEvent): boolean {
  if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return false;
  return event.detail[REPLAY_PART_FLAG] === true;
}

/** The cue that plays a resource's feedback. The change itself is recorded as the part's own value event. */
function isValueCue(event: ReplayEvent): boolean {
  return event.kind === ReplayEventKind.ObjectValue && Array.isArray(event.detail['changes']);
}

/** The first format whose recorder flags the parts itself, so that a recording read back needs no flagging. */
export const REPLAY_PARTS_FLAGGED_SINCE_FORMAT = 3;

/** Whether an object was part of a piece at a point in a recording. */
export type ReplayPartJudge = (identifier: string, seq: number) => boolean;

/**
 * Tells which objects of a recording were parts of a piece, and when.
 *
 * An object the manifest follows is judged by the owner it had at that point, so a card put into a
 * deck and drawn again is a piece of its own once more. Anything else is judged from the first
 * board, where every data element and every card held in a stack is a part: that covers what was
 * there before recording began and was never touched, which the manifest does not list.
 */
export function replayPartJudge(
  targets: readonly ReplayTargetSnapshot[],
  board: readonly ReplayObjectSnapshot[]
): ReplayPartJudge {
  const histories = new Map<string, ReplayTargetSnapshot[]>();
  for (const target of targets) {
    const history = histories.get(target.identifier);
    if (history) history.push(target);
    else histories.set(target.identifier, [target]);
  }

  const byIdentifier = new Map(board.map((snapshot) => [snapshot.identifier, snapshot]));
  const parentOf = (snapshot: ReplayObjectSnapshot | undefined): ReplayObjectSnapshot | undefined => {
    const parent = snapshot?.syncData['parentIdentifier'];
    return typeof parent === 'string' && parent.length > 0 ? byIdentifier.get(parent) : undefined;
  };
  const partsAtStart = new Set<string>();
  for (const snapshot of board) {
    const parent = snapshot.syncData['parentIdentifier'];
    if (typeof parent !== 'string' || parent.length < 1) continue;
    if (snapshot.aliasName === 'data') {
      partsAtStart.add(snapshot.identifier);
      continue;
    }
    for (let above = parentOf(snapshot); above; above = parentOf(above)) {
      if (above.aliasName !== 'card-stack') continue;
      partsAtStart.add(snapshot.identifier);
      break;
    }
  }

  return (identifier, seq) => {
    const history = histories.get(identifier);
    const then = history ? resolveSnapshotAt(history, seq) : null;
    return then ? Boolean(then.ownerIdentifier) : partsAtStart.has(identifier);
  };
}

/**
 * Flags the arrivals and removals of parts, for recordings written before the recorder flagged them
 * itself. Other events, and events already flagged, come back as they were.
 */
export function flagReplayParts(events: readonly ReplayEvent[], isPart: ReplayPartJudge): ReplayEvent[] {
  return events.map((event) => {
    if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return event;
    if (!event.targetId || event.detail[REPLAY_PART_FLAG] === true || !isPart(event.targetId, event.seq)) return event;
    return { ...event, detail: { ...event.detail, [REPLAY_PART_FLAG]: true } };
  });
}
