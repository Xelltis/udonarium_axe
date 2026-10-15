import { Logger } from '@axe/core/logging/logger';
import {
  AssetAccess,
  Connection,
  ConnectionCallback,
  ServerCredentials,
  ServerCredentialSource,
} from '@axe/core/network/connection';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { IRoomInfo } from '@axe/core/network/room-info';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { decodeFrame, encodeFrame, encodeSendFrames } from '@axe/core/network/server/server-frames';
import {
  ACCOUNT_USER_ID_PREFIX,
  assetTokenRequest,
  authMessage,
  AuthorityEvent,
  ClientMessage,
  CLOSE_CODE,
  CreateRoomResponse,
  DataMessage,
  EventContext,
  helloMessage,
  InviteMessage,
  inviteRequest,
  isRetryableError,
  Member,
  PING,
  readServerMessage,
  ServerMessage,
  ServerRole,
  WelcomeMessage,
} from '@axe/core/network/server/server-protocol';
import { createRoom, deleteRoom, listRooms, roomInfoOf, roomSocketUrl } from '@axe/core/network/server/server-room-api';

/** How long a connection waits between asking whether the server is still there. */
export const PING_INTERVAL_MS = 25_000;
/** How long it waits for any answer to that before it takes the connection as lost. */
export const PONG_TIMEOUT_MS = 10_000;
/**
 * How long sends gather before they go out as one frame. It keeps a busy table, sixty frames a
 * second at most, well inside the server's limit of 2000 frames in ten seconds.
 */
export const SEND_GATHER_MS = 16;
/** How long an invite request waits for the server's answer. */
export const INVITE_TIMEOUT_MS = 10_000;
/**
 * How often a seat that logged in checks for a fresh access token to hand the server. The server
 * closes the seat a minute after its token runs out, and the login refreshes a token a minute
 * before it does, so a check every half minute hands the new one over in time.
 */
export const TOKEN_CHECK_MS = 30_000;
/** How long before the asset token runs out a fresh one is asked for, a few checks ahead of the end. */
export const ASSET_TOKEN_MARGIN_MS = 2 * 60_000;
/** How long a refresh of the asset token waits for the server before giving up. */
export const ASSET_TOKEN_WAIT_MS = 10_000;
/** How many requests to the server a seat keeps while it gets back into the room. */
export const MAX_HELD_EVENTS = 64;
/**
 * Requests to the server that would be lost while reconnecting, and that the catalogs traded on
 * getting back in do not mend: a roll and a role change asked for in the meantime.
 */
const HELD_EVENT_NAMES: ReadonlySet<string> = new Set([AuthorityEvent.ROLL_REQUEST, AuthorityEvent.ROLE_REQUEST]);
/** The refusal for a hello whose login is gone or belongs to somebody else. */
const UNAUTHORIZED = 'unauthorized';

const SOCKET_OPEN = 1;
const SOCKET_KEY = 'room-server';

interface Outbound {
  to: string | undefined;
  events: EventContext[];
}

interface InviteWaiter {
  role: ServerRole;
  resolve: (message: InviteMessage) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * A connection through a room server: one WebSocket to the room's Durable Object, which relays
 * between the members and keeps the table as the authority peer.
 *
 * The members are the peers. The authority is not among them: it is reported once as connected,
 * so that the catalogs are traded with it, and named by authorityPeerId. Nothing is echoed back;
 * Network hands a sender its own messages.
 *
 * A connection lost after getting in is tried again with the same peer id, after 1, 2, 4, 8 and
 * 15 seconds; the server lets the new one in and closes nothing, since the old one is gone. A
 * refusal ends the session with an error, except for a full room or too many messages once in the
 * room, which are tried again in the same way. Joining a full room is refused at once.
 *
 * Logged in, the seat is the account's: its user id replaces the one the session was opened with,
 * and every hello carries a fresh access token. A token the server turns down is refreshed and
 * tried once more. Not logged in, the seat is a guest's, whose user id may not look like an
 * account's.
 */
export class ServerConnection implements Connection {
  readonly callback: ConnectionCallback = new ConnectionCallback();
  bandwidthUsage: number = 0;

