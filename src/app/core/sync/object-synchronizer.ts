import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { CatalogItem, ObjectStore } from '@axe/core/sync/object-store';
import { SynchronizeRequest, SynchronizeTask } from '@axe/core/sync/synchronize-task';

type PeerId = string;
type ObjectIdentifier = string;

const OBJECT_SYNC_EVENTS: ReadonlySet<string> = new Set([
  'UPDATE_GAME_OBJECT',
  'DELETE_GAME_OBJECT',
  'SYNCHRONIZE_GAME_OBJECT',
  'REQUEST_GAME_OBJECT',
  'REQUEST_CATALOG',
  'FORGET_DELETED_OBJECTS',
]);

const CATALOG_BATCH = 2048;
const CATALOG_TICK_MS = 16;

export class ObjectSynchronizer {
  private static _instance: ObjectSynchronizer;
  /** The synchronizer shared by the whole app, created on first use. */
  static get instance(): ObjectSynchronizer {
    if (!ObjectSynchronizer._instance) ObjectSynchronizer._instance = new ObjectSynchronizer();
    return ObjectSynchronizer._instance;
  }

  private requestMap: Map<ObjectIdentifier, SynchronizeRequest> = new Map();
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
          case 'CONNECT_PEER':
            if (msg.isSendFromSelf) this.sendCatalog((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case 'DISCONNECT_PEER':
            this.removePeerMap((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case 'REQUEST_CATALOG':
            if (msg.isSendFromSelf) break;
            this.sendCatalog(msg.sendFrom);
            break;
          case 'SYNCHRONIZE_GAME_OBJECT': {
            if (msg.isSendFromSelf) break;
            const catalog: CatalogItem[] = msg.data as CatalogItem[];
            for (const item of catalog) {
              if (ObjectStore.instance.isDeleted(item.identifier)) {
                networkSend('DELETE_GAME_OBJECT', { aliasName: '', identifier: item.identifier }, msg.sendFrom);
              } else {
                this.addRequestMap(item, msg.sendFrom);
              }
            }
            this.synchronize();
            break;
          }
          case 'REQUEST_GAME_OBJECT': {
            if (msg.isSendFromSelf) break;
            const id = msg.data as string;
            if (ObjectStore.instance.isDeleted(id)) {
              networkSend('DELETE_GAME_OBJECT', { aliasName: '', identifier: id }, msg.sendFrom);
            } else {
              const obj = ObjectStore.instance.get(id);
              if (obj) networkSend('UPDATE_GAME_OBJECT', obj.toContext(), msg.sendFrom);
            }
            break;
          }
          case 'UPDATE_GAME_OBJECT': {
            const context: ObjectContext = msg.data as ObjectContext;
            let object: GameObject | null = ObjectStore.instance.get(context.identifier);
            if (object) {
              if (!msg.isSendFromSelf) object = this.updateObject(object, context);
              markForChanged(object, msg.sendFrom);
            } else if (ObjectStore.instance.isDeleted(context.identifier)) {
              networkSend(
                'DELETE_GAME_OBJECT',
                { aliasName: context.aliasName, identifier: context.identifier },
                msg.sendFrom
              );
            } else {
              object = this.createObject(context);
              if (object) markForChanged(object, msg.sendFrom);
            }
            break;
          }
          // A room being loaded takes objects away and puts some of them back under the names
          // they were saved under. To a seat that only watched, each of those is a deletion
          // being undone, and left to itself it has the loader delete it again, which takes the
          // effect library and the sample cut-ins out of a room just loaded whenever somebody
          // else is connected. The loader says which names are coming back, and they leave the
          // graveyard before they arrive.
          case 'FORGET_DELETED_OBJECTS': {
            if (msg.isSendFromSelf) break;
            const { identifiers } = msg.data as { identifiers?: ObjectIdentifier[] };
            ObjectStore.instance.forgetDeleted(identifiers ?? []);
            break;
          }
          // The store took the object away before the word went out, so hearing it back
          // does nothing but take away whatever has been put back under that name since:
          // a room just loaded brings back its parties and effect library under the names
          // they were saved under, and its own deletions arrive after them.
          case 'DELETE_GAME_OBJECT': {
            if (msg.isSendFromSelf) break;
            const identifier: ObjectIdentifier = (msg.data as { identifier: string }).identifier;
            ObjectStore.instance.delete(identifier, false);
            break;
          }
        }
      })
    );
  }

  /** Stops handling sync messages and cancels catalogs still being sent out. */
  destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    for (const sender of this.catalogSenders) clearInterval(sender);
    this.catalogSenders.clear();
  }

  /** Syncs again with every open peer by trading catalogs with each; gives how many were asked. */
  requestFullSync(): number {
    const peerIds = Network.peerContexts.filter((peer) => peer.isOpen).map((peer) => peer.peerId);
    for (const peerId of peerIds) {
      this.sendCatalog(peerId);
      networkSend('REQUEST_CATALOG', {}, peerId);
    }
    Logger.info(`[ObjectSync] ${peerIds.length}ピアへ再同期を要求しました`);
    return peerIds.length;
  }

  private updateObject(object: GameObject, context: ObjectContext): GameObject {
    if (context.majorVersion + context.minorVersion > object.version) {
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
    // The order is: register in the maps, apply, then the store hook.
    // Registering first means that the chain from applying through the parent and its child
    // hooks can still look the object up in the store.
    // the store hook runs after applying, so the sync vars are populated
    // (e.g. GameTable.selected)。
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
    const peerContexts = Network.peerContexts;

    for (let i = peerContexts.length - 1; 0 <= i; i--) {
      const rand = Math.floor(Math.random() * (i + 1));
      [peerContexts[i], peerContexts[rand]] = [peerContexts[rand], peerContexts[i]];
    }

    for (const peerContext of peerContexts) {
      if (exclude.has(peerContext.peerId)) continue;
      const tasks = this.peerMap.get(peerContext.peerId);
      if (peerContext.isOpen && tasks && tasks.length < min) {
        min = tasks.length;
        selectPeerId = peerContext.peerId;
      }
    }
    return selectPeerId;
  }
}

/** The peers that can still be asked for an object: the ones connected right now. */
function connectedPeerIds(): Set<PeerId> {
  return new Set(Network.peerContexts.filter((peer) => peer.isOpen).map((peer) => peer.peerId));
}

function removeTask(tasks: SynchronizeTask[], task: SynchronizeTask): void {
  const index = tasks.indexOf(task);
  if (index >= 0) tasks.splice(index, 1);
}
