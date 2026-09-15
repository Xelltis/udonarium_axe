import { Logger } from '@axe/core/logging/logger';
import { Connection, ConnectionCallback } from '@axe/core/network/connection';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { setZeroTimeout } from '@axe/core/util/zero-timeout';

type QueueItem = { data: unknown; sendTo: string | undefined; turn: number };
type ConnectionClass = new (...args: never[]) => Connection;

const unknownPeer = PeerContext.parse('???');

export class Network {
  private static _instance: Network;
  /** The network shared by the whole app, created on first use. */
  static get instance(): Network {
    if (!Network._instance) Network._instance = new Network();
    return Network._instance;
  }

  /** Whether this device has an open SkyWay session. */
  static get isOpen(): boolean {
    return Network.instance.isOpen;
  }
  /** This device's peer id, or the placeholder '???' before a session exists. */
  static get peerId(): string {
    return Network.instance.peerId;
  }
  /** Ids of the peers with an open connection, as a new array; empty without a connection. */
  static get peerIds(): string[] {
    return Network.instance.peerIds;
  }
  /** This device's peer context, or a placeholder before a session exists. */
  static get peer(): IPeerContext {
    return Network.instance.peer;
  }
  /** Contexts of every peer connected or still connecting, as a new array. */
  static get peers(): IPeerContext[] {
    return Network.instance.peers;
  }
  /** This device's peer context; the same value as peer. */
  static get peerContext(): IPeerContext {
    return Network.instance.peerContext;
  }
  /** Contexts of every peer connected or still connecting; the same value as peers. */
  static get peerContexts(): IPeerContext[] {
    return Network.instance.peerContexts;
  }
  /** Bytes in transit: sent but not yet on the channel, or received but not yet handed on. */
  static get bandwidthUsage(): number {
    return Network.instance.bandwidthUsage;
  }
  /** Keeps the app config, such as the backend URL, for the connection made on the next open. */
  static configure(config: Record<string, unknown>) {
    Network.instance.configure(config);
  }
  /**
   * Opens a network session in no room, closing any session first.
   *
   * The connection code loads on first use, so this returns before the session is open; the
   * OPEN_NETWORK event follows once it is.
   */
  static openStandby(userId?: string): void {
    Network.instance.openStandby(userId);
  }
  /**
   * Opens a network session in a room, closing any session first.
   *
   * This returns before the session is open; the OPEN_NETWORK event follows once it is. From then
   * on, leaving the page asks for confirmation and hiding it leaves the room.
   */
  static open(userId: string, roomId: string, roomName: string, password: string): void {
    Network.instance.open(userId, roomId, roomName, password);
  }

  get isOpen(): boolean {
    return this.connection ? this.connection.peer.isOpen : false;
  }

  get peerId(): string {
    return this.connection ? this.connection.peerId : unknownPeer.peerId;
  }
  get peerIds(): string[] {
    return this.connection ? [...this.connection.peerIds] : [];
  }

  get peer(): IPeerContext {
    return this.connection ? this.connection.peer : unknownPeer;
  }
  get peers(): IPeerContext[] {
    return this.connection ? [...this.connection.peers] : [];
  }

  get peerContext(): IPeerContext {
    return this.peer;
  }
  get peerContexts(): IPeerContext[] {
    return this.peers;
  }

  readonly callback: ConnectionCallback = new ConnectionCallback();
  get bandwidthUsage(): number {
    return this.connection ? this.connection.bandwidthUsage : 0;
  }

  private config: Record<string, unknown> = {};
  private connectionClassPromise: Promise<ConnectionClass> | null = null;
  private connectionClass!: ConnectionClass;
  private connection: Connection | null = null;

  private queue: Map<string | symbol, QueueItem> = new Map();
  private lastTurn = 0;
  private lastBroadcastTurn = 0;
  private readonly lastTurnByPeer: Map<string, number> = new Map();
  private sendInterval: number | null = null;
  private sendCallback = () => {
    this.sendQueue();
  };

  private callbackPageHide: (e: PageTransitionEvent) => void = (e: PageTransitionEvent) => {
    if (this.connection?.leaveImmediately) {
      this.connection.leaveImmediately();
    }
    if (!e.persisted) this.close();
  };

  private callbackBeforeUnload: (e: BeforeUnloadEvent) => void = (e: BeforeUnloadEvent) => {
    e.preventDefault();
  };

  private constructor() {}

  configure(config: Record<string, unknown>) {
    this.config = config;
  }

  open(userId: string, roomId: string, roomName: string, password: string): void {
    if (this.connectionClassPromise != null) {
      Logger.warn('[Network] 既に接続済みです');
      this.close();
    }
    this.openAsync(() => this.connection!.open(userId, roomId, roomName, password));
  }

  openStandby(userId?: string): void {
    if (this.connectionClassPromise != null) {
      Logger.warn('[Network] 既に接続済みです');
      this.close();
    }
    this.openAsync(() => this.connection!.openStandby(userId));
  }

  private async openAsync(connectFn: () => void) {
    const promise = this.dynamicImport();
    this.connectionClassPromise = promise;
    this.connectionClass = await promise;
    if (this.connectionClassPromise != promise) return;

    Logger.debug('[Network] open');
    this.connection = this.initializeConnection();
    connectFn();

    window.addEventListener('pagehide', this.callbackPageHide);
    window.addEventListener('beforeunload', this.callbackBeforeUnload);
  }

