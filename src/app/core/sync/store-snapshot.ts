import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';

/** What the store held at one moment: the context of every object, version and all. */
export interface StoreSnapshot {
  readonly contexts: ReadonlyMap<string, ObjectContext>;
}

/** Takes down what the store holds now, to put it back as it was with {@link restoreStore}. */
export function snapshotStore(): StoreSnapshot {
  const contexts = new Map<string, ObjectContext>();
  for (const object of ObjectStore.instance.getObjects<GameObject>()) {
    contexts.set(object.identifier, object.toContext());
  }
  return { contexts };
}

/**
 * Puts the store back as a snapshot found it, telling nobody: what was added since is taken out,
 * what was taken out since is made again, and every object is put back to its state and version
 * then, so a peer met afterwards finds this seat as it would have found it at that moment.
 *
 * What `keep` answers true for, or sits under something it does, is left as it is now, whether
 * added since or changed.
 */
export function restoreStore(snapshot: StoreSnapshot, keep: (object: GameObject) => boolean): void {
  const store = ObjectStore.instance;
  const kept = (object: GameObject): boolean => {
    for (let at: GameObject | null = object; at; at = at instanceof ObjectNode ? at.parent : null) {
      if (keep(at)) return true;
    }
    return false;
  };

  for (const object of store.getObjects<GameObject>()) {
    if (!snapshot.contexts.has(object.identifier) && store.get(object.identifier) === object && !kept(object)) {
      store.delete(object, false);
    }
  }

  const missing = [...snapshot.contexts.keys()].filter((identifier) => store.get(identifier) === null);
  store.forgetDeleted(missing);
  for (const [identifier, context] of snapshot.contexts) {
    const object = store.get(identifier);
    if (object === null) {
      const made = ObjectFactory.instance.create(context.aliasName, identifier);
      if (made) store.add(made, false, () => made.apply(structuredClone(context)));
      continue;
    }
    if (kept(object)) continue;
    if (object.majorVersion === context.majorVersion && object.minorVersion === context.minorVersion) continue;
    object.apply(structuredClone(context));
    markForChanged(object);
  }
}
