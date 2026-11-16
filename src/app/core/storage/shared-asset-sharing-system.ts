import { fileResourceUpdated$ } from '@axe/core/event/domain-events';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import {
  FIRST_SYNC_SETTLED,
  localDispatch,
  NetworkMessage,
  networkMessage$,
  networkSend,
} from '@axe/core/network/network-messaging';
import { AssetDownloadMiss, AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AssetRetries } from '@axe/core/storage/asset-retries';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import {
  CatalogItem,
  SharedAssetContext,
  SharedAssetFile,
  SharedAssetStorage,
  WireContext,
} from '@axe/core/storage/shared-asset-storage';

/**
 * How long a finished transfer waits before telling everyone else what this seat now holds.
 * Transfers finish in runs while a room fills up, and each run needs to be told only once.
 */
export const CATALOG_BROADCAST_DELAY_MS = 1000;

/**
 * The longest a seat puts off asking its peers for files after its first peer connects, should the
 * objects not have synced by then: files are not to be kept back for good by a sync that fails.
 */
export const FIRST_SYNC_HOLD_MAX_MS = 20_000;

/** A transfer under way, as far as the lists of those being sent and received need to know it. */
export interface SharingTask {
  readonly identifier: string;
  /** The peer it goes to, for one being sent. */
  readonly sendTo: string | undefined;
  cancel(): void;
}

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
 *
 * Between peers, a seat asks for no file until its objects have first synced after its network
 * opened, or a while after its first peer connected at the latest. The catalogues are traded and
 * places made for what they name meanwhile, and what a peer asks for is sent at once.
 *
 * A kind traded in another shape, as the pictures are, with their thumbnails ahead of the bytes and
 * several to a transfer, overrides the protected steps: what is asked for out of a catalogue, how
 * what is asked for is sent and received, and how what came is taken in.
 */
export class SharedAssetSharingSystem<F extends SharedAssetFile<C>, C extends SharedAssetContext> {
  protected readonly sendTaskMap = new Map<string, SharingTask>();
  protected readonly receiveTaskMap = new Map<string, SharingTask>();
  private maxSendTask: number = 2;
  private maxReceiveTask: number = 4;
  protected cleanups: (() => void)[] = [];
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
  /** The peer each transfer coming in is from. */
  private readonly incomingFrom = new Map<string, string>();
  /** The latest catalogue of each peer that is not to be asked just yet, kept to ask it from later. */
  private readonly heldCatalogs = new Map<string, CatalogItem[]>();
  /** Whether the objects have yet to sync for the first time since the network opened. */
  private awaitsFirstSync = false;
  private firstSyncHoldTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Those to fetch before any other, such as what the room is playing.
   *
   * Files arrive one at a time from each peer holding one, so a newcomer to a room with many would
   * otherwise wait for a random run of them before the ones in use.
   */
  preferredIdentifiers: () => readonly string[] = () => [];

  protected constructor(private readonly trade: SharedAssetTrade<F, C>) {}

  /** The store this seat keeps the kind in. */
  protected get storage(): SharedAssetStorage<F, C> {
    return this.trade.storage();
  }

  /** The names the messages that trade the kind go by. */
  protected get messages(): SharedAssetTrade<F, C>['messages'] {
    return this.trade.messages;
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
    this.cleanups.push(() => this.forgetFirstSync());
    const { messages } = this.trade;

    this.cleanups.push(
      networkMessage$.subscribe((msg) => {
        switch (msg.eventName) {
          case 'OPEN_NETWORK':
            if (msg.isSendFromSelf) this.awaitFirstSync();
            break;
          case 'CLOSE_NETWORK':
            if (msg.isSendFromSelf) this.forgetFirstSync();
            break;
          case FIRST_SYNC_SETTLED:
            if (msg.isSendFromSelf) this.askAfterFirstSync();
            break;
          case 'CONNECT_PEER':
            if ((msg as NetworkMessage<{ peerId: string }>).isSendFromSelf) {
              this.storage.synchronize((msg as NetworkMessage<{ peerId: string }>).data.peerId);
              this.limitFirstSyncHold();
            }
            break;
          case 'DISCONNECT_PEER':
            this.heldCatalogs.delete((msg as NetworkMessage<{ peerId: string }>).data.peerId);
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
            this.takeIn(msg.data);
            break;
          case messages.start:
            this.answerStart(this.transferIn(msg.data), msg.sendFrom);
            break;
        }
      })
    );
  }

