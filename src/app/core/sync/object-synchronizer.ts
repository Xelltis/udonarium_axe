import { LogThrottle } from '@axe/core/logging/log-throttle';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import {
  FIRST_SYNC_SETTLED,
  localDispatch,
  NetworkMessage,
  networkMessage$,
  networkSend,
} from '@axe/core/network/network-messaging';
import { AuthorityEvent, CATALOG_BATCH } from '@axe/core/network/server/server-protocol';
import { CatalogDigest, digestOf, isCatalogDigest, sameDigest } from '@axe/core/sync/catalog-digest';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CatalogItem, ObjectStore } from '@axe/core/sync/object-store';
import { isNewerVersion } from '@axe/core/sync/object-version';
import { syncProgressChanged$ } from '@axe/core/sync/sync-progress-events';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';
import { shuffle } from '@axe/core/util/array-util';
import { coalesce } from '@axe/core/util/debounce';

type PeerId = string;
type ObjectIdentifier = string;

const OBJECT_SYNC_EVENTS: ReadonlySet<string> = new Set([
  'UPDATE_GAME_OBJECT',
  'DELETE_GAME_OBJECT',
  'SYNCHRONIZE_GAME_OBJECT',
  'REQUEST_GAME_OBJECT',
  'REQUEST_CATALOG',
  'CATALOG_DIGEST',
  'FORGET_DELETED_OBJECTS',
  AuthorityEvent.AUTHORITATIVE,
  AuthorityEvent.WITHDRAW,
]);

/** How often, for one peer, requests given up after their retries are logged. */
const GIVEN_UP_LOG_INTERVAL_MS = 10_000;

/** How often one batch of a catalogue goes out. */
export const CATALOG_TICK_MS = 16;

/** How often this seat sends the peers it is connected to a digest of its catalogue. */
export const RECONCILE_INTERVAL_MS = 25_000;

/**
 * How long the objects must have been left alone before digests are compared. A change still on
 * its way to one of two peers makes their digests differ for a moment, which is not a difference
 * to trade catalogues over.
 */
export const RECONCILE_QUIET_MS = 3_000;

/** How many digests in a row from a peer must differ from this seat's before it is sent the catalogue. */
export const RECONCILE_DIFFERENCES = 2;

/**
 * How long the same difference with a peer is left alone once the catalogue has gone out over it,
 * so that two peers who cannot agree, as over an object one of them cannot make, do not trade
 * catalogues at every digest.
 */
export const SAME_DIFFERENCE_RETRY_MS = 5 * 60_000;

/** How long after the first peer connects a seat with nothing to ask for counts as synced. */
export const FIRST_SYNC_GRACE_MS = 5_000;

/** The least time between two catalogues sent to everybody on having synced. */
export const SETTLED_CATALOG_MIN_INTERVAL_MS = 10_000;

/** The least time between asking one peer for its catalogue again over requests it left unanswered, at first. */
export const CATALOG_REASK_MIN_MS = 60_000;

/** The most that time grows to, doubling each time the peer is asked again. */
export const CATALOG_REASK_MAX_MS = 8 * 60_000;

/** The least time between two notices that how far the sync has come has changed. */
export const SYNC_PROGRESS_NOTICE_MS = 250;

/** Where this seat stands with a peer whose digest differs from its own. */
interface PeerDifference {
  /** How many digests in a row have differed. */
  seen: number;
  /** The difference the catalogue last went out over, and when. */
  traded: { mine: CatalogDigest; theirs: CatalogDigest; at: number } | null;
}

export class ObjectSynchronizer {
  private static _instance: ObjectSynchronizer;
  /** The synchronizer shared by the whole app, created on first use. */
  static get instance(): ObjectSynchronizer {
    if (!ObjectSynchronizer._instance) ObjectSynchronizer._instance = new ObjectSynchronizer();
    return ObjectSynchronizer._instance;
  }

