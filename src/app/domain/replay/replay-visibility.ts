import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
  resolveSnapshotAt,
} from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

/** Who may see an object with this disclosure: the game master only, the chosen users, or everyone. */
export function visibilityOfDisclosure(mode: unknown, userIds: unknown): ReplayVisibility {
  if (mode === DisclosureMode.GameMaster) return GM_ONLY_VISIBILITY;
  if (mode === DisclosureMode.Selected && Array.isArray(userIds)) {
    return { kind: 'direct', to: userIds.filter((id): id is string => typeof id === 'string') };
  }
  return PUBLIC_VISIBILITY;
}

/** Who may see an object, read from its synced state: the disclosure among its attributes, or none. */
export function visibilityOfSyncData(syncData: Readonly<Record<string, unknown>>): ReplayVisibility {
  const attributes = syncData['attributes'];
  const source = (typeof attributes === 'object' && attributes !== null ? attributes : syncData) as Record<
    string,
    unknown
  >;
  return visibilityOfDisclosure(source['disclosureMode'], source['disclosureUserIds']);
}

/** The pieces on a board that were kept from somebody, with who could see each. Public pieces are left out. */
export function hiddenPiecesIn(snapshots: readonly ReplayObjectSnapshot[]): Map<string, ReplayVisibility> {
  const hidden = new Map<string, ReplayVisibility>();
  for (const snapshot of snapshots) {
    const visibility = visibilityOfSyncData(snapshot.syncData);
    if (visibility.kind !== 'public') hidden.set(snapshot.identifier, visibility);
  }
  return hidden;
}

/** The kinds that describe the object they name, as opposed to naming it in passing (whose turn it is, say). */
const OBJECT_KINDS: ReadonlySet<ReplayEventKind> = new Set([
  ReplayEventKind.ObjectCreate,
  ReplayEventKind.ObjectRemove,
  ReplayEventKind.ObjectMove,
  ReplayEventKind.ObjectRotate,
  ReplayEventKind.ObjectFace,
  ReplayEventKind.ObjectDiceRoll,
  ReplayEventKind.ObjectShuffle,
  ReplayEventKind.ObjectValue,
  ReplayEventKind.ObjectImage,
  ReplayEventKind.ObjectOwner,
  ReplayEventKind.ObjectLock,
  ReplayEventKind.ObjectUpdate,
]);

/**
 * Hides a change to part of a hidden piece, such as its HP, as the piece itself was hidden.
 *
 * Recordings made before this rule judged each part on its own, and a part has no disclosure of its
 * own, so the HP of a monster kept to the game master went down as public. A part is known by the
 * owner the manifest gives it. The owner's visibility starts as the board before the first event
 * shows it and follows the owner's own events after that. Only public events are narrowed; nothing
 * is ever made more visible than it was recorded.
 */
export function inheritOwnerVisibility(
  events: readonly ReplayEvent[],
  targets: readonly ReplayTargetSnapshot[],
  initial: ReadonlyMap<string, ReplayVisibility>
): ReplayEvent[] {
  const histories = new Map<string, ReplayTargetSnapshot[]>();
  for (const target of targets) {
    const history = histories.get(target.identifier);
    if (history) history.push(target);
    else histories.set(target.identifier, [target]);
  }
  for (const history of histories.values()) history.sort((a, b) => a.sinceSeq - b.sinceSeq);

  const current = new Map<string, ReplayVisibility>(initial);
  return events.map((event) => {
    if (!event.targetId || !OBJECT_KINDS.has(event.kind)) return event;
    const history = histories.get(event.targetId);
    const owner = history ? (resolveSnapshotAt(history, event.seq) ?? history[0]).ownerIdentifier : undefined;
    if (!owner) {
      current.set(event.targetId, event.visibility);
      return event;
    }
    const inherited = current.get(owner);
    if (event.visibility.kind !== 'public' || !inherited || inherited.kind === 'public') return event;
    return { ...event, visibility: inherited };
  });
}