  /**
   * Asks for what a peer's catalogue names that this seat lacks: from the asset server where it is
   * there, or else of that peer. A peer naming fewer than this seat holds is sent this seat's
   * catalogue, while nothing is being traded.
   */
  private answerCatalog(otherCatalog: CatalogItem[], sendFrom: string): void {
    const wanted = this.wantedOf(otherCatalog, sendFrom);
    if (wanted.length < 1 && !this.hasActiveTask() && otherCatalog.length < this.storage.getCatalog().length) {
      this.storage.synchronize(sendFrom);
    }
    this.ask(wanted, otherCatalog, sendFrom);
  }

  /**
   * What a peer is to be asked for out of its catalogue: what this seat lacks, is not receiving and
   * is not taking from the asset server, those preferred first. A place is made for each one named.
   */
  private wantedOf(catalog: readonly CatalogItem[], peerId: string): CatalogItem[] {
    const wanted: CatalogItem[] = [];
    for (const item of this.preferredFirst(catalog)) {
      if (this.storage.isRemoved(item.identifier) || this.httpBarred.has(item.identifier)) continue;
      const file = this.placeFor(item.identifier, item.name);
      if (file.state < this.storage.complete && !this.receiveTaskMap.has(item.identifier)) {
        if (this.fetchOverHttp(item.identifier, peerId)) continue;
        wanted.push({ identifier: item.identifier, state: file.state });
      }
    }
    return wanted;
  }

  /**
   * Asks a peer for what is wanted out of its catalogue, or keeps the catalogue to ask from later
   * while the peer is not to be asked: until the objects have first synced, and where a transfer
   * from it does not say what it carries, until that has come. Nothing is asked for while this
   * seat is receiving enough.
   */
  private ask(wanted: CatalogItem[], catalog: readonly CatalogItem[], peerId: string): void {
    this.heldCatalogs.delete(peerId);
    if (wanted.length < 1) return;
    if (this.holdsRequestsTo(peerId)) {
      this.heldCatalogs.set(peerId, [...catalog]);
      if (this.holdsForFirstSync) this.limitFirstSyncHold();
      return;
    }
    if (this.isLimitReceiveTask()) return;
    this.request(this.toRequest(wanted), peerId);
  }

  /** Asks a peer for what the catalogue kept for it names that this seat still lacks. */
  private askHeld(peerId: string): void {
    const catalog = this.heldCatalogs.get(peerId);
    if (catalog) this.ask(this.wantedOf(catalog, peerId), catalog, peerId);
  }

  private holdsRequestsTo(peerId: string): boolean {
    if (this.holdsForFirstSync) return true;
    return !this.asksDuringTransfer() && this.isReceivingFrom(peerId);
  }

  /**
   * Whether peers are not asked for files yet because the objects have not first synced: a seat new
   * to a room gets its table and chat before the files, which would crowd them on a slow line.
   * A room server keeps the objects itself and hands the files out apart, so nothing waits there.
   */
  private get holdsForFirstSync(): boolean {
    return this.awaitsFirstSync && Network.authorityPeerId == null;
  }

  /** Starts over for a network that has opened: peers are asked for nothing until its objects sync. */
  private awaitFirstSync(): void {
    this.forgetFirstSync();
    this.awaitsFirstSync = true;
  }

  /** Drops what was kept to ask the peers of a network that is no more. */
  private forgetFirstSync(): void {
    if (this.firstSyncHoldTimer !== null) clearTimeout(this.firstSyncHoldTimer);
    this.firstSyncHoldTimer = null;
    this.awaitsFirstSync = false;
    this.heldCatalogs.clear();
  }

  /** Sees that peers are asked a while from now at the latest, whether the objects have synced or not. */
  private limitFirstSyncHold(): void {
    if (!this.awaitsFirstSync || this.firstSyncHoldTimer !== null) return;
    this.firstSyncHoldTimer = setTimeout(() => {
      this.firstSyncHoldTimer = null;
      this.askAfterFirstSync();
    }, FIRST_SYNC_HOLD_MAX_MS);
  }