  private requestMap: Map<ObjectIdentifier, SynchronizeRequest> = new Map();
  /**
   * What this seat deleted and asked the room server about, on hearing another change it: made
   * again only from the server's answer, which comes after the deletion, not from a change passed
   * on meanwhile, which would put it back until then. It is no longer waited on once the server
   * withdraws it, once a loader says the name is coming back, or once another room is opened.
   */
  private readonly askedOfServer = new Set<ObjectIdentifier>();
  private peerMap: Map<PeerId, SynchronizeTask[]> = new Map();
  private tasks: SynchronizeTask[] = [];
  private cleanups: (() => void)[] = [];
  private readonly givenUpLog = new LogThrottle(GIVEN_UP_LOG_INTERVAL_MS);
  /** When an object was last changed or deleted, here or by a peer. */
  private lastChangeAt = Number.NEGATIVE_INFINITY;
  private readonly differences = new Map<PeerId, PeerDifference>();
  /** Whether anything has been asked for since the catalogue last went out to everybody. */
  private fetchedSinceSettled = false;
  /** Whether the catalogue has gone out to everybody since the network opened. */
  private settledOnce = false;
  private firstSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private settledSendTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSettledSendAt = Number.NEGATIVE_INFINITY;
  /** When each peer was last asked for its catalogue again, and how long to leave it before the next. */
  private readonly reasked = new Map<PeerId, { at: number; waitMs: number }>();
  /** How many objects were still to arrive when that was last looked at. */
  private noticedPending = 0;
  private progressAt = Number.NEGATIVE_INFINITY;
  private readonly tellProgress = coalesce(() => syncProgressChanged$.emit(), SYNC_PROGRESS_NOTICE_MS);

  private constructor() {}

  /**
   * How many objects this seat knows of and is still to receive: those asked for and not yet
   * arrived, and those waiting to be asked for. What a peer's catalogue has yet to list is not in it,
   * so the count may grow while a sync is under way.
   */
  get pendingCount(): number {
    let pending = this.requestMap.size;
    for (const task of this.tasks) pending += task.pendingCount;
    return pending;
  }

  /**
   * Whether this seat's objects have first synced since its network opened, as the
   * FIRST_SYNC_SETTLED event tells once. Never so through a room server, which keeps the room itself.
   */
  get isSettled(): boolean {
    return this.settledOnce;
  }

  /**
   * When the count of objects still to arrive last moved the right way, by `performance.now()`: when
   * an object asked for last arrived, or when this seat began to wait having had nothing to wait
   * for. A request given up or dropped does not count. Negative infinity before any.
   */
  get lastProgressAt(): number {
    return this.progressAt;
  }

  /**
   * Looks at how many objects are still to arrive, after anything that may have changed it, and
   * tells of a change on the syncProgressChanged$ channel, a run of changes at most once in
   * SYNC_PROGRESS_NOTICE_MS.
   */
  private noteProgress(arrived = false): void {
    const pending = this.pendingCount;
    if (arrived || (this.noticedPending < 1 && 0 < pending)) this.progressAt = performance.now();
    if (pending === this.noticedPending) return;
    this.noticedPending = pending;
    this.tellProgress();
  }

