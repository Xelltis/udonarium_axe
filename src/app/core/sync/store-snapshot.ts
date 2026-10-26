import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';
import { DeleteHistory, ObjectStore } from '@axe/core/sync/object-store';

/** What the store held at one moment: the context of every object, version and all, and what had been deleted. */
export interface StoreSnapshot {
  readonly contexts: ReadonlyMap<string, ObjectContext>;
  readonly deleted: DeleteHistory;
}

/** Whether the test holds for an object, or for anything it sits under. */
export function isOrSitsUnder(object: GameObject, test: (object: GameObject) => boolean): boolean {
  for (let at: GameObject | null = object; at; at = at instanceof ObjectNode ? at.parent : null) {
    if (test(at)) return true;
  }
  return false;
}

/** Takes down what the store holds now, to put it back as it was with {@link restoreStore}. */
export function snapshotStore(): StoreSnapshot {
  const contexts = new Map<string, ObjectContext>();
  for (const object of ObjectStore.instance.getObjects<GameObject>()) {
    contexts.set(object.identifier, object.toContext());
  }
  return { contexts, deleted: ObjectStore.instance.snapshotDeleteHistory() };
}

/**
 * Puts the store back as a snapshot found it, telling nobody: what was added since is taken out,
 * what was taken out since is made again, every object is put back to its state and version then,
 * and the record of what was deleted goes back to what it was, so that what is made afterwards under
 * a name taken out here is not pushed past the version it had. A peer met afterwards finds this
 * seat as it would have found it at that moment.
 *
 * An object is put back as data alone: what it does on taking in a change from a peer, such as
 * starting a track or a cut-in, is not done. What `keep` answers true for, or sits under something
 * it does, is left as it is now, whether added since or changed.
 */
export function restoreStore(snapshot: StoreSnapshot, keep: (object: GameObject) => boolean): void {
  const store = ObjectStore.instance;
  const kept = (object: GameObject): boolean => isOrSitsUnder(object, keep);

  for (const object of store.getObjects<GameObject>()) {
    if (!snapshot.contexts.has(object.identifier) && store.get(object.identifier) === object && !kept(object)) {
      store.delete(object, false);
    }
  }
  store.replaceDeleteHistory(snapshot.deleted);

  for (const [identifier, context] of snapshot.contexts) {
    const object = store.get(identifier);
    if (object === null) {
      const made = ObjectFactory.instance.create(context.aliasName, identifier);
      if (made && !keep(made)) store.add(made, false, () => applyAsData(made, context));
      continue;
    }
    if (kept(object)) continue;
    if (object.majorVersion === context.majorVersion && object.minorVersion === context.minorVersion) continue;
    applyAsData(object, context);
    markForChanged(object);
  }
}

/** Takes a context in as data only, passing over whatever a kind of object does on hearing a change from a peer. */
function applyAsData(object: GameObject, context: ObjectContext): void {
  const copy = structuredClone(context);
  if (object instanceof ObjectNode) ObjectNode.prototype.apply.call(object, copy);
  else GameObject.prototype.apply.call(object, copy);
}
