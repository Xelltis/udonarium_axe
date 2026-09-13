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
  static get instance(): ObjectSynchronizer {
    if (!ObjectSynchronizer._instance) ObjectSynchronizer._instance = new ObjectSynchronizer();
    return ObjectSynchronizer._instance;
  }

  private requestMap: Map<ObjectIdentifier, SynchronizeRequest> = new Map();
  private peerMap: Map<PeerId, SynchronizeTask[]> = new Map();
  private tasks: SynchronizeTask[] = [];
  private cleanups: (() => void)[] = [];

  private constructor() {}

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
          // being undone, and it answers by having the loader delete it again - so the effect
          // library and the sample cut-ins went missing from a room that had just been loaded,
          // but only ever while somebody else was connected. The loader says which names are
          // coming back, and they leave the graveyard before they arrive.
          case 'FORGET_DELETED_OBJECTS': {
            if (msg.isSendFromSelf) break;
            const { identifiers } = msg.data as { identifiers?: ObjectIdentifier[] };
            ObjectStore.instance.forgetDeleted(identifiers ?? []);
            break;
          }
          case 'DELETE_GAME_OBJECT': {
            const identifier: ObjectIdentifier = (msg.data as { identifier: string }).identifier;
            ObjectStore.instance.delete(identifier, false);
            break;
          }
        }
      })
    );
  }

  destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    for (const sender of this.catalogSenders) clearInterval(sender);
    this.catalogSenders.clear();
  }

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
  }

  private synchronize() {
    while (0 < this.requestMap.size && this.tasks.length < 32) this.runSynchronizeTask();
  }

  private runSynchronizeTask() {
    const targetPeerId = this.getTargetPeerId();
    if (!targetPeerId) return;
    const requests: SynchronizeRequest[] = this.makeRequestList(targetPeerId);

    if (requests.length < 1) {
      this.removePeerMap(targetPeerId);
      return;
    }
    const task = SynchronizeTask.create(targetPeerId, requests);
    this.tasks.push(task);

    const targetPeerIdTasks = this.peerMap.get(targetPeerId);
    if (targetPeerIdTasks) targetPeerIdTasks.push(task);

    task.onfinish = (task) => {
      this.tasks.splice(this.tasks.indexOf(task), 1);
      const targetPeerIdTasks = this.peerMap.get(targetPeerId);
      if (targetPeerIdTasks) targetPeerIdTasks.splice(targetPeerIdTasks.indexOf(task), 1);
      this.synchronize();
    };

    task.ontimeout = (_task, remainedRequests) => {
      Logger.warn('[ObjectSync] 同期タイムアウト');
      for (const request of remainedRequests) this.requestMap.set(request.identifier, request);
    };
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

  private getTargetPeerId(): PeerId | null {
    let min = Infinity;
    let selectPeerId: PeerId | null = null;
    const peerContexts = Network.peerContexts;

    for (let i = peerContexts.length - 1; 0 <= i; i--) {
      const rand = Math.floor(Math.random() * (i + 1));
      [peerContexts[i], peerContexts[rand]] = [peerContexts[rand], peerContexts[i]];
    }

    for (const peerContext of peerContexts) {
      const tasks = this.peerMap.get(peerContext.peerId);
      if (peerContext.isOpen && tasks && tasks.length < min) {
        min = tasks.length;
        selectPeerId = peerContext.peerId;
      }
    }
    return selectPeerId;
  }
}
