import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { appendRoutePoint, type ReplayRoutePoint, toRoutePoint } from '@axe/domain/replay/replay-route';

export interface CoalesceWindows {
  move: number;
  value: number;
}

export const DEFAULT_COALESCE_WINDOWS: CoalesceWindows = {
  move: 1_500,
  value: 1_000,
};

const COALESCIBLE_KINDS: ReadonlySet<ReplayEventKind> = new Set([
  ReplayEventKind.ObjectMove,
  ReplayEventKind.ObjectRotate,
  ReplayEventKind.ObjectValue,
]);

/**
 * How long, in milliseconds, a run of events of this kind may keep folding together.
 *
 * Value changes use the value window; moves and turns use the move window.
 */
export function windowFor(kind: ReplayEventKind, windows: CoalesceWindows = DEFAULT_COALESCE_WINDOWS): number {
  return kind === ReplayEventKind.ObjectValue ? windows.value : windows.move;
}

/**
 * Whether the next event can be folded into the previous one in the recording.
 *
 * Only moves, turns and value changes fold, and only when both are the same kind, by the same
 * actor, on the same target and object. The window is measured from the previous event's time,
 * which a merge keeps, so a run stops folding once it has lasted the window.
 */
export function canMergeReplayEvents(
  previous: ReplayEvent,
  next: ReplayEvent,
  windows: CoalesceWindows = DEFAULT_COALESCE_WINDOWS
): boolean {
  if (!COALESCIBLE_KINDS.has(previous.kind) || previous.kind !== next.kind) return false;
  if (previous.actorId !== next.actorId) return false;
  if (!previous.targetId || previous.targetId !== next.targetId) return false;
  if (previous.patch?.identifier !== next.patch?.identifier) return false;
  return next.at - previous.at <= windowFor(previous.kind, windows);
}

/**
 * Folds the next event into the previous one, as one event spanning both.
 *
 * It keeps the previous event's sequence number and time, runs each change from the earlier
 * value to the later one, joins the change lists, extends a move's path and counts how many
 * events it now stands for.
 */
export function mergeReplayEvents(previous: ReplayEvent, next: ReplayEvent): ReplayEvent {
  const detail = mergeDetail(previous.detail, next.detail);
  if (previous.kind === ReplayEventKind.ObjectMove) detail['path'] = mergePath(previous, next);

  return {
    ...next,
    seq: previous.seq,
    at: previous.at,
    t: previous.t,
    detail,
    patch: mergePatch(previous, next),
    merged: (previous.merged ?? 1) + (next.merged ?? 1),
  };
}

function mergePath(previous: ReplayEvent, next: ReplayEvent): ReplayRoutePoint[] {
  const path = Array.isArray(previous.detail['path'])
    ? (previous.detail['path'] as ReplayRoutePoint[])
    : [toRoutePoint(previous.detail['to'])];
  return appendRoutePoint(path, toRoutePoint(next.detail['to']));
}

function mergeDetail(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...previous, ...next };
  // The lists before and after name different fields; overwritten, what fell first could not be counted.
  if (Array.isArray(previous['changes']) && Array.isArray(next['changes'])) {
    merged['changes'] = [...previous['changes'], ...next['changes']];
  }
  for (const key of Object.keys(merged)) {
    const before = previous[key];
    const after = next[key];
    if (isFromTo(before) && isFromTo(after)) merged[key] = { from: before['from'], to: after['to'] };
  }
  if (isFromTo(previous) && isFromTo(next)) {
    merged['from'] = previous['from'];
    merged['to'] = next['to'];
  }
  return merged;
}

function mergePatch(previous: ReplayEvent, next: ReplayEvent): ReplayEvent['patch'] {
  if (!next.patch) return previous.patch;
  if (!previous.patch) return next.patch;
  return {
    identifier: next.patch.identifier,
    aliasName: next.patch.aliasName,
    before: { ...next.patch.before, ...previous.patch.before },
    after: { ...previous.patch.after, ...next.patch.after },
  };
}

function isFromTo(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'from' in value && 'to' in value;
}