  /**
   * Starts handling object sync with peers: catalogs, object requests, updates and deletions.
   *
   * Calling it again replaces the earlier subscription. Each newly connected peer is sent the
   * catalog of this device. While the network is isolated, sync messages are ignored.
   *
   * Between peers, with no room server, the catalog is not left at that one exchange. It goes out
   * to every peer again once this seat has taken in what it asked for, a digest of it goes to
   * every peer at intervals, and a peer whose digest keeps differing is sent the catalog. The
   * first time it goes out again after a network opens, this seat is told that its objects have
   * first synced, by the FIRST_SYNC_SETTLED event.
   */
  initialize() {
    this.destroy();

    const reconciling = setInterval(() => this.sendDigests(), RECONCILE_INTERVAL_MS);
    this.cleanups.push(() => clearInterval(reconciling));

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        if (isNetworkIsolated() && OBJECT_SYNC_EVENTS.has(msg.eventName)) return;
        switch (msg.eventName) {
          case 'OPEN_NETWORK':
            this.askedOfServer.clear();
            this.forgetReconciling();
            break;
          case 'CONNECT_PEER': {
            const peerId = (msg as NetworkMessage<{ peerId: string }>).data.peerId;
            if (msg.isSendFromSelf && tradesCatalogWith(peerId)) {
              this.sendCatalog(peerId);
              this.awaitFirstSync();
            }
            break;
          }
          case 'DISCONNECT_PEER': {
            const peerId = (msg as NetworkMessage<{ peerId: string }>).data.peerId;
            this.differences.delete(peerId);
            this.reasked.delete(peerId);
            this.removePeerMap(peerId);
            break;
          }
          case 'CATALOG_DIGEST':
            if (!msg.isSendFromSelf) this.answerDigest(msg.data, msg.sendFrom);
            break;
          case 'REQUEST_CATALOG':
            if (!msg.isSendFromSelf) this.sendCatalog(msg.sendFrom);
            break;
          case 'SYNCHRONIZE_GAME_OBJECT':
            if (!msg.isSendFromSelf) this.answerCatalog(msg.data as CatalogItem[], msg.sendFrom);
            break;
          case 'REQUEST_GAME_OBJECT':
            if (!msg.isSendFromSelf) this.answerRequest(msg.data as string, msg.sendFrom);
            break;
          case 'UPDATE_GAME_OBJECT':
            this.lastChangeAt = performance.now();
            this.takeUpdate(msg as NetworkMessage<ObjectContext>);
            break;
          case 'FORGET_DELETED_OBJECTS':
            if (!msg.isSendFromSelf) this.forgetDeleted(msg.data as { identifiers?: ObjectIdentifier[] });
            break;
          case 'DELETE_GAME_OBJECT':
            this.lastChangeAt = performance.now();
            if (!msg.isSendFromSelf) this.takeDeletion((msg.data as { identifier: string }).identifier);
            break;
          case AuthorityEvent.AUTHORITATIVE:
            if (isFromAuthority(msg.sendFrom)) this.takeAuthoritative(msg.data as ObjectContext, msg.sendFrom);
            break;
          case AuthorityEvent.WITHDRAW:
            if (isFromAuthority(msg.sendFrom))
              this.takeWithdrawal(msg.data as { identifier: string; aliasName?: string });
            break;
        }
      })
    );
  }

  /**
   * Answers a peer's catalog: asks for what it lists, but answers its listing of something deleted
   * here with the deletion. A room server keeps what was deleted itself, so what its catalog lists it
   * holds now, brought back since as it may have been while this seat was away.
   */
  private answerCatalog(catalog: CatalogItem[], sendFrom: PeerId): void {
    const fromServer = sendFrom === Network.authorityPeerId;
    if (fromServer) ObjectStore.instance.forgetDeleted(catalog.map((item) => item.identifier));
    for (const item of catalog) {
      if (ObjectStore.instance.isDeleted(item.identifier)) {
        networkSend('DELETE_GAME_OBJECT', { aliasName: '', identifier: item.identifier }, sendFrom);
      } else {
        this.addRequestMap(item, sendFrom);
      }
    }
    this.synchronize();
    this.noteProgress();
  }

  /** Sends a peer the object it asks for, or the deletion where it was deleted here. */
  private answerRequest(identifier: string, sendFrom: PeerId): void {
    if (ObjectStore.instance.isDeleted(identifier)) {
      networkSend('DELETE_GAME_OBJECT', { aliasName: '', identifier }, sendFrom);
      return;
    }
    const obj = ObjectStore.instance.get(identifier);
    if (obj) networkSend('UPDATE_GAME_OBJECT', obj.toContext(), sendFrom);
  }

  /**
   * Takes an update: into the object held, which is told as changed, or as a new object, unless it
   * was deleted here, or this seat is waiting on the room server's answer about it. A seat's own
   * update heard back is told as its own however its peer is called by now.
   */
  private takeUpdate(msg: NetworkMessage<ObjectContext>): void {
    const context = msg.data;
    const origin = msg.isSendFromSelf ? Network.peerId : msg.sendFrom;
    let object: GameObject | null = ObjectStore.instance.get(context.identifier);
    if (object) {
      if (!msg.isSendFromSelf) object = this.updateObject(object, context);
      markForChanged(object, origin);
    } else if (ObjectStore.instance.isDeleted(context.identifier)) {
      if (!msg.isSendFromSelf) this.answerChangeOfDeleted(context, msg.sendFrom);
    } else if (
      Network.authorityPeerId == null ||
      !this.askedOfServer.has(context.identifier) ||
      isFromAuthority(msg.sendFrom)
    ) {
      this.askedOfServer.delete(context.identifier);
      object = this.createObject(context);
      if (object) markForChanged(object, origin);
    }
  }

  /**
   * Lets the names a loader says are coming back out of the graveyard before they arrive.
   *
   * A room being loaded takes objects away and puts some of them back under the names they were
   * saved under. To a seat that only watched, each of those is a deletion being undone, and left to
   * itself it has the loader delete it again, which takes the effect library and the sample cut-ins
   * out of a room just loaded whenever somebody else is connected.
   */
  private forgetDeleted(data: { identifiers?: ObjectIdentifier[] }): void {
    const identifiers = data.identifiers ?? [];
    ObjectStore.instance.forgetDeleted(identifiers);
    for (const identifier of identifiers) this.askedOfServer.delete(identifier);
  }

  /**
   * Takes a deletion heard from a peer. The store took the object away before the word went out, so
   * hearing it back does nothing but take away whatever has been put back under that name since: a
   * room just loaded brings back its parties and effect library under the names they were saved
   * under, and its own deletions arrive after them.
   */
  private takeDeletion(identifier: ObjectIdentifier): void {
    this.askedOfServer.delete(identifier);
    ObjectStore.instance.delete(identifier, false);
  }

  /**
   * Takes the room server's word on an object, which outranks any version: it undoes a change this
   * seat may not make, and hands over what has just come into its view.
   */
  private takeAuthoritative(context: ObjectContext, sendFrom: PeerId): void {
    this.askedOfServer.delete(context.identifier);
    ObjectStore.instance.forgetDeleted([context.identifier]);
    const object = ObjectStore.instance.get(context.identifier);
    if (object) {
      object.apply(context);
      markForChanged(object, sendFrom);
    } else {
      const created = this.createObject(context);
      if (created) markForChanged(created, sendFrom);
    }
  }

  /**
   * Lets go of what has gone out of this seat's view, or what it made but may not, without marking
   * it deleted, so it can come back. Something asked for that went out of view before it came is no
   * longer waited on. Those who hear of it after this, such as the replay recorder, are told what it was.
   */
  private takeWithdrawal(data: { identifier: string; aliasName?: string }): void {
    this.requestMap.delete(data.identifier);
    this.noteProgress();
    this.askedOfServer.delete(data.identifier);
    const object = ObjectStore.instance.get(data.identifier);
    if (!object) return;
    data.aliasName = object.aliasName;
    withdraw(object);
  }

  /** Stops handling sync messages and cancels catalogs still being sent out, or due to be. */
  destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    for (const sender of this.catalogSenders) clearInterval(sender);
    this.catalogSenders.clear();
    this.askedOfServer.clear();
    this.forgetReconciling();
    this.tellProgress.cancel();
  }

  /** Starts over on what is kept for reconciling with peers, as when another network opens. */
  private forgetReconciling(): void {
    if (this.firstSyncTimer !== null) clearTimeout(this.firstSyncTimer);
    if (this.settledSendTimer !== null) clearTimeout(this.settledSendTimer);
    this.firstSyncTimer = this.settledSendTimer = null;
    this.differences.clear();
    this.reasked.clear();
    this.fetchedSinceSettled = false;
    if (this.settledOnce) this.tellProgress();
    this.settledOnce = false;
    this.lastSettledSendAt = Number.NEGATIVE_INFINITY;
  }

  /** Whether peers reconcile catalogues among themselves: not through a room server, nor while isolated. */
  private get reconciles(): boolean {
    return Network.authorityPeerId == null && !isNetworkIsolated();
  }

  /** Whether this seat's catalogue is in the middle of changing, so that its digest says little. */
  private get isUnsettled(): boolean {
    if (0 < this.requestMap.size || 0 < this.tasks.length || 0 < this.catalogSenders.size) return true;
    return performance.now() - this.lastChangeAt < RECONCILE_QUIET_MS;
  }

  /**
   * Sends every connected peer a digest of this seat's catalogue, unless the catalogue is changing
   * just now. Nothing is waited for in return: a peer that does not know the message ignores it,
   * and one that does speaks up only if its own digest keeps differing.
   */
  private sendDigests(): void {
    if (!this.reconciles) return;
    const peerIds = syncPeerIds();
    if (peerIds.length < 1 || this.isUnsettled) return;
    const digest = digestOf(ObjectStore.instance.getCatalog());
    for (const peerId of peerIds) networkSend('CATALOG_DIGEST', digest, peerId);
  }

  /**
   * Compares a peer's digest with this seat's, and sends the peer the catalogue once enough of its
   * digests in a row have differed. The peer does the same on this seat's digests, so each ends
   * up asking the other for what it lacks, as on connecting. The same difference is not answered
   * again for a while.
   */
  private answerDigest(data: unknown, sendFrom: PeerId): void {
    if (!this.reconciles || !isCatalogDigest(data) || !connectedPeerIds().has(sendFrom)) return;
    if (this.isUnsettled) return;
    const mine = digestOf(ObjectStore.instance.getCatalog());
    if (sameDigest(mine, data)) {
      this.differences.delete(sendFrom);
      return;
    }
    const difference = this.differences.get(sendFrom) ?? { seen: 0, traded: null };
    this.differences.set(sendFrom, difference);
    difference.seen++;
    if (difference.seen < RECONCILE_DIFFERENCES) return;

    const now = performance.now();
    const traded = difference.traded;
    const isSameDifference = traded !== null && sameDigest(traded.mine, mine) && sameDigest(traded.theirs, data);
    if (isSameDifference && now - traded.at < SAME_DIFFERENCE_RETRY_MS) return;
    difference.traded = { mine, theirs: { count: data.count, hash: data.hash }, at: now };
    Logger.info(`[ObjectSync] カタログの要約が食い違うためカタログを送ります: ${sendFrom}`);
    this.sendCatalog(sendFrom);
  }

  /** Counts a seat that has had nothing to ask for a while after its first peer connected as synced. */
  private awaitFirstSync(): void {
    if (!this.reconciles || this.settledOnce || this.firstSyncTimer !== null) return;
    this.firstSyncTimer = setTimeout(() => {
      this.firstSyncTimer = null;
      if (this.settledOnce || 0 < this.requestMap.size || 0 < this.tasks.length) return;
      this.offerCatalogToAll();
    }, FIRST_SYNC_GRACE_MS);
  }

  /** Sends the catalogue to everybody once what was asked for has all come in, or been given up. */
  private noteSettled(): void {
    if (!this.fetchedSinceSettled || 0 < this.requestMap.size || 0 < this.tasks.length) return;
    this.fetchedSinceSettled = false;
    this.offerCatalogToAll();
  }

  /**
   * Sends this seat's catalogue to every connected peer, for those that connected while this seat
   * had little to list: a peer is otherwise sent the catalogue once, on connecting. Held to one
   * round in a while, the last of a run going out when that has passed.
   *
   * The first time since the network opened is when this seat's objects have first synced, which
   * this seat is told by the FIRST_SYNC_SETTLED event, once for that network.
   */
  private offerCatalogToAll(): void {
    if (!this.reconciles) return;
    const isFirstSync = !this.settledOnce;
    this.settledOnce = true;
    this.sendCatalogToAllInTurn();
    if (!isFirstSync) return;
    this.tellProgress();
    localDispatch(FIRST_SYNC_SETTLED, {});
  }

  private sendCatalogToAllInTurn(): void {
    if (this.settledSendTimer !== null) return;
    const wait = this.lastSettledSendAt + SETTLED_CATALOG_MIN_INTERVAL_MS - performance.now();
    if (0 < wait) {
      this.settledSendTimer = setTimeout(() => {
        this.settledSendTimer = null;
        this.offerCatalogToAll();
      }, wait);
      return;
    }
    this.lastSettledSendAt = performance.now();
    for (const peerId of syncPeerIds()) this.sendCatalog(peerId);
  }

  /**
   * Asks the peers that hold what a task gave up on for their catalogues again, so that it is
   * asked for afresh instead of forgotten. A peer is asked at most once in a while, a longer
   * while each time.
   */
  private askCatalogAgain(taskPeerId: PeerId, givenUp: readonly SynchronizeRequest[]): void {
    if (givenUp.length < 1 || !this.reconciles) return;
    const reachable = connectedPeerIds();
    const holders = new Set<PeerId>();
    for (const request of givenUp) {
      for (const holderId of [taskPeerId, ...request.holderIds]) {
        if (reachable.has(holderId)) holders.add(holderId);
      }
    }
    const now = performance.now();
    for (const holderId of holders) {
      const asked = this.reasked.get(holderId);
      if (asked && now - asked.at < asked.waitMs) continue;
      const waitMs = asked ? Math.min(asked.waitMs * 2, CATALOG_REASK_MAX_MS) : CATALOG_REASK_MIN_MS;
      this.reasked.set(holderId, { at: now, waitMs });
      networkSend('REQUEST_CATALOG', {}, holderId);
    }
  }

  /**
   * Syncs again by trading catalogs with every open peer, or with the room server alone when
   * there is one; gives how many were asked.
   */
  requestFullSync(): number {
    const peerIds = syncPeerIds();
    for (const peerId of peerIds) {
      this.sendCatalog(peerId);
      networkSend('REQUEST_CATALOG', {}, peerId);
    }
    Logger.info(`[ObjectSync] ${peerIds.length}ピアへ再同期を要求しました`);
    return peerIds.length;
  }

  private updateObject(object: GameObject, context: ObjectContext): GameObject {
    if (isNewerVersion(context, object.version)) {
      object.apply(context);
    }
    return object;
  }

  private createObject(context: ObjectContext): GameObject | null {
    const newObject = ObjectFactory.instance.create(context.aliasName, context.identifier);
    if (!newObject) {
      Logger.warn(`[ObjectSync] 未知のオブジェクト: ${context.aliasName}`, context);
      return null;
    }
    ObjectStore.instance.add(newObject, false, () => newObject.apply(context));
    return newObject;
  }

  private readonly catalogSenders = new Set<ReturnType<typeof setInterval>>();

  private sendCatalog(sendTo: PeerId) {
    const catalog = ObjectStore.instance.getCatalog();
    const interval = setInterval(() => {
      const count = catalog.length < CATALOG_BATCH ? catalog.length : CATALOG_BATCH;
      networkSend('SYNCHRONIZE_GAME_OBJECT', catalog.splice(0, count), sendTo);
      if (catalog.length < 1) {
        clearInterval(interval);
        this.catalogSenders.delete(interval);
      }
    }, CATALOG_TICK_MS);
    this.catalogSenders.add(interval);
  }

  /**
   * Answers a change of something deleted here. A peer is told it is deleted. A room server keeps
   * deletions itself, so what it passes on is there now, as for what its catalog lists: it is
   * asked for, and its answer comes after any deletion this seat sent before. A deletion sent back
   * would take the object from everybody, when it may be only this seat that lost it.
   */
  private answerChangeOfDeleted(context: ObjectContext, sendFrom: PeerId): void {
    const authority = Network.authorityPeerId;
    if (authority == null) {
      networkSend('DELETE_GAME_OBJECT', { aliasName: context.aliasName, identifier: context.identifier }, sendFrom);
      return;
    }
    ObjectStore.instance.forgetDeleted([context.identifier]);
    this.askedOfServer.add(context.identifier);
    this.addRequestMap(
      { identifier: context.identifier, version: context.majorVersion + context.minorVersion },
      authority
    );
    this.synchronize();
    this.noteProgress();
  }

  private addRequestMap(item: CatalogItem, sendFrom: PeerId) {
    const request = this.requestMap.get(item.identifier);
    if (request && request.version === item.version) {
      request.holderIds.push(sendFrom);
      this.addPeerMap(sendFrom);
    } else if (!request || request.version < item.version) {
      this.requestMap.set(item.identifier, {
        identifier: item.identifier,
        version: item.version,
        holderIds: [sendFrom],
        ttl: 2,
      });
      this.addPeerMap(sendFrom);
    }
  }

  private addPeerMap(targetPeerId: PeerId) {
    if (!this.peerMap.has(targetPeerId)) this.peerMap.set(targetPeerId, []);
  }

  private removePeerMap(targetPeerId: PeerId) {
    this.peerMap.delete(targetPeerId);
    this.dropOrphanedRequests();
    this.noteProgress();
  }

  private synchronize() {
    const exhausted = new Set<PeerId>();
    while (0 < this.requestMap.size && this.tasks.length < 32) {
      const targetPeerId = this.getTargetPeerId(exhausted);
      if (!targetPeerId) {
        this.dropOrphanedRequests();
        return;
      }
      if (!this.runSynchronizeTask(targetPeerId)) exhausted.add(targetPeerId);
    }
  }

  /** Forgets what is still wanted only from peers that are no longer connected. */
  private dropOrphanedRequests() {
    const reachable = connectedPeerIds();
    for (const [identifier, request] of this.requestMap) {
      request.holderIds = request.holderIds.filter((holderId) => reachable.has(holderId));
      if (request.holderIds.length < 1) this.requestMap.delete(identifier);
    }
  }

  private runSynchronizeTask(targetPeerId: PeerId): boolean {
    const requests: SynchronizeRequest[] = this.makeRequestList(targetPeerId);

    if (requests.length < 1) {
      if ((this.peerMap.get(targetPeerId)?.length ?? 0) < 1) this.peerMap.delete(targetPeerId);
      return false;
    }
    const task = SynchronizeTask.create(targetPeerId, requests);
    this.tasks.push(task);
    this.fetchedSinceSettled = true;

    const targetPeerIdTasks = this.peerMap.get(targetPeerId);
    if (targetPeerIdTasks) targetPeerIdTasks.push(task);

    task.onsynchronize = () => this.noteProgress(true);

    task.onfinish = (task) => {
      removeTask(this.tasks, task);
      const targetPeerIdTasks = this.peerMap.get(targetPeerId);
      if (targetPeerIdTasks) removeTask(targetPeerIdTasks, task);
      this.synchronize();
      this.noteSettled();
      this.noteProgress();
    };

    task.ontimeout = (_task, remainedRequests, givenUpRequests) => {
      Logger.warn('[ObjectSync] 同期タイムアウト');
      this.reportGivenUp(targetPeerId, givenUpRequests);
      this.askCatalogAgain(targetPeerId, givenUpRequests);
      const reachable = connectedPeerIds();
      for (const request of remainedRequests) {
        request.holderIds = request.holderIds.filter((holderId) => reachable.has(holderId));
        if (request.holderIds.length < 1) continue;
        const current = this.requestMap.get(request.identifier);
        if (!current || current.version < request.version) {
          this.requestMap.set(request.identifier, request);
          for (const holderId of request.holderIds) this.addPeerMap(holderId);
        }
      }
    };
    return true;
  }

  /** Logs the requests a task gave up on after asking as often as their ttl allowed. */
  private reportGivenUp(peerId: PeerId, givenUp: readonly SynchronizeRequest[]): void {
    if (givenUp.length < 1) return;
    const held = this.givenUpLog.pass(peerId);
    if (held === null) return;
    const sample = givenUp.slice(0, 5).map((request) => request.identifier);
    Logger.warn(
      `[ObjectSync] 再試行を使い切った要求を諦めました: ${givenUp.length}件 <${peerId}>（前回の記録から他に${held}回）`,
      sample
    );
  }

  private makeRequestList(targetPeerId: PeerId, maxRequest: number = 32): SynchronizeRequest[] {
    const requests: SynchronizeRequest[] = [];

    for (const [identifier, request] of this.requestMap) {
      if (maxRequest <= requests.length) break;
      if (!request.holderIds.includes(targetPeerId)) continue;

      const gameObject = ObjectStore.instance.get(request.identifier);
      if (!gameObject || gameObject.version < request.version) requests.push(request);

      this.requestMap.delete(identifier);
    }
    return requests;
  }

  private getTargetPeerId(exclude: ReadonlySet<PeerId>): PeerId | null {
    let min = Infinity;
    let selectPeerId: PeerId | null = null;
    const peerIds = shuffle(syncPeerIds());

    for (const peerId of peerIds) {
      if (exclude.has(peerId)) continue;
      const tasks = this.peerMap.get(peerId);
      if (tasks && tasks.length < min) {
        min = tasks.length;
        selectPeerId = peerId;
      }
    }
    return selectPeerId;
  }
}

