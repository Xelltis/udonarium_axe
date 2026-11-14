import { LogThrottle } from '@axe/core/logging/log-throttle';
import { Logger } from '@axe/core/logging/logger';
import { readBackendUrl } from '@axe/core/network/backend-url';
import { Connection, ConnectionCallback } from '@axe/core/network/connection';
import { compressIfSmaller, splitAtFileChunks } from '@axe/core/network/frame-codec';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { PeerLink, peerLinkStateOf } from '@axe/core/network/peer-link';
import { PEER_RECONNECT_STEADY_MS, PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { IRoomInfo, RoomInfo } from '@axe/core/network/room-info';
import { SendLane, SkyWayDataStream } from '@axe/core/network/skyway/skyway-data-stream';
import { SkyWayDataStreamList } from '@axe/core/network/skyway/skyway-data-stream-list';
import { SkyWayFacade } from '@axe/core/network/skyway/skyway-facade';
import { diff } from '@axe/core/util/array-util';
import { decompressAsync } from '@axe/core/util/compress';
import * as MessagePack from '@axe/core/util/message-pack';
import { PERF_INBOUND_DRAIN, perfCounters } from '@axe/core/util/perf-counters';
import { waitZeroTimeout } from '@axe/core/util/zero-timeout';

type PeerId = string;

/** How often, for one peer, a message dropped for want of an open stream is logged. */
const DROPPED_UNICAST_LOG_INTERVAL_MS = 10_000;

/**
 * How long a stream may take to open before it is given up and tried again. A stream that neither
 * opens nor closes would otherwise keep its peer from ever being dialled again.
 */
export const CONNECT_DEADLINE_MS = 30_000;

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
  /**
   * Ids of the other members SkyWay lists in the room, with or without a stream to them. One that
   * left without saying so stays listed until SkyWay drops it.
   */
  get roomPeerIds(): string[] {
    const names = (this.skyWay.room?.members ?? []).map((member) => member.name);
    return [...new Set(names.filter((name): name is string => !!name && name !== this.peerId))];
  }

  /**
   * How this seat reaches each of the others, sorted by peer id: those with a stream, those waiting
   * for a reconnect attempt, and those SkyWay only lists in the room. A peer without an open stream
   * counts as listed by somebody connected when a peer whose stream is open named it among its users.
   */
  get peerLinks(): PeerLink[] {
    const listed = new Set<PeerId>();
    for (const [listerId, peerIds] of this.listedPeerIds) {
      if (!this.streams.find(listerId)?.open) continue;
      for (const peerId of peerIds) listed.add(peerId);
    }
    const peerIds = new Set<PeerId>([
      ...this.peers.map((peer) => peer.peerId),
      ...this.reconnectScheduler.scheduledPeerIds,
      ...this.roomPeerIds,
    ]);
    return [...peerIds]
      .sort((a, b) => a.localeCompare(b))
      .map((peerId) => {
        const stream = this.streams.find(peerId);
        const state = peerLinkStateOf({
          isOpen: !!stream?.open,
          isOpening: !!stream && !stream.open,
          attempts: this.reconnectScheduler.attemptOf(peerId),
          isPastBackoff: this.reconnectScheduler.isPastBackoff(peerId),
          isListedByOpenPeer: listed.has(peerId),
        });
        return { peerId, state };
      });
  }

  readonly callback: ConnectionCallback = new ConnectionCallback();
  bandwidthUsage: number = 0;

  private readonly skyWay: SkyWayFacade = new SkyWayFacade();
  private readonly streams: SkyWayDataStreamList = new SkyWayDataStreamList();
  private readonly reconnectScheduler: PeerReconnectScheduler = new PeerReconnectScheduler(
    undefined,
    PEER_RECONNECT_STEADY_MS
  );
  private readonly connectDeadlines = new Map<SkyWayDataStream, ReturnType<typeof setTimeout>>();

  private listAllPeersCache: PeerId[] = [];
  private httpRequestInterval: number = performance.now() + 500;
  private outboundQueue: Promise<void> = Promise.resolve();

  private readonly trustedPeerIds: Set<PeerId> = new Set();
  private readonly relayingPeerIds: Map<string, string[]> = new Map();
  /** The peers each peer last named among the users it is connected to, itself among them. */
  private readonly listedPeerIds: Map<PeerId, PeerId[]> = new Map();
  private readonly pendingRelayMapUpdates: Map<string, Promise<void>> = new Map();
  private readonly maybeUnavailablePeerIds: Set<string> = new Set();
  private readonly droppedUnicastLog = new LogThrottle(DROPPED_UNICAST_LOG_INTERVAL_MS);

  /** Takes the backend URL from the app config; token requests on the next open go there. */
  configure(config: Record<string, unknown>) {
    this.skyWay.url = readBackendUrl(config);
  }

  /** Opens a session in no room, as the given user or a new one; callback reports the result. */
  openStandby(userId?: string): void {
    void this.openAs(PeerContext.create(userId ?? PeerContext.generateUserId()));
  }

  /**
   * Opens a SkyWay session in a room, with a peer id derived from the user, room and password.
   *
   * Opening is asynchronous and reported through callback.onOpen or onError. No peer is connected yet.
   */
  open(userId: string, roomId: string, roomName: string, password: string): void {
    void this.openAs(PeerContext.createRoom(userId, roomId, roomName, password));
  }

  /** Opens the session as the peer being made, or reports through callback.onError that it could not be made. */
  private async openAs(making: Promise<PeerContext>): Promise<void> {
    let peer: PeerContext;
    try {
      peer = await making;
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      Logger.error('[SkyWay] ピアを作れませんでした', error);
      this.callback.onError?.(this.peer, error.name, error.message, error);
      return;
    }
    await this.openSkyWay(peer);
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
   * has a stream that is open or still opening, fails the room and password check, or is not in
   * the room. True means the attempt started; callback.onConnect reports when the channel opens.
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

    if (this.peerIds.includes(peerId) || this.hasLiveStream(peerId)) {
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

  /** Whether a stream to the peer is open or still on its way to opening. */
  private hasLiveStream(peerId: string): boolean {
    const stream = this.streams.find(peerId);
    return !!stream && !stream.isDead;
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
   * A batch goes out in runs: pieces of a file are sent on their own and as they are, and a large
   * run of the other messages is compressed. The pieces of a file go to the peer's stream as bulk
   * and everything else as control, so the pieces keep their order among themselves and so does
   * the rest, while the rest is not kept waiting behind the pieces. Nothing is sent while no peer
   * is connected, and a message for a peer whose channel is not open is dropped, which is logged,
   * at most once in ten seconds for a peer.
   */
  send(data: unknown, sendTo?: string) {
    if (this.peers.length < 1) return;
    if (!Array.isArray(data)) {
      this.sendContainer(data, sendTo, false, 'control');
      return;
    }
    const compressesRuns = 1 < data.length;
    for (const run of splitAtFileChunks(data)) {
      const lane: SendLane = run.carriesFileChunks ? 'bulk' : 'control';
      this.sendContainer(run.messages, sendTo, compressesRuns && !run.carriesFileChunks, lane);
    }
  }

  private sendContainer(data: unknown, sendTo: string | undefined, compressible: boolean, lane: SendLane) {
    const container: DataContainer = {
      data: MessagePack.encode(data),
      ttl: 1,
    };

    const byteLength = container.data.byteLength;
    this.bandwidthUsage += byteLength;
    this.outboundQueue = this.outboundQueue.then(async () => {
      await waitZeroTimeout();
      if (compressible) {
        const packed = await compressIfSmaller(container.data);
        container.data = packed.bytes;
        if (packed.compressed) container.isCompressed = true;
      }
      if (sendTo) {
        this.sendUnicast(container, sendTo, lane);
      } else {
        this.sendBroadcast(container, lane);
      }
      this.bandwidthUsage -= byteLength;
    });
  }

  private sendUnicast(container: DataContainer, sendTo: string, lane: SendLane) {
    container.ttl = 0;
    const stream = this.streams.find(sendTo);
    if (stream && stream.open) {
      stream.send(container, lane);
      return;
    }
    const held = this.droppedUnicastLog.pass(sendTo);
    if (held === null) return;
    const state = stream ? 'ストリームが開いていない' : 'ストリームがない';
    Logger.warn(`[SkyWay] ${state}ため送信を破棄しました: ${sendTo}（前回の記録から他に${held}件）`);
  }

  private sendBroadcast(container: DataContainer, lane: SendLane) {
    for (const stream of this.streams) {
      if (stream.open) stream.send(container, lane);
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
    this.watchConnectDeadline(stream);

    stream.on('data', (data) => {
      this.onData(stream, data);
    });
    stream.on('open', () => {
      this.clearConnectDeadline(stream);
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

  /** Gives a stream up, to be tried again, when it has neither opened nor closed by the deadline. */
  private watchConnectDeadline(stream: SkyWayDataStream) {
    const deadline = setTimeout(() => {
      this.connectDeadlines.delete(stream);
      if (stream.open || this.streams.find(stream.peer.peerId) !== stream) return;
      Logger.warn(
        `[SkyWay] ${CONNECT_DEADLINE_MS / 1000}秒たっても開かないため接続をやり直します: ${stream.peer.peerId}`
      );
      this.disconnectStream(stream, true);
    }, CONNECT_DEADLINE_MS);
    this.connectDeadlines.set(stream, deadline);
  }

  private clearConnectDeadline(stream: SkyWayDataStream) {
    const deadline = this.connectDeadlines.get(stream);
    if (deadline != null) clearTimeout(deadline);
    this.connectDeadlines.delete(stream);
  }

  private disconnectStream(stream: SkyWayDataStream, allowReconnect: boolean = false) {
    this.clearConnectDeadline(stream);
    stream.disconnect();
    const closed = this.streams.remove(stream);
    if (closed) this.maybeUnavailablePeerIds.delete(stream.peer.peerId);

    this.relayingPeerIds.delete(stream.peer.peerId);
    this.listedPeerIds.delete(stream.peer.peerId);
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
      if (this.reconnectScheduler.isScheduled(target.peerId)) return;
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
    if (this.isFirstSteadyAttempt(target.peerId)) {
      this.callback.onReconnect?.(target, 'failed');
    }
  }

  /** Whether the attempt just scheduled is the first past the backoff, when the failure is reported. */
  private isFirstSteadyAttempt(peerId: string): boolean {
    return (
      this.reconnectScheduler.isPastBackoff(peerId) &&
      this.reconnectScheduler.attemptOf(peerId) === this.reconnectScheduler.backoffSteps + 1
    );
  }

  /**
   * Dials a peer again. One that can no longer be dialled, having left the room or the session
   * having closed, is given up, and reported as failed unless it has been already. One with a
   * stream open or opening by now is left to that stream.
   */
  private async tryReconnect(peer: PeerContext) {
    if (await this.connect(peer)) return;
    if (this.hasLiveStream(peer.peerId)) return;

    Logger.info(`[SkyWay] 再接続の対象外になりました: ${peer.peerId}`);
    const gaveUp = 0 < this.reconnectScheduler.attemptOf(peer.peerId) && !this.peerIds.includes(peer.peerId);
    const reported = this.reconnectScheduler.isPastBackoff(peer.peerId);
    this.reconnectScheduler.reset(peer.peerId);
    if (gaveUp && !reported) this.callback.onReconnect?.(peer, 'failed');
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
        .catch((reason) => Logger.debug('[SkyWay] 中継表の更新に失敗しました', reason));
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
   * A message that cannot be read is logged and dropped whole; the ones behind it still go through.
   * One that was read is handed over whatever its handling throws, which is logged apart from that.
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
          let events: unknown[];
          try {
            const data = container.isCompressed ? await decompressAsync(container.data) : container.data;
            events = MessagePack.decode(data) as unknown[];
          } catch (e) {
            Logger.error('[SkyWay] 受信データを読めなかったため破棄しました', e);
            continue;
          }
          try {
            this.callback.onData?.(peer, events);
          } catch (e) {
            Logger.error('[SkyWay] 受信データの処理中に例外が出ました', e);
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
        conn.send(container, 'control');
      }
    }
  }

  private async onUpdateUserIds(stream: SkyWayDataStream, userIds: string[]) {
    let needsNotifyUserList = false;
    const listedPeerIds: PeerId[] = [];
    for (const userId of userIds) {
      const peer = await this.makeFriendPeer(userId);
      listedPeerIds.push(peer.peerId);
      const existingStream = this.streams.find(peer.peerId);
      if (existingStream && existingStream.peer.userId !== userId) {
        existingStream.peer.userId = userId;
        needsNotifyUserList = true;
      }
    }

    this.listedPeerIds.set(stream.peer.peerId, listedPeerIds);
    const { diff1: relayingUserIds, diff2: unknownUserIds } = diff(this.userIds, userIds);
    this.relayingPeerIds.set(
      stream.peer.peerId,
      await Promise.all(relayingUserIds.map(async (userId) => (await this.makeFriendPeer(userId)).peerId))
    );

    if (unknownUserIds.length) {
      for (const userId of unknownUserIds) {
        const peer = await this.makeFriendPeer(userId);
        if (!this.maybeUnavailablePeerIds.has(peer.peerId) && !this.reconnectScheduler.isScheduled(peer.peerId)) {
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
    this.sendBroadcast(container, 'control');
  }

  private async makeFriendPeer(userId: string): Promise<PeerContext> {
    return PeerContext.createRoom(userId, this.peer.roomId, this.peer.roomName, this.peer.password);
  }
}
