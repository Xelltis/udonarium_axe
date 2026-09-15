import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { generateUuid } from '@axe/core/util/uuid';

export interface ObjectContext {
  aliasName: string;
  identifier: string;
  majorVersion: number;
  minorVersion: number;
  syncData: Record<string | symbol, unknown>;
}

export class GameObject {
  /** Called after every update() invocation. Set externally (e.g. object-event-extension.ts) to hook local change notifications. */
  static onUpdate: ((object: GameObject) => void) | null = null;

  private context: ObjectContext = {
    aliasName: (this.constructor as typeof GameObject).aliasName,
    identifier: '',
    majorVersion: 0,
    minorVersion: 0,
    syncData: {},
  };

  /** The alias this class was registered under with @SyncObject, or an empty string if it never was. */
  static get aliasName(): string {
    return ObjectFactory.instance.getAlias(this);
  }
  /** The alias of the class this object was created as, naming its XML tag and its type on the wire. */
  get aliasName() {
    return this.context.aliasName;
  }
  /** The id of the object across the room: how the store, peers and saved rooms refer to it. */
  get identifier() {
    return this.context.identifier;
  }
  /**
   * The version used to settle sync: the change count plus a random fraction.
   *
   * The fraction keeps two peers that changed the same object at once from landing on the same
   * version. A received context replaces the object only when its version is higher.
   */
  get version() {
    return this.context.majorVersion + this.context.minorVersion;
  }

  constructor(identifier: string = generateUuid()) {
    this.context.identifier = identifier;
  }

  /**
   * Adds the object to the store, which runs onStoreAdded and sends the object to the room.
   *
   * Nothing happens when an object with the same identifier is already stored. An identifier that
   * was deleted earlier is let back in, since adding it here is a deliberate recreation.
   */
  initialize() {
    ObjectStore.instance.add(this);
  }

  /**
   * Deletes the object from the store and tells the room to delete it too.
   *
   * The identifier is remembered as deleted, so a peer that has not heard yet cannot bring the
   * object back by sending it.
   */
  destroy() {
    ObjectStore.instance.delete(this);
  }

  // GameObject Lifecycle
  /**
   * Hook run when the object enters the store, created here or received from a peer.
   *
   * Subclasses override it to subscribe to events or link up with other objects. An object from a
   * peer already has its synced fields filled in by the time this runs.
   */
  onStoreAdded() {}

  // GameObject Lifecycle
  /** Hook run when the object leaves the store; subclasses release what onStoreAdded set up. */
  onStoreRemoved() {}

  /**
   * Runs a piece of work with every change it makes counted as one.
   *
   * Filling an object in field by field says the object changed once per field, and each of
   * those clones everything the object holds so it can be sent. Seeding a room writes
   * thousands of fields into a few dozen objects, and every one of them paid that. Inside a
   * batch the objects are only remembered; when the outermost batch ends each of them says
   * it changed, once.
   */
  static batch<T>(work: () => T): T {
    GameObject.batching += 1;
    try {
      return work();
    } finally {
      GameObject.batching -= 1;
      if (GameObject.batching === 0) GameObject.flushBatch();
    }
  }

  private static batching = 0;
  private static batched: GameObject[] = [];

  private static flushBatch(): void {
    const changed = GameObject.batched;
    GameObject.batched = [];
    for (const object of changed) object.batchPending = false;

    let failure: { reason: unknown } | null = null;
    for (const object of changed) {
      try {
        object.announce();
      } catch (reason) {
        failure ??= { reason };
      }
    }
    if (failure) throw failure.reason;
  }

  /**
   * Records a change: bumps the version, sends the context to the room and queues a change notice.
   *
   * Synced fields call it on every assignment, so it is needed by hand only after mutating a synced
   * value in place. Inside GameObject.batch the object is only remembered, and all of this happens
   * once when the outermost batch ends.
   */
  update() {
    if (GameObject.batching > 0) {
      if (!this.batchPending) {
        this.batchPending = true;
        GameObject.batched.push(this);
      }
      return;
    }
    this.announce();
  }

  private batchPending = false;

  private announce(): void {
    this.versionUp();
    ObjectStore.instance.update(this.identifier);
    GameObject.onUpdate?.(this);
  }

  private versionUp() {
    this.context.majorVersion += 1;
    this.context.minorVersion = Math.random();
  }

  /**
   * Takes on a received context, replacing the version and all of the sync data.
   *
   * A null context or one for another identifier is ignored. Versions are not compared here, that is
   * left to the caller, and nothing is sent. Fields the context lacks end up undefined rather than
   * back at their defaults.
   */
  apply(context: ObjectContext | null) {
    if (context !== null && this.identifier === context.identifier) {
      this.context.majorVersion = context.majorVersion;
      this.context.minorVersion = context.minorVersion;
      this.context.syncData = context.syncData;
    }
  }

  /**
   * Copies the object by writing it to XML and reading it back.
   *
   * The copy, and any children it has, get new identifiers. It is added to the store and sent to
   * the room like any new object, so it is not a scratch copy.
   */
  clone(): this {
    const xmlString = this.toXml();
    return ObjectSerializer.instance.parseXml(xmlString)! as this;
  }

  /** How many changes the object has been through, without the random fraction that version adds. */
  get majorVersion(): number {
    return this.context.majorVersion;
  }

  /**
   * A snapshot of the object as it travels to peers: alias, identifier, version and sync data.
   *
   * The sync data is deep-copied, so later edits do not alter a snapshot still waiting to be sent.
   */
  toContext(): ObjectContext {
    return {
      aliasName: this.context.aliasName,
      identifier: this.context.identifier,
      majorVersion: this.context.majorVersion,
      minorVersion: this.context.minorVersion,
      syncData: structuredClone(this.context.syncData),
    };
  }

  /** The object, and for nodes their children, as the XML used by saved rooms and by clone. */
  toXml(): string {
    return ObjectSerializer.instance.toXml(this);
  }
}
