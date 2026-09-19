import { cloneSyncValue, expandSyncPaths, flattenSyncData, type SyncData } from '@axe/domain/replay/replay-diff';
import { type ReplayEvent, ReplayEventKind, type ReplayPatch } from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

/**
 * An object's fields with a recorded change laid on, without altering the fields given.
 *
 * Values after the change are copied in, and fields present only before it are removed. With no
 * fields to start from, the object is built from the change alone.
 */
export function applyReplayPatch(syncData: SyncData | null, patch: ReplayPatch): Record<string, unknown> {
  const flat: Record<string, unknown> = syncData ? flattenSyncData(syncData) : {};
  for (const key of Object.keys(patch.after)) flat[key] = cloneSyncValue(patch.after[key]);
  for (const key of Object.keys(patch.before)) {
    if (!(key in patch.after)) delete flat[key];
  }
  return expandSyncPaths(flat);
}

export interface ApplyReplayOptions {
  /**
   * Where the caller promises not to write to the result, the original is handed over as it is.
   *
   * By default the whole board is copied before the events are applied. Where the boards of
   * each scene are only built and read in turn, as an export does, even what is never touched would be copied once per scene.
   */
  shareInput?: boolean;
}

/**
 * The room's objects after playing events onto a snapshot, in order.
 *
 * A removal takes its object away, with the parts removed along with it, and a patch makes or
 * changes one, followed by the parts that arrived with it; events with neither are passed over.
 * The snapshot is copied first unless `shareInput` is set.
 */
export function applyReplayEvents(
  objects: readonly ReplayObjectSnapshot[],
  events: readonly ReplayEvent[],
  options?: ApplyReplayOptions
): ReplayObjectSnapshot[] {
  const share = options?.shareInput === true;
  const byIdentifier = new Map<string, ReplayObjectSnapshot>();
  for (const object of objects) {
    byIdentifier.set(object.identifier, share ? object : { ...object, syncData: cloneSyncValue(object.syncData) });
  }

  const lay = (patch: ReplayPatch): void => {
    const current = byIdentifier.get(patch.identifier);
    byIdentifier.set(patch.identifier, {
      identifier: patch.identifier,
      aliasName: patch.aliasName || current?.aliasName || '',
      syncData: applyReplayPatch(current?.syncData ?? null, patch),
    });
  };

  for (const event of events) {
    if (event.kind === ReplayEventKind.ObjectRemove) {
      if (event.targetId) byIdentifier.delete(event.targetId);
      for (const part of event.removedParts ?? []) byIdentifier.delete(part);
      continue;
    }
    if (event.patch) lay(event.patch);
    for (const part of event.parts ?? []) lay(part);
  }

  return [...byIdentifier.values()];
}

/**
 * The position of the last event at or before a sequence number, in a list sorted by it.
 *
 * -1 when every event is later.
 */
export function indexOfSeq(events: readonly ReplayEvent[], seq: number): number {
  let index = -1;
  for (let i = 0; i < events.length; i++) {
    if (events[i].seq > seq) break;
    index = i;
  }
  return index;
}
