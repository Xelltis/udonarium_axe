import { Logger } from '@axe/core/logging/logger';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { PeerSessionGrade } from '@axe/core/network/peer-session-state';
import { ChunkBuffer, DataChunk } from '@axe/core/network/skyway/skyway-chunk-buffer';
import { SkyWayFacade } from '@axe/core/network/skyway/skyway-facade';
import { CandidateType, WebRTCStats } from '@axe/core/network/webrtc/webrtc-stats';
import { WebRTCConnection, WebRTCStatsMonitor } from '@axe/core/network/webrtc/webrtc-stats-monitor';
import * as MessagePack from '@axe/core/util/message-pack';
import { generateUuid } from '@axe/core/util/uuid';
import { setZeroTimeout } from '@axe/core/util/zero-timeout';
import {
  isRemoteMember,
  LocalDataStream,
  P2PConnection,
  Publication,
  RemoteDataStream,
  RemoteMember,
  Subscription,
  TransportConnectionState,
} from '@skyway-sdk/core';
import { EventEmitter } from 'eventemitter3';

/** How much the channel may already be holding before the queue waits for it to drain. */
const SEND_BUFFER_LIMIT_BYTES = 1024 * 1024;

/** How long the queue waits before asking a full channel again. */
const SEND_RETRY_MS = 50;

interface Ping {
  from: string;
  ping: number;
}

export class SkyWayDataStream extends EventEmitter implements WebRTCConnection {
  static readonly STALE_TIMEOUT_MS = 25000;

  readonly peer: PeerContext;

  private chunkSize = 15.5 * 1024;
  private chunkBuffer = new ChunkBuffer();

  private stats: WebRTCStats | null = null;

  /** Whether the data channel to the peer is open. */
  get open(): boolean {
    return this.peer.isOpen;
  }
  /** The peer's member entry in the SkyWay room, or undefined when it is not in the room. */
  get member(): RemoteMember | undefined {
    return this.skyWay.room?.members.find(
      (member): member is RemoteMember => isRemoteMember(member) && member.name === this.peer.peerId
    );
  }

  private isQueuing = false;
  private sendQueue: Set<Uint8Array> = new Set();

  private _timestamp: number = performance.now();
  /** When data last came from the peer (performance.now()), used to spot a dead connection. */
  get timestamp(): number {
    return this._timestamp;
  }
  private set timestamp(timestamp: number) {
    this._timestamp = timestamp;
  }

  /** Counts the peer as heard from just now, restarting the clock for marking it dead. */
  resetTimestamp(): void {
    this._timestamp = performance.now();
  }

  private _ping: number = 0;
  /** Smoothed round-trip time to the peer in ms, measured by pings sent with stats updates. */
  get ping(): number {
    return this._ping;
  }
  private set ping(ping: number) {
    this._ping = ping;
  }

  private _candidateType: CandidateType = CandidateType.UNKNOWN;
  /** The ICE candidate type the connection runs over as of the last stats update; relay means TURN. */
  get candidateType(): CandidateType {
    return this._candidateType;
  }
  private set candidateType(candidateType: CandidateType) {
    this._candidateType = candidateType;
  }

  sortKey = '';
  isPublication = false;
  private isCanceled = false;
  private isRejected = false;
  private isOpened = false;

  private state: TransportConnectionState = 'new';
  private subscription: Subscription<RemoteDataStream> | null = null;
  private dataChannel: RTCDataChannel | null = null;

  private onStreamAdded: { removeListener: () => void } | null = null;
  private onStreamPublished: { removeListener: () => void } | null = null;
  private onConnectionStateChanged: { removeListener: () => void } | null = null;

  private onopen = () => {
    this.refresh();
  };

  private onmessage = (event: MessageEvent<ArrayBuffer>) => {
    this.onData(event.data as ArrayBuffer);
  };

  private constructor(
    readonly skyWay: SkyWayFacade,
    peer: IPeerContext
  ) {
    super();

    this.peer = PeerContext.parse(peer.peerId);
    this.peer.userId = peer.userId;
    this.peer.password = peer.password;
  }

  /** A stream answering a peer that subscribed to this device's data publication. */
  static createPublication(skyWay: SkyWayFacade, peer: IPeerContext): SkyWayDataStream {
    const instance = new SkyWayDataStream(skyWay, peer);
    instance.sortKey = instance.skyWay.peer.peerId;
    instance.isPublication = true;
    return instance;
  }