  /** This device's peer id, or the placeholder '???' until a session opens. */
  get peerId(): string {
    return this.me.peerId;
  }
  /** Ids of the other members in the room, sorted. */
  get peerIds(): string[] {
    return [...this.members.keys()].sort();
  }
  get peer(): IPeerContext {
    return this.me;
  }
  /** The other members in the room. */
  get peers(): IPeerContext[] {
    return [...this.members.values()];
  }
  get authorityPeerId(): string | undefined {
    return this.authority?.peerId;
  }
  get roomKey(): string | undefined {
    return this.room?.roomKey;
  }
  get serverRole(): ServerRole | undefined {
    return this.role ?? undefined;
  }

  private baseUrl = '';
  private me: PeerContext = PeerContext.parse('???');
  private authority: PeerContext | null = null;
  private readonly members: Map<string, PeerContext> = new Map();
  private room: { roomKey: string; password: string } | null = null;
  private role: ServerRole | null = null;
  private credentialSource: ServerCredentialSource | null = null;
  /**
   * Whether the seat was opened for the login's account, and so says hello with the login's token.
   * The login decides it, not whether the user id looks like an account's.
   */
  private accountSeat = false;
  private invite = '';
  /** The token for the room's pictures and sounds, and when it runs out. */
  private assetToken: { token: string; expiresAt: number } | null = null;
  /** Whether a fresh asset token has been asked for and has not come yet. */
  private assetTokenAsked = false;
  private assetTokenTimer: ReturnType<typeof setInterval> | null = null;
  /** Those waiting for the fresh asset token asked for, given the access once it comes. */
  private assetTokenWaiters: (() => void)[] = [];
  /**
   * How far the server's clock is ahead of this one, in milliseconds, from the welcome. The asset
   * token runs out by the server's clock, so a clock running behind would renew it too late.
   */
  private serverClockOffset = 0;
  /** The access token the last hello carried, which the server may turn down. */
  private helloToken: string | null = null;
  private retriedUnauthorized = false;
  private inviteWaiters: InviteWaiter[] = [];

  private socket: WebSocket | null = null;
  private welcomed = false;
  private everWelcomed = false;
  private stopped = false;
  private refusal: string | null = null;
  private readonly reconnectScheduler = new PeerReconnectScheduler();

