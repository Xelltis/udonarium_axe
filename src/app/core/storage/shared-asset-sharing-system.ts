import { fileResourceUpdated$ } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { localDispatch, NetworkMessage, networkMessage$, networkSend } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import {
  CatalogItem,
  SharedAssetContext,
  SharedAssetFile,
  SharedAssetStorage,
} from '@axe/core/storage/shared-asset-storage';

/**
 * How long a finished transfer waits before telling everyone else what this seat now holds.
 * Transfers finish in runs while a room fills up, and each run needs to be told only once.
 */
const CATALOG_BROADCAST_DELAY_MS = 1000;

/** What tells one kind of shared file from another to what trades them between peers. */
export interface SharedAssetTrade<F extends SharedAssetFile<C>, C extends SharedAssetContext> {
  /** The store this seat keeps the kind in, asked for each time it is used. */
  readonly storage: () => SharedAssetStorage<F, C>;
  /** A placeholder for one known only from a peer's catalogue or the room's list, until its bytes arrive. */
  readonly createEmpty: (identifier: string, name?: string) => F;
  /** The names the messages that trade the kind go by, besides the catalogue's, which its store names. */
  readonly messages: {
    /** A request for one a seat lacks. */
    readonly request: string;
    /** Entries come in, from a peer or the room's asset store. */
    readonly update: string;
    /** A transfer to a peer begins. */
    readonly start: string;
  };
  /** What the log names a transfer of the kind by. */
  readonly logName: string;
}

/**
 * Trades the files of one kind between peers, as the sounds and the 3D models are traded:
 * catalogues, requests, transfers one file at a time from each peer holding one, and the room
 * server's asset store where the room has one.
 */
export class SharedAssetSharingSystem<F extends SharedAssetFile<C>, C extends SharedAssetContext> {
  private sendTaskMap: Map<string, BufferSharingTask<C>> = new Map();
  private receiveTaskMap: Map<string, BufferSharingTask<C>> = new Map();
  private maxSendTask: number = 2;
  private maxReceiveTask: number = 4;
  private cleanups: (() => void)[] = [];
  /**
   * Those being fetched from the asset server, so a second catalogue does not fetch one again, each
   * with the first peer whose catalogue named it meanwhile, to ask should the server fail.
   */
  private httpFetching: Map<string, string | null> = new Map();
  /** Those the asset server did not have, which are asked of peers from then on. */
  private httpMissed: Set<string> = new Set();
  /** Those the room server's operator took down, asked of nobody: neither the store nor a peer. */
  private httpBarred: Set<string> = new Set();
  /** Those the room's list named that the asset server could not send just then. */
  private httpRetries = new AssetRetries();

  /**
   * Those to fetch before any other, such as what the room is playing.
   *
   * Files arrive one at a time from each peer holding one, so a newcomer to a room with many would
   * otherwise wait for a random run of them before the ones in use.
   */
  preferredIdentifiers: () => readonly string[] = () => [];

  protected constructor(private readonly trade: SharedAssetTrade<F, C>) {}

  private get storage(): SharedAssetStorage<F, C> {
    return this.trade.storage();
  }