  /** A stream this device starts by subscribing to the peer's data publication. */
  static createSubscription(skyWay: SkyWayFacade, peer: IPeerContext): SkyWayDataStream {
    const instance = new SkyWayDataStream(skyWay, peer);
    instance.sortKey = instance.peer.peerId;
    instance.isPublication = false;
    return instance;
  }

  /**
   * Sets the stream up and reports progress through its open, close and data events.
   *
   * A subscription subscribes to the peer's publication, waiting for it to be published if need be;
   * a publication attaches to the subscription the peer already made.
   */
  connect() {
    if (this.isPublication) {
      return this.initializePublication();
    } else {
      return this.initializeSubscription();
    }
  }

  /**
   * Closes the stream.
   *
   * An open stream is disposed at once, with its listeners removed and no close event. One that has
   * not opened yet has its channel closed as soon as it appears.
   */
  disconnect() {
    this.isCanceled = true;
    if (this.isOpened) {
      this.dispose();
    } else {
      this.refresh();
    }
  }

  /** Refuses the peer's connection, setting the stream up only to close its channel straight away. */
  reject() {
    this.isRejected = true;
    this.connect();
  }

  private dispose() {
    this.peer.isOpen = false;
    this.stopMonitoring();
    this.removeAllListeners();
    this.chunkBuffer.clear();

    this.onStreamAdded?.removeListener();
    this.onStreamPublished?.removeListener();
    this.onConnectionStateChanged?.removeListener();
    this.onStreamAdded = null;
    this.onStreamPublished = null;
    this.onConnectionStateChanged = null;

    this.subscription = null;

    this.dataChannel?.removeEventListener('open', this.onopen);
    this.dataChannel?.removeEventListener('message', this.onmessage);
    this.dataChannel?.close();
    this.dataChannel = null;
  }

  private initializePublication() {
    const member = this.member;
    const subscription = member?.subscriptions.find(
      (subscription) =>
        subscription.publication.contentType === 'data' &&
        subscription.publication.metadata === 'udonarium-data-stream' &&
        subscription.publication.publisher.name === this.skyWay.peer.peerId
    ) as Subscription<RemoteDataStream>;

    if (!subscription) {
      Logger.error(`[SkyWay] サブスクリプションが見つかりません: ${this.peer.peerId}`);
    }

    this.onConnectionStateChanged?.removeListener();
    const pub = this.skyWay.publication;
    if (pub) {
      this.onConnectionStateChanged = pub.onConnectionStateChanged.add((event) => {
        if (event.remoteMember.name !== this.peer.peerId) return;
        this.onStateChanged(event.state);
      });
    }

    this.subscription = subscription;
    this.refresh();
  }

  private async initializeSubscription() {
    const member = this.member;
    if (!member) {
      Logger.warn(`[SkyWay] メンバーが見つかりません: ${this.peer.peerId}`);
      return;
    }

    const publication = member.publications.find(
      (publication) => publication.contentType === 'data' && publication.metadata === 'udonarium-data-stream'
    );

    if (!publication) {
      this.onStreamPublished?.removeListener();
      const room = this.skyWay.room;
      if (room) {
        this.onStreamPublished = room.onStreamPublished.add((event) => {
          const isMatch =
            event.publication.contentType === 'data' &&
            event.publication.metadata === 'udonarium-data-stream' &&
            event.publication.publisher.name === this.peer.peerId;
          if (!isMatch) return;

          this.onStreamPublished?.removeListener();
          this.initializeSubscription();
        });
      }
      return;
    }

    this.refresh();
    try {
      const roomPerson = this.skyWay.roomPerson;
      if (!roomPerson) return;
      const { subscription } = await roomPerson.subscribe<RemoteDataStream>(publication.id);

      this.onConnectionStateChanged?.removeListener();
      this.onConnectionStateChanged = subscription.onConnectionStateChanged.add((state) => {
        this.onStateChanged(state);
      });

      this.subscription = subscription;

      this.refresh();
    } catch (e) {
      if (e instanceof Error) {
        Logger.warn('[SkyWay] サブスクリプションエラー', e);
      } else {
        Logger.error('[SkyWay] サブスクリプションエラー', e);
      }

      this.subscription = null;
      this.state = 'disconnected';
      this.emit('close');
    }
  }

