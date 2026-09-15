import { Logger } from '@axe/core/logging/logger';
import { Connection, ConnectionCallback } from '@axe/core/network/connection';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import { SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';
import { SkyWayDataStreamList } from '@axe/core/network/skyway/skyway-data-stream-list';
import { SkyWayFacade } from '@axe/core/network/skyway/skyway-facade';
import { diff } from '@axe/core/util/array-util';
import { compressAsync, decompressAsync } from '@axe/core/util/compress';
import * as MessagePack from '@axe/core/util/message-pack';
import { PERF_INBOUND_DRAIN, perfCounters } from '@axe/core/util/perf-counters';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';

type PeerId = string;

interface DataContainer {
  data: Uint8Array;
  users?: string[];
  ttl: number;
  isCompressed?: boolean;
}

export class SkyWayConnection implements Connection {
  private get userIds(): string[] {
    return [...this.peers.filter((p) => p.userId.length > 0).map((p) => p.userId), this.peer.userId];
  }

  /** This device's peer id, or the placeholder '???' until a SkyWay session opens. */
  get peerId(): string {
    return this.peer.peerId;
  }
  /** Ids of the peers whose data channel is open, sorted. */
  get peerIds(): string[] {
    return this.streams.peerIds;
  }

  /** This device's peer context in the SkyWay session. */
  get peer(): PeerContext {
    return this.skyWay.peer;
  }
  /** Contexts of every peer with a stream, including ones still connecting, sorted by peer id. */
  get peers(): PeerContext[] {
    return this.streams.peers;
  }

  readonly callback: ConnectionCallback = new ConnectionCallback();
  bandwidthUsage: number = 0;

  private readonly skyWay: SkyWayFacade = new SkyWayFacade();
  private readonly streams: SkyWayDataStreamList = new SkyWayDataStreamList();
  private readonly reconnectScheduler: PeerReconnectScheduler = new PeerReconnectScheduler();

  private listAllPeersCache: PeerId[] = [];
  private httpRequestInterval: number = performance.now() + 500;
  private outboundQueue: Promise<void> = Promise.resolve();

  private readonly trustedPeerIds: Set<PeerId> = new Set();
  private readonly relayingPeerIds: Map<string, string[]> = new Map();
  private readonly pendingRelayMapUpdates: Map<string, Promise<void>> = new Map();
  private readonly maybeUnavailablePeerIds: Set<string> = new Set();

  /** Takes the backend URL from the app config; token requests on the next open go there. */
  configure(config: Record<string, unknown>) {
    this.skyWay.url = ((config.backend as Record<string, unknown>)?.url as string) ?? '';
  }

  /** Opens a session in no room, as the given user or a new one; callback reports the result. */
  openStandby(userId?: string): void {
    PeerContext.create(userId ?? PeerContext.generateUserId()).then((peer) => this.openSkyWay(peer));
  }

  /**
   * Opens a SkyWay session in a room, with a peer id derived from the user, room and password.
   *
   * Opening is asynchronous and reported through callback.onOpen or onError. No peer is connected yet.
   */
  open(userId: string, roomId: string, roomName: string, password: string): void {
    PeerContext.createRoom(userId, roomId, roomName, password).then((peer) => this.openSkyWay(peer));
  }

  /** Disconnects every peer, cancels pending reconnects and leaves the SkyWay session. */
  close() {
    this.reconnectScheduler.cancelAll();
    this.disconnectAll();
    this.skyWay.close();
  }

  /** Starts leaving the room and lobby without waiting, for a page being hidden or unloaded. */
  leaveImmediately() {
    this.skyWay.leaveImmediately();
  }

  /** Joins again after leaveImmediately if the page stayed after all, reconnecting its peers. */
  async rejoinAfterLeave() {
    await this.skyWay.rejoinAfterLeave();
    for (const peerId of [...this.trustedPeerIds]) {
      const peer = PeerContext.parse(peerId);
      this.disconnect(peer);
      this.connect(peer);
    }
  }

  /**
   * Starts a data connection to a member of the room.
   *
   * False, with nothing started, when the session is not open, the peer is this device or already
   * has a stream, fails the room and password check, or is not in the room. True means the attempt
   * started; callback.onConnect reports when the channel opens.
   */
  async connect(peer: IPeerContext): Promise<boolean> {
    if (!(await this.shouldConnect(peer.peerId))) {
      return false;
    }

    this.connectStream(SkyWayDataStream.createSubscription(this.skyWay, peer));
    return true;
  }

  private async shouldConnect(peerId: string): Promise<boolean> {
    if (!this.skyWay.isOpen) {
      return false;
    }

    if (this.peerId === peerId) {
      return false;
    }

    if (this.peerIds.includes(peerId)) {
      return false;
    }

    if (!(await this.peer.verifyPeer(peerId))) {
      return false;
    }

    const roomMembers = this.skyWay.room?.members?.map((m) => m.name) ?? [];
    if (!roomMembers.includes(peerId)) {
      return false;
    }

    return true;
  }

  /** Closes the connection to a peer and cancels its pending reconnect; false when there was none. */
  disconnect(peer: IPeerContext): boolean {
    this.reconnectScheduler.reset(peer.peerId);
    const stream = this.streams.find(peer.peerId);
    if (!stream) return false;
    this.disconnectStream(stream);
    return true;
  }

  /** Closes the connection to every peer, without reconnecting. */
  disconnectAll() {
    for (const peer of [...this.peers]) {
      this.disconnect(peer);
    }
  }

  /**
   * Sends data to one peer, or to every connected peer when sendTo is omitted.
   *
   * A batch goes out in runs that keep its order: pieces of a file are sent on their own and as
   * they are, and a large run of the other messages is compressed. Sends go out in call order
   * after the current task. Nothing is sent while no peer is connected, and a message for a peer
   * whose channel is not open is dropped.
   */
  send(data: unknown, sendTo?: string) {
    if (this.peers.length < 1) return;
    if (!Array.isArray(data) || data.length < 2) {
      this.sendContainer(data, sendTo, false);
      return;
    }
    for (const run of SkyWayConnection.splitAtFileChunks(data)) {
      this.sendContainer(run.messages, sendTo, !run.carriesFileChunks);
    }
  }

  private sendContainer(data: unknown, sendTo: string | undefined, compressible: boolean) {
    const container: DataContainer = {
      data: MessagePack.encode(data),
      ttl: 1,
    };

    const byteLength = container.data.byteLength;
    this.bandwidthUsage += byteLength;
    this.outboundQueue = this.outboundQueue.then(async () => {
      await waitZeroTimeout();
      if (compressible && container.data.byteLength > 1024) {
        try {
          const compressed = await compressAsync(container.data);
          if (compressed.byteLength < container.data.byteLength) {
            container.data = compressed;
            container.isCompressed = true;
          }
        } catch {
          // sends it uncompressed when compression fails
        }
      }
      if (sendTo) {
        this.sendUnicast(container, sendTo);
      } else {
        this.sendBroadcast(container);
      }
      this.bandwidthUsage -= byteLength;
    });
  }

  /**
   * Splits a batch, in order, into runs that are all pieces of an image or audio file or none.
   *
   * Those bytes are already compressed, so gzipping them costs time and saves nothing, while the
   * messages around them still compress well.
   */
  private static splitAtFileChunks(batch: readonly unknown[]): { messages: unknown[]; carriesFileChunks: boolean }[] {
    const runs: { messages: unknown[]; carriesFileChunks: boolean }[] = [];
    for (const message of batch) {
      const eventName = (message as { eventName?: unknown } | null)?.eventName;
      const isFileChunk = typeof eventName === 'string' && eventName.startsWith('FILE_SEND_CHUNK_');
      const last = runs.at(-1);
      if (last && last.carriesFileChunks === isFileChunk) {
        last.messages.push(message);
      } else {
        runs.push({ messages: [message], carriesFileChunks: isFileChunk });
      }
    }
    return runs;
  }

  private sendUnicast(container: DataContainer, sendTo: string) {
    container.ttl = 0;
    const stream = this.streams.find(sendTo);
    if (stream && stream.open) {
      stream.send(container);
    }
  }

  private sendBroadcast(container: DataContainer) {
    for (const stream of this.streams) {
      if (stream.open) stream.send(container);
    }
  }

  /** Peer ids of every lobby member, fetched at most every ten seconds and cached in between. */
  async listAllPeers(): Promise<string[]> {
    const now = performance.now();
    if (now >= this.httpRequestInterval) {
      this.listAllPeersCache = await this.skyWay.listAllPeers();
      this.httpRequestInterval = now + 10000;
    }

    return this.listAllPeersCache;
  }

  /** The rooms visible in the lobby, built from its members and the room names they carry. */
  async listAllRooms(): Promise<IRoomInfo[]> {
    const members = await this.skyWay.listAllLobbyMembers();
    return RoomInfo.listFromMembers(members);
  }

  private async openSkyWay(peer: IPeerContext) {
    if (this.skyWay.context) {
      Logger.warn('[SkyWay] 既に接続済みです');
      await this.skyWay.close();
    }

    this.trustedPeerIds.clear();

    this.skyWay.onOpen = (_peer) => {
      this.callback.onOpen?.(this.peer);
    };

    this.skyWay.onClose = (_peer) => {
      if (this.peer.isOpen) this.close();
      this.callback.onClose?.(this.peer);
    };

    this.skyWay.onFatalError = (_peer, errorType, errorMessage, errorObject) => {
      Logger.error('[SkyWay] 致命的エラー', errorObject);
      if (this.peer.isOpen) {
        this.close();
        this.callback.onClose?.(this.peer);
      }
      this.callback.onError?.(this.peer, errorType, errorMessage, errorObject);
    };

    this.skyWay.onSubscribed = async (subscribedPeer, _subscription) => {
      const stream = SkyWayDataStream.createPublication(this.skyWay, subscribedPeer);

      if (!(await this.peer.verifyPeer(stream.peer.peerId))) {
        Logger.warn(`[SkyWay] 不正なピアからの接続を拒否: ${stream.peer.peerId}`);
        stream.reject();
        return;
      }
      this.connectStream(stream);
    };

    this.skyWay.onRoomRestore = (_peer) => {
      for (const peerId of this.trustedPeerIds) {
        const restoredPeer = PeerContext.parse(peerId);
        this.disconnect(restoredPeer);
        this.connect(restoredPeer);
      }
    };

    await this.skyWay.open(peer);
  }

  private connectStream(stream: SkyWayDataStream) {
    if (this.streams.add(stream) === null) return;

    this.trustedPeerIds.delete(stream.peer.peerId);
    this.maybeUnavailablePeerIds.add(stream.peer.peerId);

    stream.on('data', (data) => {
      this.onData(stream, data);
    });
    stream.on('open', () => {
      const wasReconnecting = 0 < this.reconnectScheduler.attemptOf(stream.peer.peerId);
      this.reconnectScheduler.reset(stream.peer.peerId);
      this.trustedPeerIds.add(stream.peer.peerId);
      this.maybeUnavailablePeerIds.delete(stream.peer.peerId);
      this.notifyUserList();
      this.callback.onConnect?.(stream.peer);
      if (wasReconnecting) this.callback.onReconnect?.(stream.peer, 'recovered');
    });
    stream.on('close', () => {
      this.disconnectStream(stream, true);
    });
    stream.on('error', () => {
      this.disconnectStream(stream, true);
    });

    stream.connect();
  }

  private disconnectStream(stream: SkyWayDataStream, allowReconnect: boolean = false) {
    stream.disconnect();
    const closed = this.streams.remove(stream);

    this.relayingPeerIds.delete(stream.peer.peerId);
    this.pendingRelayMapUpdates.delete(stream.peer.peerId);
    for (const [key, peerIds] of this.relayingPeerIds) {
      this.relayingPeerIds.set(
        key,
        peerIds.filter((id) => id !== stream.peer.peerId)
      );
    }
    this.notifyUserList();
    if (closed) this.callback.onDisconnect?.(closed.peer);
    if (closed && allowReconnect) this.scheduleReconnect(closed.peer);
  }

  private scheduleReconnect(peer: PeerContext) {
    if (!this.skyWay.isOpen) return;

    const target = PeerContext.parse(peer.peerId);
    target.userId = peer.userId;
    target.password = peer.password;

    const delayMs = this.reconnectScheduler.schedule(target.peerId, () => {
      void this.tryReconnect(target);
    });

    if (delayMs === null) {
      if (this.reconnectScheduler.attemptOf(target.peerId) > 0) {
        this.reconnectScheduler.reset(target.peerId);
        this.callback.onReconnect?.(target, 'failed');
      }
      return;
    }

    Logger.info(`[SkyWay] ${delayMs}ms後に再接続を試みます: ${target.peerId}`);
    if (this.reconnectScheduler.attemptOf(target.peerId) === 1) {
      this.callback.onReconnect?.(target, 'retrying');
    }
  }

  private async tryReconnect(peer: PeerContext) {
    if (await this.connect(peer)) return;

    Logger.info(`[SkyWay] 再接続の対象外になりました: ${peer.peerId}`);
    const gaveUp = 0 < this.reconnectScheduler.attemptOf(peer.peerId) && !this.peerIds.includes(peer.peerId);
    this.reconnectScheduler.reset(peer.peerId);
    if (gaveUp) this.callback.onReconnect?.(peer, 'failed');
  }

  private onData(stream: SkyWayDataStream, container: DataContainer) {
    if (container.users && container.users.length > 0) {
      const updateDone = this.onUpdateUserIds(stream, container.users);
      this.pendingRelayMapUpdates.set(stream.peer.peerId, updateDone);
      updateDone
        .finally(() => {
          if (this.pendingRelayMapUpdates.get(stream.peer.peerId) === updateDone) {
            this.pendingRelayMapUpdates.delete(stream.peer.peerId);
          }
        })
        .catch(() => {});
    }
    if (container.ttl > 0) {
      const pending = this.pendingRelayMapUpdates.get(stream.peer.peerId);
      if (pending) {
        pending.then(
          () => this.onRelay(stream, container),
          () => this.onRelay(stream, container)
        );
      } else {
        this.onRelay(stream, container);
      }
    }
    if (!this.callback.onData) return;
    const byteLength = container.data.byteLength;
    this.bandwidthUsage += byteLength;
    this.inbound.push({ peer: stream.peer, container, byteLength });
    if (!this.inboundDraining) void this.drainInbound();
  }

  /** How long one task may spend handing over what has arrived before it lets the page draw. */
  private static readonly INBOUND_DRAIN_BUDGET_MS = 8;
  private readonly inbound: { peer: PeerContext; container: DataContainer; byteLength: number }[] = [];
  private inboundDraining = false;

  /**
   * Hands what has arrived to the callback, in the order it came, as much as fits in a task.
   *
   * A message that cannot be read is logged and dropped; the ones behind it still go through.
   */
  private async drainInbound(): Promise<void> {
    this.inboundDraining = true;
    try {
      while (this.inbound.length > 0) {
        await waitZeroTimeout();
        perfCounters.bump(PERF_INBOUND_DRAIN);
        const started = performance.now();
        while (0 < this.inbound.length && performance.now() - started < SkyWayConnection.INBOUND_DRAIN_BUDGET_MS) {
          const { peer, container, byteLength } = this.inbound.shift()!;
          this.bandwidthUsage -= byteLength;
          if (!this.callback.onData) continue;
          try {
            const data = container.isCompressed ? await decompressAsync(container.data) : container.data;
            this.callback.onData(peer, MessagePack.decode(data) as unknown[]);
          } catch (e) {
            Logger.error('[SkyWay] 受信データを読めなかったため破棄しました', e);
          }
        }
      }
    } finally {
      this.inboundDraining = false;
    }
  }

  private onRelay(stream: SkyWayDataStream, container: DataContainer) {
    container.ttl--;

    const peerIdsToRelay: string[] = this.relayingPeerIds.get(stream.peer.peerId) ?? [];

    if (container.users && container.users.length > 0) {
      container.users = this.userIds;
    }

    for (const peerId of peerIdsToRelay) {
      const conn = this.streams.find(peerId);
      if (conn && conn.open) {
        conn.send(container);
      }
    }
  }

  private async onUpdateUserIds(stream: SkyWayDataStream, userIds: string[]) {
    let needsNotifyUserList = false;
    for (const userId of userIds) {
      const peer = await this.makeFriendPeer(userId);
      const existingStream = this.streams.find(peer.peerId);
      if (existingStream && existingStream.peer.userId !== userId) {
        existingStream.peer.userId = userId;
        needsNotifyUserList = true;
      }
    }

    const { diff1: relayingUserIds, diff2: unknownUserIds } = diff(this.userIds, userIds);
    this.relayingPeerIds.set(
      stream.peer.peerId,
      await Promise.all(relayingUserIds.map(async (userId) => (await this.makeFriendPeer(userId)).peerId))
    );

    if (unknownUserIds.length) {
      for (const userId of unknownUserIds) {
        const peer = await this.makeFriendPeer(userId);
        if (!this.maybeUnavailablePeerIds.has(peer.peerId)) {
          await this.connect(peer);
        }
      }
    }
    if (needsNotifyUserList) this.notifyUserList();
  }

  private notifyUserList() {
    this.streams.refresh();
    if (this.streams.length < 1) return;
    const container: DataContainer = {
      data: MessagePack.encode([]),
      users: this.userIds,
      ttl: 1,
    };
    this.sendBroadcast(container);
  }

  private async makeFriendPeer(userId: string): Promise<PeerContext> {
    return PeerContext.createRoom(userId, this.peer.roomId, this.peer.roomName, this.peer.password);
  }
}
