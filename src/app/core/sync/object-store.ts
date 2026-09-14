import { networkSend, networkSendLatest } from '@axe/core/network/network-messaging';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { objectAdded$, objectRemoved$ } from '@axe/core/sync/object-event-extension';
import { Type } from '@axe/core/sync/object-factory';

type ObjectAliasName = string;
type ObjectIdentifier = string;
type TimeStamp = number;

export type CatalogItem = { identifier: string; version: number };

const GARBAGE_MAP_LIMIT = 100000;
const GARBAGE_TTL_MS = 10 * 60 * 1000;
const GARBAGE_SWEEP_INTERVAL_MS = 1000;

export class ObjectStore {
  private static _instance: ObjectStore;
  /** The store of every live game object, shared by the whole app and created on first use. */
  static get instance(): ObjectStore {
    if (!ObjectStore._instance) ObjectStore._instance = new ObjectStore();
    return ObjectStore._instance;
  }

  private identifierMap: Map<ObjectIdentifier, GameObject> = new Map();
  private aliasNameMap: Map<ObjectAliasName, Map<ObjectIdentifier, GameObject>> = new Map();
  private garbageMap: Map<ObjectIdentifier, TimeStamp> = new Map();
  private garbageSweepCooldown: ReturnType<typeof setTimeout> | null = null;

  private readonly localChanges: Map<string, number> = new Map();

  private constructor() {}

  /**
   * Puts an object in the store, runs its onStoreAdded hook and announces it on objectAdded$.
   *
   * Null when the identifier is already stored. A deleted identifier is refused for an object from
   * the network (shouldBroadcast false) but let back in for a local add, which is sent to the room.
   * beforeLifecycle runs once the object can be looked up and before onStoreAdded; received sync
   * data is applied there.
   */
  add(object: GameObject, shouldBroadcast: boolean = true, beforeLifecycle?: () => void): GameObject | null {
    if (this.get(object.identifier) != null) return null;
    if (this.isDeleted(object.identifier)) {
      // Something deleted is not resurrected from elsewhere; rebuilding it here is the rebuilder's call.
      if (!shouldBroadcast) return null;
      this.garbageMap.delete(object.identifier);
    }
    this.identifierMap.set(object.identifier, object);
    let objectsMap = this.aliasNameMap.get(object.aliasName);
    if (!objectsMap) {
      objectsMap = new Map();
      this.aliasNameMap.set(object.aliasName, objectsMap);
    }
    objectsMap.set(object.identifier, object);
    // beforeLifecycle runs after identifier maps are populated so callbacks fired
    // during apply (e.g. ObjectNode parent linkage → emitMessageAdded) can resolve
    // the new object via ObjectStore.get. onStoreAdded then sees populated SyncVars.
    beforeLifecycle?.();
    object.onStoreAdded();
    if (shouldBroadcast) this.update(object.toContext());
    objectAdded$.emit({ identifier: object.identifier, aliasName: object.aliasName });
    return object;
  }

  /**
   * Takes an object out of the store, running onStoreRemoved and announcing it on objectRemoved$.
   *
   * Nothing is recorded as deleted and nothing is sent; delete does both. Null when not stored.
   */
  remove(object: GameObject): GameObject | null {
    if (!this.identifierMap.has(object.identifier)) return null;

    this.identifierMap.delete(object.identifier);
    const objectsMap = this.aliasNameMap.get(object.aliasName);
    if (objectsMap) objectsMap.delete(object.identifier);
    object.onStoreRemoved();
    objectRemoved$.emit({ identifier: object.identifier, aliasName: object.aliasName });
    return object;
  }

  /**
   * Deletes an object given as an instance or identifier, and by default tells the room.
   *
   * The identifier is recorded as deleted even when nothing is stored under it, so a late copy from
   * a peer is refused. Null when nothing was removed, in which case nothing is sent either.
   */
  delete(arg: GameObject | string, shouldBroadcast: boolean = true): GameObject | null {
    const identifier = typeof arg === 'string' ? arg : arg.identifier;
    const object = typeof arg === 'string' ? this.get(arg) : arg;
    this.markForDelete(identifier);
    if (object == null || this.remove(object) === null) return null;
    if (shouldBroadcast)
      networkSend('DELETE_GAME_OBJECT', { aliasName: object.aliasName, identifier: object.identifier });
    return object;
  }

  private markForDelete(identifier: string) {
    this.garbageMap.set(identifier, performance.now());
    this.sweepGarbage();
  }

