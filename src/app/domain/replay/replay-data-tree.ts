import { syncValueOf } from '@axe/domain/replay/replay-diff';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

export const REPLAY_DATA_ALIAS = 'data';

/** The recorded data elements grouped under the identifier of their parent, for walking a piece's data tree. */
export function groupReplayChildren(snapshots: readonly ReplayObjectSnapshot[]): Map<string, ReplayObjectSnapshot[]> {
  const childrenOf = new Map<string, ReplayObjectSnapshot[]>();
  for (const snapshot of snapshots) {
    if (snapshot.aliasName !== REPLAY_DATA_ALIAS) continue;
    const parent = String(snapshot.syncData['parentIdentifier'] ?? '');
    if (parent.length < 1) continue;
    const siblings = childrenOf.get(parent);
    if (siblings) siblings.push(snapshot);
    else childrenOf.set(parent, [snapshot]);
  }
  return childrenOf;
}

/**
 * The value of the data element reached by following names down from an object, such as
 * `common` then `name`.
 *
 * Each name is looked for at any depth below the element before it, nearest first. Empty when
 * any step of the path is missing.
 */
export function replayValueOfNamed(
  childrenOf: Map<string, ReplayObjectSnapshot[]>,
  rootIdentifier: string,
  path: readonly string[]
): string {
  const element = replayElementOfNamed(childrenOf, rootIdentifier, path);
  return element ? String(element.syncData['value'] ?? '') : '';
}

/** The data element itself that `replayValueOfNamed` reads the value of. Null when any step is missing. */
export function replayElementOfNamed(
  childrenOf: Map<string, ReplayObjectSnapshot[]>,
  rootIdentifier: string,
  path: readonly string[]
): ReplayObjectSnapshot | null {
  let scope: ReplayObjectSnapshot | null = findDescendant(childrenOf, rootIdentifier, path[0]);
  for (const name of path.slice(1)) {
    if (!scope) return null;
    scope = findDescendant(childrenOf, scope.identifier, name);
  }
  return scope;
}

function findDescendant(
  childrenOf: Map<string, ReplayObjectSnapshot[]>,
  parentIdentifier: string,
  name: string
): ReplayObjectSnapshot | null {
  const queue = [...(childrenOf.get(parentIdentifier) ?? [])];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (String(syncValueOf(node.syncData, 'name') ?? '') === name) return node;
    queue.push(...(childrenOf.get(node.identifier) ?? []));
  }
  return null;
}