  private outbound: Outbound[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> = Promise.resolve();
  private inbound: Promise<void> = Promise.resolve();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private tokenTimer: ReturnType<typeof setInterval> | null = null;
  /** Requests to the server sent while getting back into the room, to send once back in. */
  private held: Outbound[] = [];

  /** Takes the room server's address from the app config's backend url. */
  configure(config: Record<string, unknown>): void {
    const url = (config['backend'] as { url?: unknown } | undefined)?.url;
    this.baseUrl = typeof url === 'string' ? url : '';
  }

  /** Opens a session in no room. Nothing connects; the lobby lists the rooms over HTTP. */
  openStandby(userId?: string): void {
    this.stopped = false;
    void PeerContext.create(userId ?? PeerContext.generateUserId()).then((peer) => {
      if (this.stopped) return;
      this.me = peer;
      this.accountSeat = false;
      peer.isOpen = true;
      this.callback.onOpen?.(peer);
    });
  }

  /** Gives the connection the login to say hello with; without one every seat is a guest's. */
  useCredentials(source: ServerCredentialSource | null): void {
    this.credentialSource = source;
  }

  /** An invitation for the room opened next, carried by its hello until the server lets it in. */
  useInvite(invite: string): void {
    this.invite = invite;
  }

  /**
   * Opens a session in the room the key finds. The peer id carries the room but no password:
   * the server checks the password, which travels in the hello. Logged in, the seat takes the
   * account's user id in place of the one given.
   */
  open(userId: string, roomId: string, roomName: string, password: string, roomKey?: string): void {
    this.stopped = false;
    void this.openAs(userId, roomId, roomName, password, roomKey);
  }

  private async openAs(userId: string, roomId: string, roomName: string, password: string, roomKey?: string) {
    let credentials: ServerCredentials | null | undefined;
    try {
      credentials = await this.credentialSource?.credentials();
    } catch {
      if (!this.stopped) this.fail(SERVER_UNREACHABLE, 'the login could not be refreshed');
      return;
    }
    const peer = await PeerContext.createRoom(credentials?.userId ?? this.guestUserId(userId), roomId, roomName, '');
    if (this.stopped) return;
    peer.password = password;
    this.me = peer;
    this.accountSeat = credentials != null;
    if (!roomKey) {
      this.fail('room-not-found', 'no key to find the room by');
      return;
    }
    this.room = { roomKey, password };
    this.connectSocket();
  }

  /**
   * A guest's user id, never an account's, which a hello without a token may not claim: neither one
   * that looks like an account's, nor that of an account the page was logged in as.
   */
  private guestUserId(userId: string): string {
    const isAccount = userId.startsWith(ACCOUNT_USER_ID_PREFIX) || this.credentialSource?.isAccountUserId(userId);
    return isAccount ? PeerContext.generateUserId() : userId;
  }

  /** Leaves the room for good, without reporting anything. */
  close(): void {
    this.stopped = true;
    this.teardown();
    this.me.isOpen = false;
    this.members.clear();
    this.authority = null;
    this.rejectInviteWaiters('the connection closed');
  }

  /** Lets go of the server at once, for a page being hidden or unloaded. */
  leaveImmediately(): void {
    this.stopped = true;
    this.teardown();
  }

  /** Comes back after leaveImmediately, when the page stayed after all. */
  async rejoinAfterLeave(): Promise<void> {
    if (!this.room) return;
    this.stopped = false;
    this.connectSocket();
  }

  /** The server decides who is in the room; there is nobody to connect to by hand. */
  connect(_peer: IPeerContext): boolean {
    return false;
  }

  disconnect(_peer: IPeerContext): boolean {
    return false;
  }

  disconnectAll(): void {}

  /**
   * Queues events for one peer, or for everybody else when sendTo is omitted. They go out
   * together after SEND_GATHER_MS. Nothing is sent outside the room, as SkyWay sends nothing
   * with nobody connected; the catalogs traded on getting back in mend what was missed.
   */
  send(data: unknown, sendTo?: string): void {
    if (!Array.isArray(data) || data.length === 0) return;
    const events = data as EventContext[];
    if (!this.welcomed) {
      this.hold(events, sendTo);
      return;
    }
    const last = this.outbound.at(-1);
    if (last && last.to === sendTo) {
      last.events.push(...events);
    } else {
      this.outbound.push({ to: sendTo, events: [...events] });
    }
    if (this.flushTimer == null) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, SEND_GATHER_MS);
    }
  }

  /**
   * Keeps the requests to the server among events sent while getting back into the room, to send
   * once back in; the rest go, as SkyWay drops what it sends with nobody connected.
   */
  private hold(events: EventContext[], sendTo: string | undefined): void {
    if (!this.everWelcomed || this.stopped || sendTo !== this.authority?.peerId) return;
    const kept = events.filter((event) => HELD_EVENT_NAMES.has(event.eventName));
    const room = MAX_HELD_EVENTS - this.held.reduce((count, batch) => count + batch.events.length, 0);
    if (kept.length > 0 && room > 0) this.held.push({ to: sendTo, events: kept.slice(0, room) });
  }

  async listAllPeers(): Promise<string[]> {
    return this.peerIds;
  }

