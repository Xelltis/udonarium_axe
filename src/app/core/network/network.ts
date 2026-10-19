import { Logger } from '@axe/core/logging/logger';
import { AssetAccess, Connection, ConnectionCallback, ServerCredentialSource } from '@axe/core/network/connection';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { IRoomInfo } from '@axe/core/network/room-info';
import { CreateRoomResponse, InviteMessage, ServerRole } from '@axe/core/network/server/server-protocol';
import { Transport, transportOf } from '@axe/core/network/transport';
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
  /** The room the network was last asked to open, at once as it is asked; empty once asked to wait outside any. */
  static get requestedRoomId(): string {
    return Network.instance.requestedRoomId;
  }
  /** How many times the network has been asked to open a room or to wait outside any. */
  static get openRequests(): number {
    return Network.instance.openRequests;
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
  /** The room server's peer id when connected through one; null with SkyWay or without a connection. */
  static get authorityPeerId(): string | null {
    return Network.instance.authorityPeerId;
  }
  /** Whether the link to the room server is up just now; false with SkyWay, or while it is down. */
  static get isAuthorityOpen(): boolean {
    return Network.instance.isAuthorityOpen;
  }
  /** Whether the connection is holding sends back for seconds, as a room server's does for a big load. */
  static get hasSendsPending(): boolean {
    return Network.instance.hasSendsPending;
  }
  /** How far the room server's clock runs ahead of this one; null with SkyWay or before it let the seat in. */
  static get serverClockOffset(): number | null {
    return Network.instance.serverClockOffset;
  }
  /** How this deployment connects players, as config.json names it. */
  static get transport(): Transport {
    return Network.instance.transport;
  }
  /** The key of the open room on a room server; null with SkyWay or outside a room. */
  static get roomKey(): string | null {
    return Network.instance.roomKey;
  }
  /** The role a room server gave this seat; null with SkyWay or outside a room. */
  static get serverRole(): ServerRole | null {
    return Network.instance.serverRole;
  }
  /**
   * Lets the page be left without the browser asking whether to, for a reload or a leave the reader
   * has already chosen and been told of.
   */
  static letPageGo(): void {
    Network.instance.letPageGo();
  }
  /** Keeps the app config, such as the backend URL, for the connection made on the next open. */
  static configure(config: Record<string, unknown>) {
    Network.instance.configure(config);
  }
  /** Keeps the login a room server connection says hello with, for this connection and every later one. */
  static setServerCredentials(source: ServerCredentialSource | null) {
    Network.instance.setServerCredentials(source);
  }
  /**
   * Keeps an invitation from a link for the room it invites to, carried by every hello to that room
   * until a logged-in seat gets in with it; a guest's seat leaves it for after a login.
   */
  static setServerInvite(invite: string, roomKey: string) {
    Network.instance.setServerInvite(invite, roomKey);
  }
  /** The invitation kept for the room it was given for, until a logged-in seat is let in with it. */
  static get pendingServerInvite(): { invite: string; roomKey: string } | null {
    return Network.instance.pendingServerInvite;
  }
  /** Asks the room server for an invitation in a role; rejects with SkyWay or outside a room. */
  static requestInvite(role: ServerRole): Promise<InviteMessage> {
    return Network.instance.requestInvite(role);
  }
  /** Takes a seat let out of its room for the page left alone back in; nothing with SkyWay. */
  static comeBackFromIdle(): void {
    Network.instance.comeBackFromIdle();
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
  static open(userId: string, roomId: string, roomName: string, password: string, roomKey?: string): void {
    Network.instance.open(userId, roomId, roomName, password, roomKey);
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
  get authorityPeerId(): string | null {
    return this.connection?.authorityPeerId ?? null;
  }
  get isAuthorityOpen(): boolean {
    return this.connection?.authorityOpen ?? false;
  }
  get hasSendsPending(): boolean {
    return this.connection?.sendsPending ?? false;
  }
  get serverClockOffset(): number | null {
    return this.connection?.serverClockOffset ?? null;
  }
  get transport(): Transport {
    return transportOf(this.config);
  }
  get roomKey(): string | null {
    return this.connection?.roomKey ?? null;
  }
  get serverRole(): ServerRole | null {
    return this.connection?.serverRole ?? null;
  }

  private config: Record<string, unknown> = {};
  private credentialSource: ServerCredentialSource | null = null;
  private pendingInvite: { invite: string; roomKey: string } | null = null;
  private _requestedRoomId = '';

  /**
   * The room the network was last asked to open, set as it is asked, before the session going is
   * closed or the new one has a peer id; empty once asked to wait outside any. A join still waiting
   * on another room tells by it that the seat has moved on, which the peer id says only later.
   */
  get requestedRoomId(): string {
    return this._requestedRoomId;
  }
  private _openRequests = 0;

  /**
   * How many times the network has been asked to open a room or to wait outside any, counted as it
   * is asked. A step put off for later tells by it whether the seat was sent somewhere meanwhile.
   */
  get openRequests(): number {
    return this._openRequests;
  }
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

  /**
   * Comes back into a room server's room when a page left for the back-forward cache is shown
   * again; without this, the restored page looked open while it sent and heard nothing. SkyWay is
   * left as it was.
   */
  private callbackPageShow: (e: PageTransitionEvent) => void = (e: PageTransitionEvent) => {
    if (e.persisted && this.transport === 'server') void this.connection?.rejoinAfterLeave?.();
  };

  private callbackBeforeUnload: (e: BeforeUnloadEvent) => void = (e: BeforeUnloadEvent) => {
    e.preventDefault();
  };

  private constructor() {}

  configure(config: Record<string, unknown>) {
    this.config = config;
  }

  letPageGo(): void {
    window.removeEventListener('beforeunload', this.callbackBeforeUnload);
  }

  setServerCredentials(source: ServerCredentialSource | null) {
    this.credentialSource = source;
    this.connection?.useCredentials?.(source);
  }

  setServerInvite(invite: string, roomKey: string) {
    this.pendingInvite = invite && roomKey ? { invite, roomKey } : null;
  }

  /** The invitation kept for the room it was given for, until a logged-in seat is let in with it. */
  get pendingServerInvite(): { invite: string; roomKey: string } | null {
    return this.pendingInvite;
  }

  comeBackFromIdle(): void {
    this.connection?.comeBackFromIdle?.();
  }

  requestInvite(role: ServerRole): Promise<InviteMessage> {
    if (!this.connection?.requestInvite) return Promise.reject(new Error('invitations come from a room server'));
    return this.connection.requestInvite(role);
  }

  open(userId: string, roomId: string, roomName: string, password: string, roomKey?: string): void {
    this._requestedRoomId = roomId;
    this._openRequests++;
    if (this.connectionClassPromise != null) {
      Logger.warn('[Network] 既に接続済みです');
      this.close();
    }
    const pending = this.pendingInvite;
    const invite = pending && pending.roomKey === roomKey ? pending.invite : '';
    this.openAsync(() => {
      if (invite) this.connection!.useInvite?.(invite);
      this.connection!.open(userId, roomId, roomName, password, roomKey);
    });
  }

  openStandby(userId?: string): void {
    this._requestedRoomId = '';
    this._openRequests++;
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
    window.addEventListener('pageshow', this.callbackPageShow);
    window.addEventListener('beforeunload', this.callbackBeforeUnload);
  }

  private close() {
    if (this.connection) this.connection.close();
    this.connection = null;
    this.connectionClassPromise = null;
    window.removeEventListener('pagehide', this.callbackPageHide);
    window.removeEventListener('pageshow', this.callbackPageShow);
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

  /**
   * One room found by its key, null when the room server has none. It rejects where rooms are not
   * found by key, as on SkyWay, and when the server cannot say.
   */
  findRoom(roomKey: string): Promise<IRoomInfo | null> {
    if (!this.connection?.findRoom) return Promise.reject(new Error('rooms are not found by key here'));
    return this.connection.findRoom(roomKey);
  }

  /** The room's pictures and sounds as this seat may reach them, while in a room server's room. */
  get assetAccess(): AssetAccess | null {
    return this.connection?.assetAccess ?? null;
  }

  /** Asks the room server for a fresh asset token, once the store has been turned down with the one held. */
  refreshAssetAccess(): Promise<AssetAccess | null> {
    return this.connection?.refreshAssetAccess?.() ?? Promise.resolve(null);
  }

  /**
   * Creates a room on the room server, which answers with the key to open it by. It rejects
   * without a connection, and with SkyWay, where a room needs no creating.
   */
  createRoom(name: string, password: string): Promise<CreateRoomResponse> {
    if (!this.connection?.createRoom) return Promise.reject(new Error('rooms are not created on this transport'));
    return this.connection.createRoom(name, password);
  }

  /**
   * Deletes a room on the room server, closing it for everybody in it. It rejects without a
   * connection, and with SkyWay, where a room is gone once everybody has left.
   */
  deleteRoom(roomKey: string): Promise<void> {
    if (!this.connection?.deleteRoom) return Promise.reject(new Error('rooms are not deleted on this transport'));
    return this.connection.deleteRoom(roomKey);
  }

  private initializeConnection(): Connection {
    const connection = new this.connectionClass();
    connection.configure(this.config);
    connection.useCredentials?.(this.credentialSource);

    connection.callback.onOpen = (peer) => {
      // A logged-in seat got into the invited room, and the invitation has done its work.
      if (
        connection.serverRole &&
        connection.serverRole !== 'guest' &&
        connection.roomKey === this.pendingInvite?.roomKey
      ) {
        this.pendingInvite = null;
      }
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
    connection.callback.onRoleChange = (role) => this.callback.onRoleChange?.(role);
    connection.callback.onIdle = (state) => this.callback.onIdle?.(state);

    if (this.queue.size > 0 && this.sendInterval === null) this.sendInterval = setZeroTimeout(this.sendCallback);

    return connection;
  }

  /** The connection code for the transport the config names, loaded on first use: SkyWay unless it says server. */
  private async dynamicImport(): Promise<ConnectionClass> {
    if (transportOf(this.config) === 'server') {
      return (await import('@axe/core/network/server/server-connection')).ServerConnection;
    }
    return (await import('@axe/core/network/skyway/skyway-connection')).SkyWayConnection;
  }
}