  private onStateChanged(state: TransportConnectionState) {
    if (state === 'disconnected') {
      this.subscription = null;
      this.emit('close');
      return;
    }
    if (state === 'connected' && this.state === 'reconnecting') this.peer.isOpen = false;
    this.refresh();
    this.state = state;
  }

  private refresh() {
    const member = this.member;

    const p2pconnection = (
      member as unknown as { _getOrCreateConnection?: (...args: unknown[]) => P2PConnection }
    )?._getOrCreateConnection?.((this.skyWay.roomPerson as unknown as { _impl?: unknown })?._impl) as P2PConnection;
    const publication = member?.publications.find((publication) => publication.metadata === 'udonarium-data-stream');

    const dataChannel = this.isPublication
      ? p2pconnection?.sender.datachannels[this.skyWay.publication?.id ?? '']
      : (p2pconnection?.receiver.streams[publication?.id ?? ''] as RemoteDataStream)?._datachannel;

    const isOpen = dataChannel?.readyState === 'open';

    if (dataChannel && ((this.isCanceled && isOpen) || this.isRejected)) {
      dataChannel.close();
      this.dispose();
      this.state = 'disconnected';
      this.emit('close');
      return;
    }

    if (dataChannel && this.dataChannel && dataChannel !== this.dataChannel) {
      Logger.warn(`[SkyWay] dataChannel変更: ${this.dataChannel?.id} -> ${dataChannel.id}`);
      this.peer.isOpen = false;
    }

    this.dataChannel?.removeEventListener('open', this.onopen);
    this.dataChannel?.removeEventListener('message', this.onmessage);

    if (dataChannel) dataChannel.binaryType = 'arraybuffer';
    dataChannel?.addEventListener('open', this.onopen);
    dataChannel?.addEventListener('message', this.onmessage);

    this.dataChannel = dataChannel ?? null;

    this.onStreamAdded?.removeListener();
    if (p2pconnection && !dataChannel) {
      this.onStreamAdded = p2pconnection.receiver.onStreamAdded.add((_event) => {
        this.refresh();
      });
    }

    if (isOpen !== this.peer.isOpen) {
      this.peer.isOpen = isOpen;
      if (isOpen) {
        this.isOpened = true;
        this.state = 'connected';
        this.resetTimestamp();
        this.emit('open');
      } else {
        this.subscription = null;
        this.state = 'disconnected';
        this.emit('close');
      }
    }

    this.stats = this.createStats();

    if (isOpen) {
      this.startMonitoring();
      if (!this.isQueuing) this.execQueue();
    } else {
      this.stopMonitoring();
    }
  }

  /**
   * Queues data for the peer, split into chunks of about 15.5 KB when larger.
   *
   * The queue is fed to the channel as its buffer drains, and waits while the channel is not open.
   */
  send(data: unknown) {
    const encodedData: Uint8Array = MessagePack.encode(data);

    const total = Math.ceil(encodedData.byteLength / this.chunkSize);
    if (total <= 1) {
      this.addSendQueue(encodedData);
      return;
    }

    const id = generateUuid();

    for (let sliceIndex = 0; sliceIndex < total; sliceIndex++) {
      const sliceData = encodedData.slice(sliceIndex * this.chunkSize, (sliceIndex + 1) * this.chunkSize);
      const chunk: DataChunk = { id, data: sliceData, index: sliceIndex, total };
      this.addSendQueue(MessagePack.encode(chunk));
    }
  }

  private addSendQueue(data: Uint8Array) {
    this.sendQueue.add(data);
    if (!this.isQueuing) this.execQueue();
  }