  /**
   * Starts answering the network messages that trade the kind between peers: catalogues, requests,
   * transfers and cancellations.
   *
   * Calling it again drops the earlier subscription first, so it never listens twice.
   */
  initialize(): void {
    this.cleanups.forEach((c) => c());
    this.cleanups = [];
    const { messages } = this.trade;

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'CONNECT_PEER':
            if ((msg as NetworkMessage<{ peerId: string }>).isSendFromSelf)
              this.storage.synchronize((msg as NetworkMessage<{ peerId: string }>).data.peerId);
            break;
          case this.storage.catalogMessage:
            if (!msg.isSendFromSelf) this.answerCatalog(msg.data as CatalogItem[], msg.sendFrom);
            break;
          case messages.request:
            if (!msg.isSendFromSelf) {
              this.answerRequest(
                msg.data as { identifiers: CatalogItem[]; receiver: string; candidatePeers: string[] },
                msg.eventName
              );
            }
            break;
          case messages.update:
            this.takeIn(msg.data as C[]);
            break;
          case messages.start:
            this.answerStart((msg.data as { fileIdentifier: string }).fileIdentifier, msg.sendFrom);
            break;
        }
      })
    );
  }

  /**
   * Asks for one a peer's catalogue names that this seat lacks: from the asset server where it is
   * there, or else of that peer, a preferred one first. A peer naming fewer than this seat holds is
   * sent this seat's catalogue, while nothing is being traded.
   */
  private answerCatalog(otherCatalog: CatalogItem[], sendFrom: string): void {
    const request: CatalogItem[] = [];
    for (const item of this.preferredFirst(otherCatalog)) {
      if (this.storage.isRemoved(item.identifier) || this.httpBarred.has(item.identifier)) continue;
      let file = this.storage.get(item.identifier);
      if (file === null) {
        file = this.trade.createEmpty(item.identifier, item.name);
        this.storage.add(file);
      }
      if (file.state < this.storage.complete && !this.receiveTaskMap.has(item.identifier)) {
        if (this.fetchOverHttp(item.identifier, sendFrom)) continue;
        request.push({ identifier: item.identifier, state: file.state });
      }
    }
    if (request.length < 1 && !this.hasActiveTask() && otherCatalog.length < this.storage.getCatalog().length) {
      this.storage.synchronize(sendFrom);
    }
    if (request.length < 1 || this.isLimitReceiveTask()) return;
    this.request([this.pickRequest(request)], sendFrom);
  }

  /**
   * Sends one asked for that this seat holds more of, picked at random, or passes the request on to
   * another candidate where this seat is sending enough already. What this seat holds back for the
   * room server's operator is not sent when asked for either, nor one it is sending to another peer
   * just then, as a transfer is known by the file alone.
   */
  private answerRequest(
    data: { identifiers: CatalogItem[]; receiver: string; candidatePeers: string[] },
    eventName: string
  ): void {
    const randomRequest: CatalogItem[] = data.identifiers.filter((item) => {
      const file = this.storage.get(item.identifier);
      return (
        file &&
        item.state < file.state &&
        !this.storage.isHeldBack(item.identifier) &&
        !this.sendTaskMap.has(item.identifier)
      );
    });
    if (!this.isLimitSendTask() && 0 < randomRequest.length && !this.existsSendTask(data.receiver)) {
      const item = randomRequest[Math.floor(Math.random() * randomRequest.length)];
      const file = this.storage.get(item.identifier);
      if (file) this.startSendTask(file, data.receiver);
      return;
    }
    const candidatePeers: string[] = data.candidatePeers;
    const selfIdx = candidatePeers.indexOf(Network.peerId);
    if (-1 < selfIdx) candidatePeers.splice(selfIdx, 1);
    if (candidatePeers.length > 0) networkSend(eventName, data, candidatePeers[0]);
  }

  /** Takes in entries that came, but none the room removed; one the store lacked goes up from here. */
  private takeIn(contexts: C[]): void {
    for (const context of contexts) {
      if (this.storage.isRemoved(context.identifier)) continue;
      if (context.blob) context.blob = new Blob([context.blob], { type: context.type });
      this.storage.add(context);
      if (this.httpMissed.has(context.identifier)) this.storage.uploadReceived(context.identifier);
    }
  }

  /** Takes a transfer a peer begins, or cancels it for one already coming, already held, or removed. */
  private answerStart(identifier: string, sendFrom: string): void {
    const file = this.storage.get(identifier);
    if (this.receiveTaskMap.has(identifier) || file?.isReady || this.storage.isRemoved(identifier)) {
      Logger.warn(`[${this.trade.logName}] タスクキャンセル`, identifier);
      networkSend(`CANCEL_TASK_${identifier}`, null, sendFrom);
    } else {
      this.startReceiveTask(identifier);
    }
  }

  /** The catalogue with the preferred ones moved to the front, so they are fetched first. */
  private preferredFirst(catalog: readonly CatalogItem[]): CatalogItem[] {
    const preferred = this.preferredIdentifiers();
    if (preferred.length < 1) return [...catalog];
    return [
      ...catalog.filter((item) => preferred.includes(item.identifier)),
      ...catalog.filter((item) => !preferred.includes(item.identifier)),
    ];
  }

  /**
   * Fetches from the room's asset store those it holds that this seat lacks, named by the room's list
   * rather than by a peer's catalogue: those left in a room that everybody had gone from, say. One
   * the store lacks waits for a catalogue to name it; one it could not send just then is tried again
   * a few times. Those preferred go first.
   */
  fetchListed(assets: readonly { id: string; name: string }[]): void {
    const preferred = this.preferredIdentifiers();
    const ordered = [
      ...assets.filter((asset) => preferred.includes(asset.id)),
      ...assets.filter((asset) => !preferred.includes(asset.id)),
    ];
    for (const { id, name } of ordered) {
      if (this.storage.isRemoved(id) || this.httpBarred.has(id)) continue;
      let file = this.storage.get(id);
      if (file === null) {
        file = this.trade.createEmpty(id, name);
        this.storage.add(file);
      }
      if (file.state < this.storage.complete && !this.receiveTaskMap.has(id)) this.fetchOverHttp(id, null);
    }
  }

  /**
   * Moves those preferred now to the front of the downloads and the uploads still waiting their
   * turn, for those wanted after the room's files were lined up, so that they reach the store and
   * everyone ahead of the rest.
   */
  preferWaiting(): void {
    for (const identifier of this.preferredIdentifiers()) {
      if (this.httpFetching.has(identifier)) AssetHttpStore.instance.downloadFirst(identifier);
      AssetHttpStore.instance.uploadFirst(identifier);
    }
  }

  /**
   * Forgets which the asset store lacked, for another room, which may hold them, and drops the tries
   * still to come of those it could not send.
   */
  forgetMisses(): void {
    this.httpMissed.clear();
    this.httpBarred.clear();
    this.httpRetries.clear();
  }

  private fetchListedAgain(identifier: string): void {
    const file = this.storage.get(identifier);
    if (file && file.state < this.storage.complete && !this.receiveTaskMap.has(identifier))
      this.fetchOverHttp(identifier, null);
  }

  /**
   * Starts fetching one from the asset server, and says whether it is on its way from there, so it
   * need not be asked of a peer.
   *
   * One the server could not send is asked of the peer whose catalogue named it, the way it would
   * have been without the server. With no such peer, one the server lacks, or sends bytes for that do
   * not match, is left, and one it could not send just then is tried again later. Only the server's
   * lacking it keeps it from being fetched from there again. One the operator took down is asked of
   * nobody. The name stays the one the catalogue or the room's list gave, or else the one it was put
   * up under.
   *
   * A preferred one goes ahead of the others waiting their turn, and moves to the front should it be
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
          const name = this.storage.get(identifier)?.name || fetched.name;
          const { blob } = fetched;
          localDispatch(this.trade.messages.update, [{ identifier, name, type: blob.type, blob, url: '' }]);
          this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
          return;
        }
        if (fetched === 'blocked') {
          this.letGoOfBarred(identifier);
          return;
        }
        if (fetched === 'missing') this.httpMissed.add(identifier);
        const file = this.storage.get(identifier);
        if (!file || this.storage.complete <= file.state) return;
        const namedBy = this.httpFetching.get(identifier) ?? null;
        if (namedBy === null) {
          if (fetched === 'failed') this.httpRetries.schedule(identifier, () => this.fetchListedAgain(identifier));
          return;
        }
        if (this.receiveTaskMap.has(identifier) || this.isLimitReceiveTask()) return;
        this.request([{ identifier, state: file.state }], namedBy);
      })
      .finally(() => this.httpFetching.delete(identifier));
    return true;
  }

  /** Asks nobody for one the operator barred, and drops the empty entry kept for it while it was to come. */
  private letGoOfBarred(identifier: string): void {
    this.httpBarred.add(identifier);
    const file = this.storage.get(identifier);
    if (file && !file.isReady && this.storage.delete(identifier)) fileResourceUpdated$.emit();
  }

  /** The one to ask for next: a preferred one if it is wanted, otherwise any of them. */
  private pickRequest(request: readonly CatalogItem[]): CatalogItem {
    const preferred = this.preferredIdentifiers();
    const wanted = request.find((item) => preferred.includes(item.identifier));
    return wanted ?? request[Math.floor(Math.random() * request.length)];
  }

  /**
   * Sends one to a peer: its bytes where this seat holds them, or else the link it is held by. Where
   * the bytes cannot be read, the transfer is called off, and the peer told so.
   */
  private async startSendTask(file: F, sendTo: string): Promise<void> {
    const task = BufferSharingTask.createSendTask<C>(file.identifier, sendTo);
    this.sendTaskMap.set(file.identifier, task);

    networkSend(this.trade.messages.start, { fileIdentifier: file.identifier }, sendTo);

    const context = { identifier: file.identifier, name: file.name, blob: null, type: '', url: '' } as C;
    if (file.blob) {
      const buf = await FileReaderUtil.readAsArrayBufferAsync(file.blob).catch(() => null);
      if (!buf) {
        this.stopSendTask(file.identifier);
        return;
      }
      context.blob = new Uint8Array(buf) as unknown as Blob;
      context.type = file.blob.type;
    } else {
      context.url = file.url;
    }

    task.onfinish = () => {
      this.stopSendTask(task.identifier);
      this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      this.storage.synchronize(sendTo);
    };

    task.start(context);
  }

  /**
   * Takes in one a peer sends. Its name is left as the catalogue gave it while it comes, as progress
   * written into the name would show in every place it is shown.
   */
  private startReceiveTask(identifier: string): void {
    let file = this.storage.get(identifier);
    if (!file) {
      file = this.trade.createEmpty(identifier);
      this.storage.add(file);
    }
    const task = BufferSharingTask.createReceiveTask<C>(identifier);
    this.receiveTaskMap.set(identifier, task);

    const coming = file;
    task.onprogress = () => {
      coming.apply(coming.toContext());
    };
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data && !this.storage.isRemoved(data.identifier)) {
        if (data.blob) data.blob = new Blob([data.blob], { type: data.type });
        this.storage.add(data);
        localDispatch(this.trade.messages.update, [data]);
      }
      this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
    };

    task.start();
  }

  private stopSendTask(identifier: string): void {
    this.sendTaskMap.get(identifier)?.cancel();
    this.sendTaskMap.delete(identifier);
  }

  private stopReceiveTask(identifier: string): void {
    this.receiveTaskMap.get(identifier)?.cancel();
    this.receiveTaskMap.delete(identifier);
  }

  /** Asks a peer for one, naming every other peer as one to pass the request on to. */
  private request(request: CatalogItem[], peerId: string): void {
    const peerIds = Network.peerIds.filter((id) => id !== Network.peerId);
    networkSend(
      this.trade.messages.request,
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