  /** Asks every peer for what its catalogue named while the objects were yet to sync. */
  private askAfterFirstSync(): void {
    if (!this.awaitsFirstSync) return;
    if (this.firstSyncHoldTimer !== null) clearTimeout(this.firstSyncHoldTimer);
    this.firstSyncHoldTimer = null;
    this.awaitsFirstSync = false;
    for (const peerId of [...this.heldCatalogs.keys()]) {
      if (!this.holdsRequestsTo(peerId)) this.askHeld(peerId);
    }
  }

  private isReceivingFrom(peerId: string): boolean {
    for (const [identifier, from] of this.incomingFrom) {
      if (from === peerId && this.receiveTaskMap.has(identifier)) return true;
    }
    return false;
  }

  /**
   * Whether a peer is asked for more while a transfer from it is still coming in. It is where a
   * transfer is known by the one file it carries, as that file is then left out of what is asked
   * for. Where it is not, the peer's catalogue is kept and asked from once the transfer has been
   * taken in, as the catalogue may reach this seat ahead of the last pieces of the transfer.
   */
  protected asksDuringTransfer(): boolean {
    return true;
  }

  /**
   * To be called once a transfer has ended and what it brought has been taken in: asks the peer it
   * came from for what its catalogue named meanwhile.
   */
  protected transferTakenIn(identifier: string): void {
    const from = this.incomingFrom.get(identifier);
    this.incomingFrom.delete(identifier);
    if (from !== undefined && !this.holdsRequestsTo(from)) this.askHeld(from);
  }

  /**
   * What to ask a peer for, out of all its catalogue names that this seat lacks: one of them, a
   * preferred one first, as one comes at a time.
   */
  protected toRequest(wanted: readonly CatalogItem[]): CatalogItem[] {
    return [this.pickRequest(wanted)];
  }

  /**
   * Sends what is asked for that this seat holds more of, or passes the request on to another
   * candidate where this seat is sending enough already. What this seat holds back for the room
   * server's operator is not sent when asked for either, nor one it is sending to another peer just
   * then, as a transfer is known by the file alone.
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
      this.sendRequested(randomRequest, data.receiver);
      return;
    }
    const candidatePeers: string[] = data.candidatePeers;
    const selfIdx = candidatePeers.indexOf(Network.peerId);
    if (-1 < selfIdx) candidatePeers.splice(selfIdx, 1);
    if (candidatePeers.length > 0) networkSend(eventName, data, candidatePeers[0]);
  }

  /** Sends one of those asked for that this seat can send, picked at random. */
  protected sendRequested(requested: CatalogItem[], sendTo: string): void {
    const item = requested[Math.floor(Math.random() * requested.length)];
    const file = this.storage.get(item.identifier);
    if (file) void this.startSendTask(file, sendTo);
  }

  /** Takes in the entries that came, from a peer or the room's asset store, as the update message carries them. */
  protected takeIn(data: unknown): void {
    for (const context of data as WireContext<C>[]) this.keep(context);
  }

  /**
   * Keeps one that came, with its bytes wrapped up again, but none the room removed; one the store
   * lacked goes up from here.
   */
  protected keep(context: WireContext<C>): void {
    if (this.storage.isRemoved(context.identifier)) return;
    if (context.blob) context.blob = new Blob([context.blob], { type: context.type });
    const wrapped = context as C;
    this.storage.add(wrapped);
    if (this.httpMissed.has(wrapped.identifier)) this.storage.uploadReceived(wrapped.identifier);
  }

  /** The identifier of the transfer a peer begins, as the start message carries it. */
  protected transferIn(data: unknown): string {
    return (data as { fileIdentifier: string }).fileIdentifier;
  }

  /** Takes a transfer a peer begins, or cancels it for one already coming, already held, or removed. */
  private answerStart(identifier: string, sendFrom: string): void {
    const file = this.storage.get(identifier);
    if (this.receiveTaskMap.has(identifier) || file?.isReady || this.storage.isRemoved(identifier)) {
      Logger.warn(`[${this.trade.logName}] タスクキャンセル`, identifier);
      networkSend(`CANCEL_TASK_${identifier}`, null, sendFrom);
    } else {
      this.incomingFrom.set(identifier, sendFrom);
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
      const file = this.placeFor(id, name);
      if (file.state < this.storage.complete && !this.receiveTaskMap.has(id)) this.fetchOverHttp(id, null);
    }
  }