  private close() {
    if (this.connection) this.connection.close();
    this.connection = null;
    this.connectionClassPromise = null;
    window.removeEventListener('pagehide', this.callbackPageHide);
    window.removeEventListener('beforeunload', this.callbackBeforeUnload);
    Logger.debug('[Network] close');
  }

  /** Starts connecting to a peer; false when there is no connection or the peer is refused. */
  async connect(peer: IPeerContext): Promise<boolean> {
    if (this.connection) return this.connection.connect(peer);
    return false;
  }

  /** Closes the connection to a peer without reconnecting; does nothing without a connection. */
  disconnect(peer: IPeerContext) {
    if (!this.connection) return;
    if (this.connection.disconnect(peer)) {
      Logger.debug('[Network] disconnect', peer.peerId);
    }
  }

  /**
   * Queues a message for the next send.
   *
   * A message given a replaceKey takes the place of one queued under the same key and
   * destination that has not gone out yet. It keeps that one's turn while nothing that reaches
   * any of the same peers has been queued behind it, and otherwise goes to the back, so it never
   * overtakes a message queued after the one it replaces.
   */
  send(data: unknown, sendTo?: string, replaceKey?: string) {
    const queueKey = replaceKey == null ? Symbol() : `${sendTo ?? ''}\n${replaceKey}`;
    const waiting = this.queue.get(queueKey);
    if (waiting && !this.hasQueuedBehind(waiting)) {
      waiting.data = data;
    } else {
      this.queue.delete(queueKey);
      this.queue.set(queueKey, { data, sendTo, turn: this.takeTurn(sendTo) });
    }
    if (this.sendInterval === null) {
      this.sendInterval = setZeroTimeout(this.sendCallback);
    }
  }

  private takeTurn(sendTo: string | undefined): number {
    const turn = ++this.lastTurn;
    if (sendTo == null) {
      this.lastBroadcastTurn = turn;
    } else {
      this.lastTurnByPeer.set(sendTo, turn);
    }
    return turn;
  }

  /** Whether a message reaching any of the peers this one reaches was queued after it. */
  private hasQueuedBehind(item: QueueItem): boolean {
    if (item.sendTo == null) return item.turn < this.lastTurn;
    return item.turn < this.lastBroadcastTurn || item.turn < (this.lastTurnByPeer.get(item.sendTo) ?? 0);
  }

  private sendQueue() {
    const broadcast: unknown[] = [];
    const unicast: { [sendTo: string]: unknown[] } = {};
    const echocast: unknown[] = [];

    let loopCount = this.queue.size < 128 ? this.queue.size : 128;
    for (const [queueKey, item] of this.queue) {
      if (loopCount <= 0) break;
      loopCount--;
      this.queue.delete(queueKey);
      if (item.sendTo == null) {
        broadcast.push(item.data);
      } else if (item.sendTo === this.peerId) {
        echocast.push(item.data);
      } else {
        if (!(item.sendTo in unicast)) unicast[item.sendTo] = [];
        unicast[item.sendTo].push(item.data);
      }
    }

    if (this.connection) {
      if (broadcast.length) this.connection.send(broadcast);
      for (const [sendTo, data] of Object.entries(unicast)) this.connection.send(data, sendTo);
    }

    if (this.callback.onData) {
      this.callback.onData(null, broadcast);
      this.callback.onData(this.peer, echocast);
    }

    if (this.queue.size > 0) {
      this.sendInterval = setZeroTimeout(this.sendCallback);
    } else {
      this.sendInterval = null;
      this.lastTurnByPeer.clear();
    }
  }

  /** Peer ids of every lobby member, refreshed at most every 10 s; empty without a connection. */
  listAllPeers(): Promise<string[]> {
    return this.connection ? this.connection.listAllPeers() : Promise.resolve([]);
  }

  /** The rooms listed in the lobby; empty without a connection. */
  listAllRooms(): Promise<IRoomInfo[]> {
    return this.connection ? this.connection.listAllRooms() : Promise.resolve([]);
  }

  private initializeConnection(): Connection {
    const connection = new this.connectionClass();
    connection.configure(this.config);

    connection.callback.onOpen = (peer) => {
      if (this.callback.onOpen) this.callback.onOpen(peer);
    };
    connection.callback.onClose = (peer) => {
      if (this.callback.onClose) this.callback.onClose(peer);
    };
    connection.callback.onConnect = (peer) => {
      if (this.callback.onConnect) this.callback.onConnect(peer);
    };
    connection.callback.onDisconnect = (peer) => {
      if (this.callback.onDisconnect) this.callback.onDisconnect(peer);
    };
    connection.callback.onReconnect = (peer, state) => {
      if (this.callback.onReconnect) this.callback.onReconnect(peer, state);
    };
    connection.callback.onData = (peer, data) => {
      if (this.callback.onData) this.callback.onData(peer, data);
    };
    connection.callback.onError = (peer, errorType, errorMessage, errorObject) => {
      if (this.callback.onError) this.callback.onError(peer, errorType, errorMessage, errorObject);
    };

    if (this.queue.size > 0 && this.sendInterval === null) this.sendInterval = setZeroTimeout(this.sendCallback);

    return connection;
  }

  private async dynamicImport(_mode: string = ''): Promise<ConnectionClass> {
    return (await import('@axe/core/network/skyway/skyway-connection')).SkyWayConnection;
  }
}