  /**
   * Sends what is queued, as much of it as the channel will take.
   *
   * A message larger than a chunk is queued in pieces. Sending one piece per turn of the event
   * loop would send a picture at the speed the browser gets round to it rather than the speed
   * the line can carry, so the channel is asked how much it is already holding and fed until
   * that reaches the limit, which is what keeps a slow line from being buried.
   *
   * A pass that got nothing away waits on the clock before trying again. Coming straight
   * back would turn a full channel into a loop that holds the main thread doing nothing
   * until the line drains, which on a slow one is seconds.
   */
  private execQueue = () => {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      this.isQueuing = false;
      return;
    }
    let sent = 0;
    for (const data of this.sendQueue) {
      if ((this.dataChannel.bufferedAmount ?? 0) >= SEND_BUFFER_LIMIT_BYTES) break;
      try {
        this.dataChannel.send(data as unknown as ArrayBufferView<ArrayBuffer>);
        this.sendQueue.delete(data);
        sent += 1;
      } catch (err) {
        Logger.error('[SkyWay] データ送信エラー', err);
        break;
      }
    }
    this.isQueuing = this.sendQueue.size > 0;
    if (!this.isQueuing) return;
    if (sent > 0) setZeroTimeout(this.execQueue);
    else setTimeout(this.execQueue, SEND_RETRY_MS);
  };

  /** The RTCPeerConnection under the stream, for reading WebRTC stats; undefined until established. */
  getPeerConnection(): RTCPeerConnection | undefined {
    if (this.isPublication) {
      const member = this.member;
      if (!member) return;
      return (this.subscription?.publication as Publication<LocalDataStream>)?.stream?._getRTCPeerConnection(member);
    } else {
      return this.subscription?.stream?._getRTCPeerConnection();
    }
  }

  private startMonitoring() {
    WebRTCStatsMonitor.add(this);
  }

  private stopMonitoring() {
    WebRTCStatsMonitor.remove(this);
  }

  /**
   * Refreshes the peer's session figures (ping, health, speed, grade) and emits stats.
   *
   * The stats monitor calls it every few seconds, and it sends a ping each time. A peer silent for
   * 25 seconds is marked closed and close is emitted instead.
   */
  async updateStatsAsync() {
    if (this.stats == null) this.stats = this.createStats();
    this.sendPing();

    const deltaTime = performance.now() - this.timestamp;

    if (SkyWayDataStream.STALE_TIMEOUT_MS <= deltaTime) {
      Logger.warn(`[SkyWay] ${Math.round(deltaTime / 1000)}秒間無通信のため切断とみなします: ${this.peer.peerId}`);
      this.peer.isOpen = false;
      this.state = 'disconnected';
      this.emit('close');
      return;
    }

    if (this.stats != null) {
      await this.stats.updateAsync();
      this.candidateType = this.stats.candidateType;
    }

    const healthRate = deltaTime <= 10000 ? 1 : 5000 / (deltaTime - 10000 + 5000);
    const ping = healthRate < 1 ? deltaTime : this.ping;
    const pingRate = 500 / (ping + 500);

    this.peer.session.health = healthRate;
    this.peer.session.ping = ping;
    this.peer.session.speed = pingRate * healthRate;

    const gradeByCandidate: Record<CandidateType, PeerSessionGrade> = {
      [CandidateType.HOST]: PeerSessionGrade.HIGH,
      [CandidateType.SRFLX]: PeerSessionGrade.MIDDLE,
      [CandidateType.PRFLX]: PeerSessionGrade.MIDDLE,
      [CandidateType.RELAY]: PeerSessionGrade.LOW,
      [CandidateType.UNKNOWN]: PeerSessionGrade.UNSPECIFIED,
    };
    this.peer.session.grade = gradeByCandidate[this.candidateType];
    this.peer.session.description = this.candidateType;

    if (this.stats != null) this.emit('stats', this.stats);
  }

  private createStats(): WebRTCStats | null {
    const peerConnection = this.getPeerConnection();
    return peerConnection ? new WebRTCStats(peerConnection) : null;
  }

  /** Sends a timestamped ping that the peer echoes back, from which ping is measured. */
  sendPing() {
    const encodedData: Uint8Array = MessagePack.encode({
      from: this.skyWay.peer.peerId,
      ping: performance.now(),
    });
    this.addSendQueue(encodedData);
  }

  private receivePing(ping: Ping) {
    if (ping.from === this.skyWay.peer.peerId) {
      const now = performance.now();
      const rtt = now - ping.ping;
      this.ping = rtt <= this.ping ? this.ping * 0.5 + rtt * 0.5 : rtt;
    } else {
      const encodedData = MessagePack.encode(ping);
      this.addSendQueue(encodedData);
    }
  }

  private onData(data: ArrayBuffer) {
    this.timestamp = performance.now();
    const decoded: unknown = MessagePack.decode(new Uint8Array(data));

    const ping: Ping = decoded as Ping;
    if (ping.ping !== undefined) {
      this.receivePing(ping);
      return;
    }

    const chunk: DataChunk = decoded as DataChunk;
    if (chunk.id === undefined) {
      this.emit('data', decoded);
      return;
    }

    const assembled = this.chunkBuffer.add(chunk);
    if (assembled === null) return;

    this.emit('data', MessagePack.decode(assembled));
  }
}