  /**
   * Sweeps the record of what was deleted, at most once a second.
   *
   * The cooldown is the whole point of the timer: while one is pending the sweep is skipped.
   * Below the limit a sweep is a subtraction and a return, but above it every delete would
   * walk the overflow, and the deletes that get there arrive in runs — clearing a room, or
   * loading one over another.
   */
  private sweepGarbage(): void {
    if (this.garbageSweepCooldown !== null) return;
    this.garbageSweepCooldown = setTimeout(() => {
      this.garbageSweepCooldown = null;
    }, GARBAGE_SWEEP_INTERVAL_MS);
    this.runGarbageCollection(GARBAGE_TTL_MS);
  }

  /** The stored object with this identifier, or null. */
  get<T extends GameObject>(identifier: string): T | null {
    return (this.identifierMap.get(identifier) as T) ?? null;
  }

  /** Stored objects of a class or alias in the order added, or all of them when given neither. */
  getObjects<T extends GameObject>(constructor: Type<T>): T[];
  getObjects<T extends GameObject>(aliasName: string): T[];
  getObjects<T extends GameObject>(): T[];
  getObjects<T extends GameObject>(arg?: string | Type<T>): T[] {
    if (arg == null) return Array.from(this.identifierMap.values()) as T[];
    const aliasName = typeof arg === 'string' ? arg : (arg.aliasName ?? '');
    const objectsMap = this.aliasNameMap.get(aliasName);
    return objectsMap ? (Array.from(objectsMap.values()) as T[]) : [];
  }

  /**
   * Sends an object's context to the room and counts it as a local change.
   *
   * A send of the same object still waiting in the queue is replaced. An identifier that is not
   * stored does nothing. GameObject.update comes through here; changes from peers do not.
   */
  update(arg: string | ObjectContext) {
    let context: ObjectContext | null = null;
    if (typeof arg === 'string') {
      const object = this.get(arg);
      if (object) context = object.toContext();
    } else {
      context = arg;
    }
    if (!context) return;

    // Only your own changes come through here; what arrives is applied instead.
    // Count before the sends are coalesced. Losing the second of a folded pair would make
    // a run of edits look like no edit at all.
    this.localChanges.set(context.identifier, (this.localChanges.get(context.identifier) ?? 0) + 1);

    networkSendLatest('UPDATE_GAME_OBJECT', context, context.identifier);
  }

  /** How many times you changed it. A load or a sync does not count. */
  localChangeCountOf(identifier: string): number {
    return this.localChanges.get(identifier) ?? 0;
  }

  /**
   * Whether the identifier is on the record of deletions, so copies from peers are refused.
   *
   * The oldest records are dropped once the record grows past its limit.
   */
  isDeleted(identifier: string) {
    return this.garbageMap.has(identifier);
  }

  /** The identifier and version of every stored object, which peers compare to find what they lack. */
  getCatalog(): CatalogItem[] {
    return Array.from(this.identifierMap.values(), (o) => ({ identifier: o.identifier, version: o.version }));
  }

  /** A copy of the record of deletions, to put back later with replaceDeleteHistory. */
  snapshotDeleteHistory(): Map<ObjectIdentifier, TimeStamp> {
    return new Map(this.garbageMap);
  }

  /** Replaces the record of deletions with the given one, such as a snapshot taken earlier. */
  replaceDeleteHistory(history: ReadonlyMap<ObjectIdentifier, TimeStamp>) {
    this.garbageMap = new Map(history);
  }

  /** Forgets all deletions so those identifiers may be added again, as on joining or reconnecting. */
  clearDeleteHistory() {
    this.garbageMap.clear();
  }

  /**
   * Takes the named objects out of the graveyard, so they may be made again under those names.
   *
   * Deleting is remembered so that a seat which never heard about it cannot put the object
   * back. A room being loaded is the other case: what it brings under a name that was just
   * taken away is meant to come back, and every seat has to be told so before it arrives.
   */
  forgetDeleted(identifiers: readonly ObjectIdentifier[]) {
    for (const identifier of identifiers) this.garbageMap.delete(identifier);
  }

  private runGarbageCollection(ms: number): void {
    const nowDate = performance.now();
    let checkLength = this.garbageMap.size - GARBAGE_MAP_LIMIT;
    if (checkLength <= 0) return;

    for (const [identifier, timeStamp] of this.garbageMap) {
      if (--checkLength < 0) break;
      if (timeStamp + ms > nowDate) continue;
      this.garbageMap.delete(identifier);
    }
  }
}