/**
 * The peers to trade catalogs with and ask for objects: the room server alone when the room has
 * one, which keeps the table for everybody, and every open peer otherwise.
 */
function syncPeerIds(): PeerId[] {
  const authority = Network.authorityPeerId;
  if (authority != null) return [authority];
  return Network.peerContexts.filter((peer) => peer.isOpen).map((peer) => peer.peerId);
}

/** Whether a message comes from the room server itself, the only one whose word outranks versions. */
function isFromAuthority(sendFrom: PeerId): boolean {
  const authority = Network.authorityPeerId;
  return authority != null && sendFrom === authority;
}

/**
 * Takes an object and everything beneath it out of this device's store, deepest first, marking
 * nothing deleted and telling no peer: the room server's copy stays, to be taken again.
 */
export function withdraw(object: GameObject): void {
  if (object instanceof ObjectNode) {
    for (const child of [...object.children]) withdraw(child);
  }
  ObjectStore.instance.remove(object);
}

/** Whether a newly connected peer is one to send this device's catalog to. */
function tradesCatalogWith(peerId: PeerId): boolean {
  const authority = Network.authorityPeerId;
  return authority == null || peerId === authority;
}

/** The peers that can still be asked for an object. */
function connectedPeerIds(): Set<PeerId> {
  return new Set(syncPeerIds());
}

function removeTask(tasks: SynchronizeTask[], task: SynchronizeTask): void {
  const index = tasks.indexOf(task);
  if (index >= 0) tasks.splice(index, 1);
}
