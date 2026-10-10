import { type ReplayManifest, resolveSnapshotAt } from '@axe/domain/replay/replay-event';
import type { ReplayNameLookup } from '@axe/features/replay/replay-log-line';

export type ReplayDictionary = Pick<ReplayManifest, 'actors' | 'targets'>;

export const EMPTY_REPLAY_DICTIONARY: ReplayDictionary = { actors: [], targets: [] };

type Snapshots<T> = Map<string, T[]>;

interface DictionaryIndex {
  actors: Snapshots<ReplayManifest['actors'][number]>;
  targets: Snapshots<ReplayManifest['targets'][number]>;
}

/**
 * The name history, gathered by whom it belongs to.
 *
 * Every line looks up the name of the actor and the target, and filtering the whole
 * history each time costs a line times a history on a long recording, enough to freeze the list as it opens. It is built once per catalogue.
 */
const indexes = new WeakMap<ReplayDictionary, DictionaryIndex>();

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Snapshots<T> {
  const grouped: Snapshots<T> = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const bucket = grouped.get(key);
    if (bucket) bucket.push(row);
    else grouped.set(key, [row]);
  }
  return grouped;
}

function indexOf(dictionary: ReplayDictionary): DictionaryIndex {
  const cached = indexes.get(dictionary);
  if (cached) return cached;
  const index: DictionaryIndex = {
    actors: groupBy(dictionary.actors, (actor) => actor.userId),
    targets: groupBy(dictionary.targets, (target) => target.identifier),
  };
  indexes.set(dictionary, index);
  return index;
}

/**
 * Looks up actor and target names as they stood at a given point in the recording.
 *
 * An id with no name recorded by then is shown as the id itself. The lookup table is built once per
 * dictionary and reused.
 */
export function replayNamesAt(dictionary: ReplayDictionary, seq: number): ReplayNameLookup {
  const index = indexOf(dictionary);
  const targetAt = (identifier: string) => resolveSnapshotAt(index.targets.get(identifier) ?? [], seq);
  return {
    actorName: (userId) => resolveSnapshotAt(index.actors.get(userId) ?? [], seq)?.name || userId,
    targetName: (identifier) => targetAt(identifier)?.name || identifier,
    ownerName: (identifier) => {
      const owner = targetAt(identifier)?.ownerIdentifier;
      return owner ? targetAt(owner)?.name || '' : '';
    },
  };
}

/**
 * Every actor in the recording under the last name recorded for them, followed by any of the given
 * ids the dictionary does not know, named by the id.
 */
export function replayActorsOf(
  dictionary: ReplayDictionary,
  fallbackIds: readonly string[]
): { userId: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const actor of dictionary.actors) seen.set(actor.userId, actor.name || actor.userId);
  for (const userId of fallbackIds) if (!seen.has(userId)) seen.set(userId, userId);
  return [...seen].map(([userId, name]) => ({ userId, name }));
}