  /**
   * The rooms on the server, those the reader may delete marked when logged in. A login that cannot
   * be refreshed just now lists them unmarked. It rejects when the server cannot be reached or refuses.
   */
  async listAllRooms(): Promise<IRoomInfo[]> {
    const accessToken = await (this.credentialSource?.accessToken() ?? Promise.resolve(null)).catch(() => null);
    return (await listRooms(this.baseUrl, accessToken)).map(roomInfoOf);
  }

  /** Creates a room on the server as whoever is logged in, sending the password only when there is one. */
  async createRoom(name: string, password: string): Promise<CreateRoomResponse> {
    const accessToken = (await this.credentialSource?.accessToken()) ?? null;
    return createRoom(this.baseUrl, password.length > 0 ? { name, password } : { name }, accessToken);
  }

  /** Deletes a room on the server as whoever is logged in, which only a GM of the room may. */
  async deleteRoom(roomKey: string): Promise<void> {
    const accessToken = (await this.credentialSource?.accessToken()) ?? null;
    return deleteRoom(this.baseUrl, roomKey, accessToken);
  }

  /**
   * Asks the server for an invitation in a role. A GM gets one; anybody else gets a null
   * invitation. It rejects outside the room or when the server does not answer in time.
   */
  requestInvite(role: ServerRole): Promise<InviteMessage> {
    if (!this.welcomed) return Promise.reject(new Error('not in a room'));
    return new Promise<InviteMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.inviteWaiters = this.inviteWaiters.filter((waiter) => waiter.timer !== timer);
        reject(new Error('the room server did not answer the invite request'));
      }, INVITE_TIMEOUT_MS);
      this.inviteWaiters.push({ role, resolve, reject, timer });
      this.post(inviteRequest(role));
    });
  }

  private connectSocket(): void {
    if (!this.room || this.stopped) return;
    let url: string;
    try {
      url = roomSocketUrl(this.baseUrl, this.room.roomKey);
    } catch {
      this.fail(NO_BACKEND, 'no room server is configured');
      return;
    }
    const socket = new WebSocket(url);
    socket.binaryType = 'arraybuffer';
    this.socket = socket;
    this.welcomed = false;
    this.refusal = null;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      void this.sayHello(socket);
      this.startPing(socket);
    };
    socket.onmessage = (event: MessageEvent) => {
      if (socket !== this.socket) return;
      this.heardFrom();
      if (typeof event.data !== 'string') this.receive(new Uint8Array(event.data as ArrayBuffer));
    };
    socket.onclose = (event: CloseEvent) => {
      if (socket !== this.socket) return;
      // The reason repeats the error message's code, should the close overtake the message.
      if (this.refusal == null && event.code === CLOSE_CODE && event.reason) this.refusal = event.reason;
      this.socketClosed();
    };
    socket.onerror = () => {
      // a close always follows, and decides what comes next
    };
  }

  /**
   * Says hello with a fresh access token for the seat's account. A login that is gone, or that is
   * now somebody else's, cannot speak for the seat, so the session ends as unauthorized.
   */
  private async sayHello(socket: WebSocket): Promise<void> {
    const userId = this.me.userId;
    let accessToken = '';
    if (this.accountSeat) {
      let credentials;
      try {
        credentials = await this.credentialSource?.credentials();
      } catch {
        if (socket === this.socket) socket.close(4001, 'the login could not be refreshed');
        return;
      }
      if (socket !== this.socket) return;
      if (credentials?.userId !== userId) {
        this.fail(UNAUTHORIZED, 'the login for this seat is gone');
        return;
      }
      accessToken = credentials.accessToken;
    }
    this.helloToken = accessToken || null;
    this.post(
      helloMessage(this.me.peerId, userId, { password: this.room?.password, accessToken, invite: this.invite })
    );
  }

  private receive(bytes: Uint8Array): void {
    this.bandwidthUsage += bytes.byteLength;
    this.inbound = this.inbound.then(async () => {
      try {
        const message = readServerMessage(await decodeFrame(bytes));
        if (message) {
          this.handle(message);
        } else {
          Logger.warn('[ServerConnection] a frame of no known shape');
        }
      } catch (e) {
        Logger.warn('[ServerConnection] an unreadable frame', e);
      } finally {
        this.bandwidthUsage -= bytes.byteLength;
      }
    });
  }

  private handle(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.welcome(message);
        return;
      case 'join':
        this.addMember(message.member);
        return;
      case 'leave':
        this.removeMember(message.peerId);
        return;
      case 'data':
        this.deliver(message);
        return;
      case 'time':
        return;
      case 'invite':
        this.answerInvite(message);
        return;
      case 'asset-token':
        this.takeAssetToken(message.assetToken, message.expiresAt);
        this.takeRole(message.role);
        return;
      case 'error':
        this.refusal = message.code;
        return;
    }
  }

  private welcome(message: WelcomeMessage): void {
    this.welcomed = true;
    this.role = message.role;
    this.serverClockOffset = message.serverTime - Date.now();
    // Taken before anybody hears the seat is in, so that what they do then may reach the room's
    // pictures and sounds already.
    this.takeAssetToken(message.assetToken, message.assetTokenExpiresAt);
    this.startAssetTokenChecks();
    // A guest's invitation waits for a login; only an account's first visit takes it.
    if (message.role !== 'guest') this.invite = '';
    this.retriedUnauthorized = false;
    this.reconnectScheduler.reset(SOCKET_KEY);
    const authority = PeerContext.parse(message.authorityPeerId);
    authority.isOpen = true;
    this.authority = authority;
    this.me.isOpen = true;
    if (this.everWelcomed) {
      this.callback.onReconnect?.(this.me, 'recovered');
    } else {
      this.everWelcomed = true;
      this.callback.onOpen?.(this.me);
    }
    this.callback.onConnect?.(authority);
    const present = new Set(message.members.map((member) => member.peerId));
    for (const peerId of [...this.members.keys()]) {
      if (!present.has(peerId)) this.removeMember(peerId);
    }
    for (const member of message.members) this.addMember(member);
    const held = this.held;
    this.held = [];
    for (const batch of held) this.send(batch.events, batch.to);
    if (this.accountSeat) this.startTokenChecks();
  }

  /** Takes on a role the server says the seat has now, and tells of it when it changed. */
  private takeRole(role: ServerRole | undefined): void {
    if (!role || role === this.role || !this.welcomed) return;
    this.role = role;
    this.callback.onRoleChange?.(role);
  }

  /** The room's pictures and sounds as this seat may reach them: the room and the token, while in it. */
  get assetAccess(): AssetAccess | null {
    if (!this.welcomed || !this.room || !this.assetToken) return null;
    return { roomKey: this.room.roomKey, token: this.assetToken.token };
  }

  private takeAssetToken(token: string, expiresAt: number): void {
    this.assetToken = { token, expiresAt };
    this.assetTokenAsked = false;
    const waiters = this.assetTokenWaiters;
    this.assetTokenWaiters = [];
    for (const waiter of waiters) waiter();
  }

  /**
   * Asks for a fresh asset token now, for one the asset store turned down, and gives the access once
   * it comes. Outside a room, without an answer after a while, or on leaving the room, it gives null.
   */
  refreshAssetAccess(): Promise<AssetAccess | null> {
    if (!this.welcomed) return Promise.resolve(null);
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ASSET_TOKEN_WAIT_MS);
      this.assetTokenWaiters.push(() => {
        clearTimeout(timer);
        resolve(this.assetAccess);
      });
      if (!this.assetTokenAsked) {
        this.assetTokenAsked = true;
        this.post(assetTokenRequest());
      }
    });
  }

  /** Asks the server for a fresh asset token a while before the one held runs out, once each time. */
  private startAssetTokenChecks(): void {
    this.stopAssetTokenChecks();
    this.assetTokenTimer = setInterval(() => this.renewAssetToken(), TOKEN_CHECK_MS);
  }

  private renewAssetToken(): void {
    if (!this.welcomed || !this.assetToken || this.assetTokenAsked) return;
    if (this.assetToken.expiresAt - (Date.now() + this.serverClockOffset) > ASSET_TOKEN_MARGIN_MS) return;
    this.assetTokenAsked = true;
    this.post(assetTokenRequest());
  }

  private stopAssetTokenChecks(): void {
    if (this.assetTokenTimer != null) clearInterval(this.assetTokenTimer);
    this.assetTokenTimer = null;
  }

  /**
   * Hands the server each fresh access token while in the room, so that the seat stays; a seat whose
   * token runs out without a new one is closed by the server.
   */
  private startTokenChecks(): void {
    this.stopTokenChecks();
    this.tokenTimer = setInterval(() => void this.renewToken(), TOKEN_CHECK_MS);
  }

  private async renewToken(): Promise<void> {
    const userId = this.me.userId;
    let credentials;
    try {
      credentials = await this.credentialSource?.credentials();
    } catch {
      return;
    }
    if (!this.welcomed || credentials?.userId !== userId) return;
    if (credentials.accessToken === this.helloToken) return;
    this.helloToken = credentials.accessToken;
    this.post(authMessage(credentials.accessToken));
  }

  private stopTokenChecks(): void {
    if (this.tokenTimer != null) clearInterval(this.tokenTimer);
    this.tokenTimer = null;
  }

  private addMember(member: Member): void {
    if (this.members.has(member.peerId) || member.peerId === this.me.peerId) return;
    const peer = PeerContext.parse(member.peerId);
    peer.userId = member.userId;
    peer.isOpen = true;
    this.members.set(member.peerId, peer);
    this.callback.onConnect?.(peer);
  }

  private removeMember(peerId: string): void {
    const peer = this.members.get(peerId);
    if (!peer) return;
    this.members.delete(peerId);
    peer.isOpen = false;
    this.callback.onDisconnect?.(peer);
  }

  /**
   * Hands on a batch. The server sets each event's sender, and slips its own events into other
   * batches, so an event keeps its own `sendFrom`; only one without it takes the batch's.
   */
  private deliver(message: DataMessage): void {
    const from =
      this.members.get(message.from) ??
      (message.from === this.authority?.peerId ? this.authority : PeerContext.parse(message.from));
    for (const event of message.events) {
      if (typeof event.sendFrom !== 'string' || event.sendFrom.length === 0) event.sendFrom = message.from;
    }
    this.callback.onData?.(from, message.events);
  }

  private answerInvite(message: InviteMessage): void {
    const waiter = this.inviteWaiters.find((candidate) => candidate.role === message.role);
    if (!waiter) return;
    this.inviteWaiters = this.inviteWaiters.filter((candidate) => candidate !== waiter);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  private rejectInviteWaiters(reason: string): void {
    for (const waiter of this.inviteWaiters) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
    this.inviteWaiters = [];
  }

  private socketClosed(): void {
    const wasWelcomed = this.welcomed;
    this.socket = null;
    this.welcomed = false;
    this.stopPing();
    this.stopTokenChecks();
    this.stopAssetTokenChecks();
    this.dropQueued();
    if (wasWelcomed && this.authority) {
      this.authority.isOpen = false;
      this.callback.onDisconnect?.(this.authority);
    }
    for (const peerId of [...this.members.keys()]) this.removeMember(peerId);
    if (this.stopped) return;

    const refusal = this.refusal;
    this.refusal = null;
    if (refusal === UNAUTHORIZED) {
      void this.retryUnauthorized();
      return;
    }
    if (refusal != null && (!isRetryableError(refusal) || !this.everWelcomed)) {
      this.fail(refusal, `the room server refused: ${refusal}`);
      return;
    }
    if (refusal == null && !this.everWelcomed) {
      this.fail(SERVER_UNREACHABLE, 'the room server could not be reached');
      return;
    }
    if (this.reconnectScheduler.schedule(SOCKET_KEY, () => this.connectSocket()) == null) {
      this.fail(SERVER_UNREACHABLE, 'the room server stayed out of reach');
      return;
    }
    this.callback.onReconnect?.(this.me, 'retrying');
  }

  /**
   * Tries once more with a refreshed access token after the server turned one down, as it does
   * a token that ran out. A second refusal, or a login that is gone, ends the session.
   */
  private async retryUnauthorized(): Promise<void> {
    const rejected = this.helloToken;
    if (this.retriedUnauthorized || !rejected || !this.credentialSource) {
      this.fail(UNAUTHORIZED, 'the room server refused the login');
      return;
    }
    this.retriedUnauthorized = true;
    let replaced: string | null;
    try {
      replaced = await this.credentialSource.replaceRejected(rejected);
    } catch {
      replaced = null;
    }
    if (this.stopped) return;
    if (!replaced) {
      this.fail(UNAUTHORIZED, 'the login could not be refreshed');
      return;
    }
    this.connectSocket();
  }

  /** Ends the session and says why. A session that was in the room is reported closed first. */
  private fail(code: string, message: string): void {
    const wasOpen = this.me.isOpen;
    this.stopped = true;
    this.teardown();
    this.me.isOpen = false;
    if (wasOpen) this.callback.onClose?.(this.me);
    this.rejectInviteWaiters(message);
    this.callback.onError?.(this.me, code, message, null);
  }

  private teardown(): void {
    this.reconnectScheduler.cancelAll();
    this.stopPing();
    this.stopTokenChecks();
    this.stopAssetTokenChecks();
    this.held = [];
    this.dropQueued();
    const socket = this.socket;
    this.socket = null;
    this.welcomed = false;
    // Out of the room, there is no fresh token to wait for.
    const waiters = this.assetTokenWaiters;
    this.assetTokenWaiters = [];
    for (const waiter of waiters) waiter();
    if (socket && socket.readyState <= SOCKET_OPEN) socket.close(1000);
  }

  private dropQueued(): void {
    if (this.flushTimer != null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.outbound = [];
  }

  private flush(): void {
    const batches = this.outbound;
    this.outbound = [];
    const socket = this.socket;
    this.sending = this.sending
      .then(async () => {
        for (const batch of batches) {
          for (const frame of await encodeSendFrames(batch.events, batch.to)) {
            if (socket == null || socket !== this.socket || socket.readyState !== SOCKET_OPEN) return;
            socket.send(frame);
          }
        }
      })
      .catch((e) => Logger.warn('[ServerConnection] a send failed', e));
  }

  /** Sends one message of the connection's own, such as the hello, in order with the events. */
  private post(message: ClientMessage): void {
    const socket = this.socket;
    this.sending = this.sending
      .then(async () => {
        const frame = await encodeFrame(message);
        if (socket != null && socket === this.socket && socket.readyState === SOCKET_OPEN) socket.send(frame);
      })
      .catch((e) => Logger.warn('[ServerConnection] a send failed', e));
  }

  private startPing(socket: WebSocket): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (socket !== this.socket || socket.readyState !== SOCKET_OPEN) return;
      socket.send(PING);
      if (this.pongTimer == null) {
        this.pongTimer = setTimeout(() => {
          this.pongTimer = null;
          if (socket !== this.socket) return;
          // A dead link may take a minute to report the close; take it as lost now.
          socket.close(4001, 'no answer to ping');
          if (socket === this.socket) this.socketClosed();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  /** Anything from the server shows it is there, a pong or otherwise. */
  private heardFrom(): void {
    if (this.pongTimer != null) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  private stopPing(): void {
    if (this.pingTimer != null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.heardFrom();
  }
}