  /**
   * The entry held for one a catalogue or the room's list names: the one held already, or else a
   * placeholder made for it, under the name given where one is.
   */
  protected placeFor(identifier: string, name?: string): F {
    let file = this.storage.get(identifier);
    if (file === null) {
      file = this.trade.createEmpty(identifier, name);
      this.storage.add(file);
    }
    return file;
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
   * nobody.
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
    void this.receiveOverHttp(identifier, first)
      .then((received) => {
        if (received === true) {
          this.httpRetries.forget(identifier);
          return;
        }
        if (received === 'blocked') {
          this.letGoOfBarred(identifier);
          return;
        }
        if (received === 'missing') this.httpMissed.add(identifier);
        const file = this.storage.get(identifier);
        if (!file || this.storage.complete <= file.state) return;
        const namedBy = this.httpFetching.get(identifier) ?? null;
        if (namedBy === null) {
          if (received === 'failed') this.httpRetries.schedule(identifier, () => this.fetchListedAgain(identifier));
          return;
        }
        if (this.receiveTaskMap.has(identifier) || this.isLimitReceiveTask()) return;
        this.request([{ identifier, state: file.state }], namedBy);
      })
      .finally(() => this.httpFetching.delete(identifier));
    return true;
  }

  /**
   * Takes one from the room's asset store, ahead of the others waiting where asked, and says whether
   * it is in, or else why it is not. The name stays the one the catalogue or the room's list gave, or
   * else the one it was put up under.
   */
  protected async receiveOverHttp(identifier: string, first: boolean): Promise<true | AssetDownloadMiss> {
    const fetched = await AssetHttpStore.instance.download(identifier, { first });
    if (typeof fetched === 'string') return fetched;
    const name = this.storage.get(identifier)?.name || fetched.name;
    const { blob } = fetched;
    localDispatch(this.trade.messages.update, [{ identifier, name, type: blob.type, blob, url: '' }]);
    this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
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
    const task = BufferSharingTask.createSendTask<WireContext<C>>(file.identifier, sendTo);
    this.sendTaskMap.set(file.identifier, task);

    networkSend(this.trade.messages.start, { fileIdentifier: file.identifier }, sendTo);

    const context = { identifier: file.identifier, name: file.name, blob: null, type: '', url: '' } as WireContext<C>;
    if (file.blob) {
      const buf = await FileReaderUtil.readAsArrayBufferAsync(file.blob).catch(() => null);
      if (!buf) {
        this.stopSendTask(file.identifier);
        return;
      }
      context.blob = new Uint8Array(buf);
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
  protected startReceiveTask(identifier: string): void {
    const file = this.placeFor(identifier);
    const task = BufferSharingTask.createReceiveTask<WireContext<C>>(identifier);
    this.receiveTaskMap.set(identifier, task);

    task.onprogress = () => {
      file.apply(file.toContext());
    };
    task.onfinish = (task, data) => {
      this.stopReceiveTask(task.identifier);
      if (data && !this.storage.isRemoved(data.identifier)) {
        if (data.blob) data.blob = new Blob([data.blob], { type: data.type });
        const wrapped = data as C;
        this.storage.add(wrapped);
        localDispatch(this.trade.messages.update, [wrapped]);
      }
      this.storage.lazySynchronize(CATALOG_BROADCAST_DELAY_MS);
      this.transferTakenIn(task.identifier);
    };

    task.start();
  }

  protected stopSendTask(identifier: string): void {
    this.sendTaskMap.get(identifier)?.cancel();
    this.sendTaskMap.delete(identifier);
  }

  protected stopReceiveTask(identifier: string): void {
    this.receiveTaskMap.get(identifier)?.cancel();
    this.receiveTaskMap.delete(identifier);
  }

  /** Asks a peer for what is listed, naming every other peer as one to pass the request on to. */
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
