import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AuthorityEvent, CATALOG_BATCH } from '@axe/core/network/server/server-protocol';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CatalogItem, ObjectStore } from '@axe/core/sync/object-store';
import { isNewerVersion } from '@axe/core/sync/object-version';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';
import { shuffle } from '@axe/core/util/array-util';

type PeerId = string;
type ObjectIdentifier = string;

const OBJECT_SYNC_EVENTS: ReadonlySet<string> = new Set([
  'UPDATE_GAME_OBJECT',
  'DELETE_GAME_OBJECT',
  'SYNCHRONIZE_GAME_OBJECT',
  'REQUEST_GAME_OBJECT',
  'REQUEST_CATALOG',
  'FORGET_DELETED_OBJECTS',
  AuthorityEvent.AUTHORITATIVE,
  AuthorityEvent.WITHDRAW,
]);

const CATALOG_TICK_MS = 16;

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

  private constructor() {}

  /**
   * Starts handling object sync with peers: catalogs, object requests, updates and deletions.
   *
   * Calling it again replaces the earlier subscription. Each newly connected peer is sent the
   * catalog of this device. While the network is isolated, sync messages are ignored.
   */
  initialize() {
    this.destroy();

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        if (isNetworkIsolated() && OBJECT_SYNC_EVENTS.has(msg.eventName)) return;
        switch (msg.eventName) {
          case 'OPEN_NETWORK':
            this.askedOfServer.clear();
            break;
          case 'CONNECT_PEER': {
            const peerId = (msg as NetworkMessage<{ peerId: string }>).data.peerId;
            if (msg.isSendFromSelf && tradesCatalogWith(peerId)) this.sendCatalog(peerId);
            break;
          }
          case 'DISCONNECT_PEER':
            this.removePeerMap((msg as NetworkMessage<{ peerId: string }>).data.peerId);
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
            this.takeUpdate(msg as NetworkMessage<ObjectContext>);
            break;
          case 'FORGET_DELETED_OBJECTS':
            if (!msg.isSendFromSelf) this.forgetDeleted(msg.data as { identifiers?: ObjectIdentifier[] });
            break;
          case 'DELETE_GAME_OBJECT':
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
    this.askedOfServer.delete(data.identifier);
    const object = ObjectStore.instance.get(data.identifier);
    if (!object) return;
    data.aliasName = object.aliasName;
    withdraw(object);
  }

  /** Stops handling sync messages and cancels catalogs still being sent out. */
  destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    for (const sender of this.catalogSenders) clearInterval(sender);
    this.catalogSenders.clear();
    this.askedOfServer.clear();
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

    const targetPeerIdTasks = this.peerMap.get(targetPeerId);
    if (targetPeerIdTasks) targetPeerIdTasks.push(task);

    task.onfinish = (task) => {
      removeTask(this.tasks, task);
      const targetPeerIdTasks = this.peerMap.get(targetPeerId);
      if (targetPeerIdTasks) removeTask(targetPeerIdTasks, task);
      this.synchronize();
    };

    task.ontimeout = (_task, remainedRequests) => {
      Logger.warn('[ObjectSync] 同期タイムアウト');
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
