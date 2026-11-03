import { fileResourceUpdated$ } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { localDispatch, NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import type { CatalogItem } from '@axe/core/storage/audio-storage';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { ModelFile, ModelFileContext, ModelState } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';

/**
 * How long a finished transfer waits before telling everyone else what this seat now holds.
 * Transfers finish in runs while a room fills up, and each run needs to be told only once.
 */
const CATALOG_BROADCAST_DELAY_MS = 1000;

/**
 * Trades the 3D models between peers as the sounds are traded: catalogues, requests, transfers one
 * file at a time from each peer holding one, and the room server's asset store where the room has
 * one.
 */
export class ModelSharingSystem {
  private static _instance: ModelSharingSystem;
  /** The one model sharing system for the page, created on first use. */
  static get instance(): ModelSharingSystem {
    if (!ModelSharingSystem._instance) ModelSharingSystem._instance = new ModelSharingSystem();
    return ModelSharingSystem._instance;
  }

  private sendTaskMap: Map<string, BufferSharingTask<ModelFileContext>> = new Map();
  private receiveTaskMap: Map<string, BufferSharingTask<ModelFileContext>> = new Map();
  private maxSendTask: number = 2;
  private maxReceiveTask: number = 4;
  private cleanups: (() => void)[] = [];
  /**
   * Models being fetched from the asset server, so a second catalogue does not fetch one again, each
   * with the first peer whose catalogue named it meanwhile, to ask should the server fail.
   */
  private httpFetching: Map<string, string | null> = new Map();
  /** Models the asset server did not have, which are asked of peers from then on. */
  private httpMissed: Set<string> = new Set();
  /** Models the room server's operator took down, asked of nobody: neither the store nor a peer. */
  private httpBarred: Set<string> = new Set();
  /** Models the room's list named that the asset server could not send just then. */
  private httpRetries = new AssetRetries();

  /**
   * The models to fetch before any other, such as those the pieces in view wear.
   *
   * Models arrive one file at a time from each peer holding one, so a newcomer to a room with many
   * would otherwise wait for a random run of them before seeing the ones on the table.
   */
  preferredIdentifiers: () => readonly string[] = () => [];

  private constructor() {}

  /**
   * Starts answering the network messages that trade models between peers: catalogues,
   * requests, transfers and cancellations.
   *
   * Calling it again drops the earlier subscription first, so it never listens twice.
   */
  initialize() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'CONNECT_PEER':
            if ((msg as NetworkMessage<{ peerId: string }>).isSendFromSelf)
              ModelStorage.instance.synchronize((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case 'SYNCHRONIZE_MODEL_LIST': {
            if (msg.isSendFromSelf) break;
            const otherCatalog: CatalogItem[] = msg.data as CatalogItem[];
            const request: CatalogItem[] = [];
            for (const item of this.preferredFirst(otherCatalog)) {
              if (ModelStorage.instance.isRemoved(item.identifier) || this.httpBarred.has(item.identifier)) continue;
              let model = ModelStorage.instance.get(item.identifier);
              if (model === null) {
                model = ModelFile.createEmpty(item.identifier, item.name);
                ModelStorage.instance.add(model);
              }
              if (model.state < ModelState.COMPLETE && !this.receiveTaskMap.has(item.identifier)) {
                if (this.fetchOverHttp(item.identifier, msg.sendFrom)) continue;
                request.push({ identifier: item.identifier, state: model.state });
              }
            }
            if (
              request.length < 1 &&
              !this.hasActiveTask() &&
              otherCatalog.length < ModelStorage.instance.getCatalog().length
            ) {
              ModelStorage.instance.synchronize(msg.sendFrom);
            }
            if (request.length < 1 || this.isLimitReceiveTask()) break;
            this.request([this.pickRequest(request)], msg.sendFrom);
            break;
          }
          case 'REQUEST_MODEL_RESOURE': {
            if (msg.isSendFromSelf) break;
            const data = msg.data as { identifiers: CatalogItem[]; receiver: string; candidatePeers: string[] };
            const randomRequest: CatalogItem[] = data.identifiers.filter((item) => {
              const model = ModelStorage.instance.get(item.identifier);
              return model && item.state < model.state && !ModelStorage.instance.isHeldBack(item.identifier);
            });
            if (!this.isLimitSendTask() && 0 < randomRequest.length && !this.existsSendTask(data.receiver)) {
              const idx = Math.floor(Math.random() * randomRequest.length);
              const item = randomRequest[idx];
              const model = ModelStorage.instance.get(item.identifier);
              if (model) this.startSendTask(model, data.receiver);
            } else {
              const candidatePeers: string[] = data.candidatePeers;
              const selfIdx = candidatePeers.indexOf(Network.peerId);
              if (-1 < selfIdx) candidatePeers.splice(selfIdx, 1);
              for (const peerId of candidatePeers) {
                networkSend(msg.eventName, data, peerId);
                return;
              }
            }
            break;
          }
          case 'UPDATE_MODEL_RESOURE': {
            const updateModels: ModelFileContext[] = msg.data as ModelFileContext[];
            for (const context of updateModels) {
              if (ModelStorage.instance.isRemoved(context.identifier)) continue;
              if (context.blob) context.blob = new Blob([context.blob], { type: context.type });
              ModelStorage.instance.add(context);
              if (this.httpMissed.has(context.identifier)) ModelStorage.instance.uploadReceived(context.identifier);
            }
            break;
          }
          case 'START_MODEL_TRANSMISSION': {
            const identifier: string = (msg.data as { fileIdentifier: string }).fileIdentifier;
            const model = ModelStorage.instance.get(identifier);
            if (this.receiveTaskMap.has(identifier) || model?.isReady || ModelStorage.instance.isRemoved(identifier)) {
              Logger.warn('[ModelSync] タスクキャンセル', identifier);
              networkSend(`CANCEL_TASK_${identifier}`, null, msg.sendFrom);
            } else {
              this.startReceiveTask(identifier);
            }
            break;
          }
        }
      })
    );
  }

  private destroy() {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
  }

  /** The catalogue with the preferred model moved to the front, so it is fetched first. */
  private preferredFirst(catalog: readonly CatalogItem[]): CatalogItem[] {
    const preferred = this.preferredIdentifiers();
    if (preferred.length < 1) return [...catalog];
    return [
      ...catalog.filter((item) => preferred.includes(item.identifier)),
      ...catalog.filter((item) => !preferred.includes(item.identifier)),
    ];
  }

  /**
   * Fetches from the room's asset store the models it holds that this seat lacks, named by the room's
   * list rather than by a peer's catalogue: those left in a room that everybody had gone from, say.
   * One the store lacks waits for a catalogue to name it; one it could not send just then is tried
   * again a few times. Those preferred go first.
   */
  fetchListed(assets: readonly { id: string; name: string }[]): void {
    const preferred = this.preferredIdentifiers();
    const ordered = [
      ...assets.filter((asset) => preferred.includes(asset.id)),
      ...assets.filter((asset) => !preferred.includes(asset.id)),
    ];
    for (const { id, name } of ordered) {
      if (ModelStorage.instance.isRemoved(id) || this.httpBarred.has(id)) continue;
      let model = ModelStorage.instance.get(id);
      if (model === null) {
        model = ModelFile.createEmpty(id, name);
        ModelStorage.instance.add(model);
      }
      if (model.state < ModelState.COMPLETE && !this.receiveTaskMap.has(id)) this.fetchOverHttp(id, null);
    }
  }

  /**
   * Moves the models preferred now to the front of the downloads and the uploads still waiting their
   * turn, for those wanted after the room's models were lined up, so that they reach the store and
   * everyone ahead of the rest.
   */
  preferWaiting(): void {
    for (const identifier of this.preferredIdentifiers()) {
      if (this.httpFetching.has(identifier)) AssetHttpStore.instance.downloadFirst(identifier);
      AssetHttpStore.instance.uploadFirst(identifier);
    }
  }

  /**
   * Forgets which models the asset store lacked, for another room, which may hold them, and drops
   * the tries still to come of those it could not send.
   */
  forgetMisses(): void {
    this.httpMissed.clear();
    this.httpBarred.clear();
    this.httpRetries.clear();
  }

  private fetchListedAgain(identifier: string): void {
    const model = ModelStorage.instance.get(identifier);
    if (model && model.state < ModelState.COMPLETE && !this.receiveTaskMap.has(identifier))
      this.fetchOverHttp(identifier, null);
  }

  /**
   * Starts fetching a model from the asset server, and says whether it is on its way from there, so
   * it need not be asked of a peer.
   *
   * A model the server could not send is asked of the peer whose catalogue named it, the way it would
   * have been without the server. With no such peer, one the server lacks, or sends bytes for that do
   * not match, is left, and one it could not send just then is tried again later. Only the server's
   * lacking it keeps it from being fetched from there again. One the operator took down is asked of
   * nobody.
   *
   * A preferred model goes ahead of the others waiting their turn, and moves to the front should it be
   * waiting already.
   */
  private fetchOverHttp(identifier: string, catalogPeer: string | null): boolean {
    const store = AssetHttpStore.instance;
    if (!store.isEnabled || !AssetHttpStore.isAssetId(identifier) || this.httpMissed.has(identifier)) return false;
    if (this.httpBarred.has(identifier)) return false;
    const first = this.preferredIdentifiers().includes(identifier);
    if (this.httpFetching.has(identifier)) {
      if (this.httpFetching.get(identifier) === null) this.httpFetching.set(identifier, catalogPeer);
      if (first) store.downloadFirst(identifier);
      return true;
    }
    this.httpFetching.set(identifier, catalogPeer);
    void store
      .download(identifier, { first })
      .then((fetched) => {
        if (typeof fetched !== 'string') {
          this.httpRetries.forget(identifier);
          const name = ModelStorage.instance.get(identifier)?.name || fetched.name;
          const { blob } = fetched;
          localDispatch('UPDATE_MODEL_RESOURE', [{ identifier, name, type: blob.type, blob, url: '' }]);
          ModelStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
          return;
        }
        if (fetched === 'blocked') {
          this.letGoOfBarred(identifier);
          return;
        }
        if (fetched === 'missing') this.httpMissed.add(identifier);
        const model = ModelStorage.instance.get(identifier);
        if (!model || ModelState.COMPLETE <= model.state) return;
        const namedBy = this.httpFetching.get(identifier) ?? null;
        if (namedBy === null) {
          if (fetched === 'failed') this.httpRetries.schedule(identifier, () => this.fetchListedAgain(identifier));
          return;
        }
        if (this.receiveTaskMap.has(identifier) || this.isLimitReceiveTask()) return;
        this.request([{ identifier, state: model.state }], namedBy);
      })
      .finally(() => this.httpFetching.delete(identifier));
    return true;
  }

  /** Asks nobody for one the operator barred, and drops the empty entry kept for it while it was to come. */
  private letGoOfBarred(identifier: string): void {
    this.httpBarred.add(identifier);
    const model = ModelStorage.instance.get(identifier);
    if (model && !model.isReady && ModelStorage.instance.delete(identifier)) fileResourceUpdated$.emit();
  }

  /** The model to ask for next: a preferred one if it is wanted, otherwise any of them. */
  private pickRequest(request: readonly CatalogItem[]): CatalogItem {
    const preferred = this.preferredIdentifiers();
    const wanted = request.find((item) => preferred.includes(item.identifier));
    return wanted ?? request[Math.floor(Math.random() * request.length)];
  }

  private async startSendTask(model: ModelFile, sendTo: string) {
    const task = BufferSharingTask.createSendTask<ModelFileContext>(model.identifier, sendTo);
    this.sendTaskMap.set(model.identifier, task);

    networkSend('START_MODEL_TRANSMISSION', { fileIdentifier: model.identifier }, sendTo);

    const context: ModelFileContext = {
      identifier: model.identifier,
      name: model.name,
      blob: null,
      type: '',
      url: '',
    };

    if (model.blob) {
      const buf = await FileReaderUtil.readAsArrayBufferAsync(model.blob);
      context.blob = new Uint8Array(buf) as unknown as Blob;
      context.type = model.blob.type;
    }

    task.onfinish = () => {
      this.stopSendTask(task.identifier);
      ModelStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      ModelStorage.instance.synchronize(sendTo);
    };

    task.start(context);
  }

  private startReceiveTask(identifier: string) {
    let model = ModelStorage.instance.get(identifier);
    if (!model) {
      model = ModelFile.createEmpty(identifier);
      ModelStorage.instance.add(model);
    }
    const task = BufferSharingTask.createReceiveTask<ModelFileContext>(identifier);
    this.receiveTaskMap.set(identifier, task);

    task.onprogress = (_task, _loded, _total) => {
      model.apply(model.toContext());
    };
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data && !ModelStorage.instance.isRemoved(data.identifier)) {
        if (data.blob) data.blob = new Blob([data.blob], { type: data.type });
        ModelStorage.instance.add(data);
        localDispatch('UPDATE_MODEL_RESOURE', [data]);
      }
      ModelStorage.instance.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    };

    task.start();
  }

  private stopSendTask(identifier: string) {
    this.sendTaskMap.get(identifier)?.cancel();
    this.sendTaskMap.delete(identifier);
  }

  private stopReceiveTask(identifier: string) {
    this.receiveTaskMap.get(identifier)?.cancel();
    this.receiveTaskMap.delete(identifier);
  }

  private request(request: CatalogItem[], peerId: string) {
    const peerIds = Network.peerIds;
    peerIds.splice(peerIds.indexOf(Network.peerId), 1);
    networkSend(
      'REQUEST_MODEL_RESOURE',
      {
        identifiers: request,
        receiver: Network.peerId,
        candidatePeers: peerIds,
      },
      peerId
    );
  }

  private hasActiveTask(): boolean {
    return 0 < this.sendTaskMap.size || 0 < this.receiveTaskMap.size;
  }

  private isLimitSendTask(): boolean {
    return this.maxSendTask <= this.sendTaskMap.size;
  }

  private isLimitReceiveTask(): boolean {
    return this.maxReceiveTask <= this.receiveTaskMap.size;
  }

  private existsSendTask(peerId: string): boolean {
    return [...this.sendTaskMap.values()].some((task) => task?.sendTo === peerId);
  }
}
