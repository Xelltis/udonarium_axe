import {
  canViewReplayEvent,
  isIncidentalReplayEvent,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayViewer,
} from '@axe/domain/replay/replay-event';
import { ReplayEventCategory, replayEventCategory } from '@axe/domain/replay/replay-event-category';

export const ReplayLogScope = {
  All: 'all',
  Chat: 'chat',
  Board: 'board',
} as const;

export type ReplayLogScope = (typeof ReplayLogScope)[keyof typeof ReplayLogScope];

export interface ReplayLogFilter {
  scope: ReplayLogScope;
  actorId: string;
  hideSecret: boolean;
  showIncidental: boolean;
  /** Whether the running of the room — joins, roles, owners, locks — is listed too. */
  showSystem: boolean;
}

export const DEFAULT_REPLAY_LOG_FILTER: ReplayLogFilter = {
  scope: ReplayLogScope.All,
  actorId: '',
  hideSecret: false,
  showIncidental: false,
  showSystem: false,
};

const CHAT_KINDS: ReadonlySet<ReplayEventKind> = new Set([ReplayEventKind.ChatMessage, ReplayEventKind.ChatDice]);

const ALWAYS_SHOWN: ReadonlySet<ReplayEventKind> = new Set([ReplayEventKind.Marker]);

/**
 * Whether an event of a replay belongs in the log under the chosen filter.
 *
 * Events the viewer was not allowed to see never do, and neither do the parts that arrive and
 * leave with a piece. Hiding secrets drops everything that was not public, an actor filter keeps
 * only that user's events, and sound effects that merely go with another event stay out unless
 * asked for, as does the running of the room. Markers are shown whatever the scope; otherwise the
 * chat scope keeps chat and dice lines and the board scope keeps the rest.
 */
export function matchesReplayLogFilter(event: ReplayEvent, filter: ReplayLogFilter, viewer: ReplayViewer): boolean {
  if (!canViewReplayEvent(event, viewer)) return false;
  const category = replayEventCategory(event);
  if (category === ReplayEventCategory.Hidden) return false;
  if (filter.hideSecret && event.visibility.kind !== 'public') return false;
  if (filter.actorId.length > 0 && event.actorId !== filter.actorId) return false;
  if (!filter.showIncidental && isIncidentalReplayEvent(event.kind)) return false;
  if (!filter.showSystem && category === ReplayEventCategory.System && !isIncidentalReplayEvent(event.kind))
    return false;
  if (ALWAYS_SHOWN.has(event.kind)) return true;
  if (filter.scope === ReplayLogScope.Chat) return CHAT_KINDS.has(event.kind);
  if (filter.scope === ReplayLogScope.Board) return !CHAT_KINDS.has(event.kind);
  return true;
}

/**
 * The events of a replay that belong in the log under the chosen filter, in their original order.
 */
export function filterReplayEvents(
  events: readonly ReplayEvent[],
  filter: ReplayLogFilter,
  viewer: ReplayViewer
): ReplayEvent[] {
  return events.filter((event) => matchesReplayLogFilter(event, filter, viewer));
}

/** The user ids that performed any of the events, each once, in the order they first appear. */
export function collectReplayActorIds(events: readonly ReplayEvent[]): string[] {
  const seen = new Set<string>();
  for (const event of events) seen.add(event.actorId);
  return [...seen];
}
