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
import { IdleWatch } from '@axe/core/network/server/idle-watch';
import { LinkHeartbeat, SOCKET_OPEN } from '@axe/core/network/server/link-heartbeat';
import {
  CHANGE,
  COMING_BACK,
  DELETION,
  identifierOf,
  keptWhileAway,
  latestChanges,
  MAX_HELD_BROADCASTS,
  MAX_HELD_EVENTS,
  Outbound,
} from '@axe/core/network/server/outbound-events';
import { pageActivity } from '@axe/core/network/server/page-activity';
import { SendPacer } from '@axe/core/network/server/send-pacer';
import { NO_BACKEND, SERVER_UNREACHABLE } from '@axe/core/network/server/server-errors';
import { decodeFrame, encodeFrame, encodeSendFrames } from '@axe/core/network/server/server-frames';
import {
  ACCOUNT_USER_ID_PREFIX,
  activeMessage,
  assetTokenRequest,
  AssetUploadPolicy,
  authMessage,
  AuthorityEvent,
  ClientMessage,
  CLOSE_CODE,
  COME_BACK_CODE,
  COME_BACK_REASONS,
  CreateRoomResponse,
  DataMessage,
  EventContext,
  helloMessage,
  InviteMessage,
  inviteRequest,
  isRetryableError,
  Member,
  readAssetUploadPolicy,
  readServerMessage,
  ServerMessage,
  ServerRole,
  WelcomeMessage,
} from '@axe/core/network/server/server-protocol';
import {
  createRoom,
  deleteRoom,
  fetchOperatorContact,
  findRoom,
  isBanned,
  listRooms,
  roomInfoOf,
  roomSocketUrl,
  ServerRoomApiError,
} from '@axe/core/network/server/server-room-api';
import { AccessTokenRenewal, AssetTokenRenewal } from '@axe/core/network/server/token-renewal';
import { WrittenDeletions } from '@axe/core/network/server/written-deletions';

/**
 * How long a member missing from the welcome on getting back in is kept for, before it is taken to
 * have left: a room server spread over instances that changed hands lets everybody back in one by
 * one, and the others coming back meanwhile is no leaving and joining. The same as its seats are
 * kept for a socket it asked to come back.
 */
export const MISSING_MEMBER_GRACE_MS = 15_000;
/**
 * How long sends gather before they go out as one frame. It keeps a busy table, sixty frames a
 * second at most, well inside the server's limit of 2000 frames in ten seconds.
 */
export const SEND_GATHER_MS = 16;
/** How many events go out in one batch at most, so that the budget fills in steps. */
const SEND_CHUNK_EVENTS = 1_500;
/** How long an invite request waits for the server's answer. */
export const INVITE_TIMEOUT_MS = 10_000;
/** The refusal for a hello whose login is gone or belongs to somebody else. */
const UNAUTHORIZED = 'unauthorized';
/** The refusal for a seat whose page was left alone, which comes back only when its reader asks. */
const IDLE = 'idle';
/** The refusal for a seat whose sender or account the room server's operator banned. */
const BANNED = 'banned';

const SOCKET_KEY = 'room-server';

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
  get authorityOpen(): boolean {
    return this.authority?.isOpen ?? false;
  }
  get serverClockOffset(): number | undefined {
    return this.everWelcomed ? this.clockOffset : undefined;
  }
  get roomKey(): string | undefined {
    return this.room?.roomKey;
  }
  get serverRole(): ServerRole | undefined {
    return this.role ?? undefined;
  }
  get keptRole(): ServerRole | undefined {
    return this.keptServerRole ?? undefined;
  }

  private baseUrl = '';
  private me: PeerContext = PeerContext.parse('???');
  private authority: PeerContext | null = null;
  private readonly members: Map<string, PeerContext> = new Map();
  private room: { roomKey: string; password: string } | null = null;
  private role: ServerRole | null = null;
  /** The role the room keeps for this seat logged in, as the server last told it. */
  private keptServerRole: ServerRole | null = null;
  private credentialSource: ServerCredentialSource | null = null;
  /**
   * Whether the seat was opened for the login's account, and so says hello with the login's token.
   * The login decides it, not whether the user id looks like an account's.
   */
  private accountSeat = false;
  private invite = '';
  /** How the room server takes pictures and sounds, from the welcome; none for a single PUT. */
  private assetUpload: AssetUploadPolicy | null = null;
  /**
   * How far the server's clock is ahead of this one, in milliseconds, from the welcome. The asset
   * token runs out by the server's clock, so a clock running behind would renew it too late.
   */
  private clockOffset = 0;
  private retriedUnauthorized = false;
  private inviteWaiters: InviteWaiter[] = [];

  private socket: WebSocket | null = null;
  private welcomed = false;
  private everWelcomed = false;
  /** Whether the server closed the link asking the seat to come back on another. */
  private askedBack = false;
  /**
   * Whether the seat is coming back on a new link the server asked for, with nobody told it went.
   * Should that link fail, they are told then, and the seat gets back in as after any dropped link.
   */
  private comingBack = false;
  private stopped = false;
  private refusal: string | null = null;
  private readonly reconnectScheduler = new PeerReconnectScheduler();
  /** The last use the hello on its way says, which the server takes up once it lets the seat in. */
  private helloInputAt = 0;
  /** Let out of the room for the page left alone; the seat comes back only when its reader asks. */
  private leftAlone = false;

  private outbound: Outbound[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private sending: Promise<void> = Promise.resolve();
  /** The writing of the connection's own messages, such as the hello or an invitation asked for, which is not paced. */
  private posting: Promise<void> = Promise.resolve();
  private inbound: Promise<void> = Promise.resolve();
  /** The members missing from the welcome on getting back in, each until taken to have left. */
  private readonly missing = new Map<string, ReturnType<typeof setTimeout>>();
  /** Requests to the server sent while getting back into the room, to send once back in. */
  private held: Outbound[] = [];
  /** Batches handed on to be written to the link and not written yet, oldest first. */
  private unwritten: Outbound[] = [];
  private readonly pacer = new SendPacer();
  private readonly deletionsWritten = new WrittenDeletions();
  private readonly heartbeat = new LinkHeartbeat({
    isCurrent: (socket) => socket === this.socket,
    welcomed: () => this.welcomed,
    lost: (socket, code, reason) => {
      socket.close(code, reason);
      if (socket === this.socket) this.socketClosed();
    },
  });
  private readonly idleWatch = new IdleWatch({
    inRoom: () => this.welcomed,
    reportActive: () => this.post(activeMessage()),
    tell: (state) => this.callback.onIdle?.(state),
  });
  private readonly accessTokenRenewal = new AccessTokenRenewal({
    userId: () => this.me.userId,
    inRoom: () => this.welcomed,
    credentials: () => this.credentialSource?.credentials(),
    hand: (accessToken) => this.post(authMessage(accessToken)),
  });
  private readonly assetTokenRenewal = new AssetTokenRenewal({
    inRoom: () => this.welcomed,
    clockOffset: () => this.clockOffset,
    ask: () => this.post(assetTokenRequest()),
  });

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
    pageActivity.watch();
    void this.openAs(userId, roomId, roomName, password, roomKey);
  }

  private async openAs(userId: string, roomId: string, roomName: string, password: string, roomKey?: string) {
    let credentials: ServerCredentials | null | undefined;
    try {
      credentials = await this.credentialSource?.credentials();
    } catch (reason) {
      if (!this.stopped) this.fail(isBanned(reason) ? BANNED : SERVER_UNREACHABLE, 'the login could not be refreshed');
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
    const kept = [...this.held, ...this.keptBatchesOf([...this.unwritten, ...this.outbound])];
    if (this.authority) this.authority.isOpen = false;
    this.teardown();
    // A page left for the cache may be shown again, and then sends what it would have held.
    this.held = kept;
  }

  /** Comes back after leaveImmediately, when the page stayed after all, saying the link went meanwhile. */
  async rejoinAfterLeave(): Promise<void> {
    if (!this.room) return;
    this.stopped = false;
    if (this.authority && this.everWelcomed) this.callback.onDisconnect?.(this.authority);
    this.connectSocket();
  }

  /**
   * Whether sends are on their way out to the link, as a big load or deletion is for seconds while
   * held back to keep inside the server's limits, or held to go once back in; unlike what is only
   * gathering to go out in a moment.
   */
  get sendsPending(): boolean {
    return this.unwritten.length > 0 || this.held.length > 0;
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
   * Keeps the requests to the server, and the changes, deletions and words on what comes back sent
   * to everybody, among events sent while getting back into the room, to send once back in; the rest
   * go, as SkyWay drops what it sends with nobody connected. Only deletions count toward the limit:
   * a word that something comes back is kept past it, as without it what came back would be deleted
   * again, and the changes kept are only the last of each object between deletions.
   */
  private hold(events: EventContext[], sendTo: string | undefined): void {
    if (!this.everWelcomed || this.stopped) return;
    const limit = sendTo === undefined ? MAX_HELD_BROADCASTS : MAX_HELD_EVENTS;
    const counts = (event: EventContext) => event.eventName !== COMING_BACK && event.eventName !== CHANGE;
    const held = this.held.filter((batch) => batch.to === sendTo);
    let room = limit - held.reduce((count, batch) => count + batch.events.filter(counts).length, 0);
    const kept = this.keptOf(events, sendTo).filter((event) => {
      if (!counts(event)) return true;
      room--;
      return room >= 0;
    });
    if (kept.length > 0) this.held = latestChanges([...this.held, { to: sendTo, events: kept }]);
  }

  /** The batches with only what is kept while getting back into the room, those left with nothing dropped. */
  private keptBatchesOf(batches: Outbound[]): Outbound[] {
    return batches.flatMap((batch) => {
      const events = this.keptOf(batch.events, batch.to);
      return events.length > 0 ? [{ to: batch.to, events }] : [];
    });
  }

  /** What among events for one peer, or for everybody, is kept while getting back into the room. */
  private keptOf(events: EventContext[], sendTo: string | undefined): EventContext[] {
    return keptWhileAway(events, sendTo, this.authority?.peerId);
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

  /** One room on the server found by its key, null when there is none; it rejects when the server cannot say. */
  async findRoom(roomKey: string): Promise<IRoomInfo | null> {
    const accessToken = await (this.credentialSource?.accessToken() ?? Promise.resolve(null)).catch(() => null);
    const room = await findRoom(this.baseUrl, roomKey, accessToken);
    return room && roomInfoOf(room);
  }

  /** Creates a room on the server as whoever is logged in, sending the password only when there is one. */
  createRoom(name: string, password: string): Promise<CreateRoomResponse> {
    return this.asLoggedIn((accessToken) =>
      createRoom(this.baseUrl, password.length > 0 ? { name, password } : { name }, accessToken)
    );
  }

  /** Deletes a room on the server as whoever is logged in, which only a GM of the room may. */
  deleteRoom(roomKey: string): Promise<void> {
    return this.asLoggedIn((accessToken) => deleteRoom(this.baseUrl, roomKey, accessToken));
  }

  /** The contact the operator gives those the server turned away, or null where none is given. */
  operatorContact(): Promise<string | null> {
    return fetchOperatorContact(this.baseUrl);
  }

  /**
   * Makes a request as whoever is logged in, and once more with a fresh access token should the
   * server turn the one held down while it still looked good here, as after its signing key changed.
   */
  private async asLoggedIn<T>(request: (accessToken: string | null) => Promise<T>): Promise<T> {
    const accessToken = (await this.credentialSource?.accessToken()) ?? null;
    try {
      return await request(accessToken);
    } catch (error) {
      if (!(error instanceof ServerRoomApiError) || error.status !== 401 || !accessToken) throw error;
      const fresh = await this.credentialSource?.replaceRejected(accessToken);
      if (!fresh || fresh === accessToken) throw error;
      return request(fresh);
    }
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
      this.heartbeat.start(socket);
    };
    socket.onmessage = (event: MessageEvent) => {
      if (socket !== this.socket) return;
      this.heartbeat.heard();
      if (typeof event.data !== 'string') this.receive(new Uint8Array(event.data as ArrayBuffer));
    };
    socket.onclose = (event: CloseEvent) => {
      if (socket !== this.socket) return;
      // The reason repeats the error message's code, should the close overtake the message.
      if (this.refusal == null && event.code === CLOSE_CODE && event.reason) this.refusal = event.reason;
      this.askedBack = event.code === COME_BACK_CODE && COME_BACK_REASONS.includes(event.reason);
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
      } catch (reason) {
        if (socket !== this.socket) return;
        if (isBanned(reason)) this.fail(BANNED, 'the login could not be refreshed for a ban');
        else socket.close(4001, 'the login could not be refreshed');
        return;
      }
      if (socket !== this.socket) return;
      if (credentials?.userId !== userId) {
        this.fail(UNAUTHORIZED, 'the login for this seat is gone');
        return;
      }
      accessToken = credentials.accessToken;
    }
    this.accessTokenRenewal.carried = accessToken || null;
    this.helloInputAt = pageActivity.lastInputAt;
    this.post(
      helloMessage(this.me.peerId, userId, {
        password: this.room?.password,
        accessToken,
        invite: this.invite,
        idleMs: Date.now() - this.helloInputAt,
      })
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
        this.assetTokenRenewal.take(message.assetToken, message.expiresAt);
        this.takeRole(message.role, message.keptRole);
        return;
      case 'error':
        this.refusal = message.code;
        return;
    }
  }

  private welcome(message: WelcomeMessage): void {
    this.welcomed = true;
    const cameBack = this.comingBack;
    this.comingBack = false;
    // A role changed while the link was down is told as any change is, once the seat is back.
    const roleBefore = this.everWelcomed ? this.role : message.role;
    this.role = message.role;
    this.keptServerRole = message.keptRole ?? null;
    this.clockOffset = message.serverTime - Date.now();
    this.assetUpload = readAssetUploadPolicy(message.assetUpload);
    // Taken before anybody hears the seat is in, so that what they do then may reach the room's
    // pictures and sounds already.
    this.assetTokenRenewal.take(message.assetToken, message.assetTokenExpiresAt);
    this.assetTokenRenewal.start();
    // A guest's invitation waits for a login; only an account's first visit takes it. A seat
    // watching is welcomed as a guest, but the role the room keeps for it tells it is an account.
    if (message.role !== 'guest' || message.keptRole) this.invite = '';
    this.retriedUnauthorized = false;
    this.reconnectScheduler.reset(SOCKET_KEY);
    this.idleWatch.start(this.helloInputAt);
    const authority = PeerContext.parse(message.authorityPeerId);
    authority.isOpen = true;
    this.authority = authority;
    this.me.isOpen = true;
    if (this.everWelcomed) {
      this.callback.onReconnect?.(this.me, cameBack ? 'resumed' : 'recovered');
    } else {
      this.everWelcomed = true;
      this.callback.onOpen?.(this.me);
    }
    this.callback.onConnect?.(authority);
    if (roleBefore !== message.role) this.callback.onRoleChange?.(message.role);
    const present = new Set(message.members.map((member) => member.peerId));
    for (const peerId of [...this.members.keys()]) {
      if (present.has(peerId) || this.missing.has(peerId)) continue;
      this.missing.set(
        peerId,
        setTimeout(() => this.removeMember(peerId), MISSING_MEMBER_GRACE_MS)
      );
    }
    for (const member of message.members) this.addMember(member);
    const held = latestChanges(this.held);
    this.held = [];
    for (const batch of held) this.send(batch.events, batch.to);
    if (this.accountSeat) this.accessTokenRenewal.start();
  }

  /**
   * Takes on a role the server says the seat has now, and the role the room keeps for it where the
   * server says, and tells of it when either changed: a GM making a seat that watches a guest leaves
   * its role as it was, but takes away the one it would come back to.
   */
  private takeRole(role: ServerRole | undefined, keptRole?: ServerRole): void {
    if (!role || !this.welcomed) return;
    const kept = keptRole ?? this.keptServerRole;
    if (role === this.role && kept === this.keptServerRole) return;
    this.role = role;
    this.keptServerRole = kept;
    this.callback.onRoleChange?.(role);
  }

  /** The room's pictures and sounds as this seat may reach them: the room and the token, while in it. */
  get assetAccess(): AssetAccess | null {
    const token = this.assetTokenRenewal.token;
    if (!this.welcomed || !this.room || !token) return null;
    const access: AssetAccess = { roomKey: this.room.roomKey, token };
    if (this.assetUpload) access.upload = this.assetUpload;
    access.clockOffset = this.clockOffset;
    return access;
  }

  /**
   * Asks for a fresh asset token now, for one the asset store turned down, and gives the access once
   * it comes. Outside a room, without an answer after a while, or on leaving the room, it gives null.
   */
  refreshAssetAccess(): Promise<AssetAccess | null> {
    if (!this.welcomed) return Promise.resolve(null);
    return this.assetTokenRenewal.whenFresh(() => this.assetAccess);
  }

  private addMember(member: Member): void {
    this.stopMissing(member.peerId);
    if (this.members.has(member.peerId) || member.peerId === this.me.peerId) return;
    const peer = PeerContext.parse(member.peerId);
    peer.userId = member.userId;
    peer.isOpen = true;
    this.members.set(member.peerId, peer);
    this.callback.onConnect?.(peer);
  }

  private stopMissing(peerId: string): void {
    clearTimeout(this.missing.get(peerId));
    this.missing.delete(peerId);
  }

  private removeMember(peerId: string): void {
    this.stopMissing(peerId);
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
    this.keepWhatTheServerHandsBack(message.events);
    this.callback.onData?.(from, this.withoutWhatIsBeingDeleted(message.events));
  }

  /**
   * Leaves out what the server hands back of something whose deletion is yet to go out from here,
   * as one turned down for a change made before it: taken back now, it would stay on this seat
   * alone once the deletion goes through, which the server tells back only when it got the
   * deletion before handing the object back. What the server says once it has the deletion is
   * taken as usual.
   */
  private withoutWhatIsBeingDeleted(events: EventContext[]): EventContext[] {
    const authority = this.authority?.peerId;
    const handedBack = (event: EventContext) =>
      event.eventName === AuthorityEvent.AUTHORITATIVE && event.sendFrom === authority;
    if (!events.some(handedBack)) return events;
    const deleting = new Set<string>();
    for (const batch of [...this.held, ...this.unwritten, ...this.outbound]) {
      for (const event of batch.events) if (event.eventName === DELETION) deleting.add(identifierOf(event) ?? '');
    }
    return events.filter((event) => !handedBack(event) || !deleting.has(identifierOf(event) ?? ''));
  }

  /**
   * Drops the deletions yet to go out of what the server hands back on turning down a deletion this
   * link carried, as a tab a player may not delete and its lines, which come back with it: sent
   * after the server's while for keeping them is up, as after getting back into the room, they would
   * delete those lines for everyone. Only what was deleted here, and what comes back under it, is
   * taken so. What else comes back with it, handed back for a change turned down, keeps the
   * deletions behind it, the server not having turned those down, or only the object would stay,
   * emptied.
   */
  private keepWhatTheServerHandsBack(events: EventContext[]): void {
    const kept = this.deletionsWritten.takenBack(events, this.authority?.peerId);
    if (kept.size === 0) return;
    const unless = (event: EventContext) => event.eventName !== DELETION || !kept.has(identifierOf(event) ?? '');
    for (const batch of [...this.held, ...this.unwritten, ...this.outbound]) {
      if (batch.events.some((event) => !unless(event))) batch.events = batch.events.filter(unless);
    }
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
    const askedBack = this.askedBack;
    this.askedBack = false;
    this.socket = null;
    this.welcomed = false;
    this.heartbeat.stop();
    this.accessTokenRenewal.stop();
    this.assetTokenRenewal.stop();
    this.idleWatch.stop();
    // What was still gathering to go out goes with the link, but for the requests kept for later,
    // those already on their way out ahead of the rest.
    this.keepRequests(this.unwritten);
    this.unwritten = [];
    this.stopPacing();
    this.keepRequests(this.outbound);
    this.dropQueued();
    // The server asked the seat back on another link. It comes straight back, and nobody is told it
    // went: the welcome sets the members right.
    if (askedBack && !this.stopped && this.refusal == null) {
      if (wasWelcomed) {
        this.comingBack = true;
        this.connectSocket();
        return;
      }
      // Asked back before its first welcome, as while the room changes hands, a seat coming in tries
      // again after the usual wait. One that was coming back unseen is told of the drop below, as
      // after any link that failed.
      if (!this.everWelcomed && this.reconnectScheduler.schedule(SOCKET_KEY, () => this.connectSocket()) != null) {
        return;
      }
    }
    const wasComingBack = this.comingBack;
    this.comingBack = false;
    if ((wasWelcomed || wasComingBack) && this.authority) {
      this.authority.isOpen = false;
      this.callback.onDisconnect?.(this.authority);
    }
    for (const peerId of [...this.members.keys()]) this.removeMember(peerId);
    if (this.stopped) return;

    const refusal = this.refusal;
    this.refusal = null;
    if (refusal === IDLE) {
      this.leaveForIdle();
      return;
    }
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
    const rejected = this.accessTokenRenewal.carried;
    if (this.retriedUnauthorized || !rejected || !this.credentialSource) {
      this.fail(UNAUTHORIZED, 'the room server refused the login');
      return;
    }
    this.retriedUnauthorized = true;
    let replaced: string | null;
    try {
      replaced = await this.credentialSource.replaceRejected(rejected);
    } catch (reason) {
      if (this.stopped) return;
      if (isBanned(reason)) {
        this.fail(BANNED, 'the login could not be refreshed for a ban');
        return;
      }
      // The login could not be refreshed just now, with the server out of reach: that says nothing
      // of the login, so the seat gets back in as after a dropped link, which asks again.
      this.retriedUnauthorized = false;
      if (!this.everWelcomed) {
        this.fail(SERVER_UNREACHABLE, 'the login could not be refreshed');
      } else if (this.reconnectScheduler.schedule(SOCKET_KEY, () => this.connectSocket()) == null) {
        this.fail(SERVER_UNREACHABLE, 'the room server stayed out of reach');
      } else {
        this.callback.onReconnect?.(this.me, 'retrying');
      }
      return;
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
    this.idleWatch.end();
    this.leftAlone = false;
    for (const peerId of [...this.missing.keys()]) this.stopMissing(peerId);
    this.askedBack = false;
    this.comingBack = false;
    this.heartbeat.stop();
    this.accessTokenRenewal.stop();
    this.assetTokenRenewal.stop();
    this.held = [];
    this.unwritten = [];
    this.stopPacing();
    this.dropQueued();
    const socket = this.socket;
    this.socket = null;
    this.welcomed = false;
    // Out of the room, there is no fresh token to wait for.
    this.assetTokenRenewal.release();
    if (socket && socket.readyState <= SOCKET_OPEN) socket.close(1000);
  }

  /**
   * Holds for the next link the requests to the server, and the deletions and words on what comes
   * back, among batches sent while in the room that never went out, all of them whatever the limits
   * on what is sent while getting back in; the rest are left to the catalogs traded on getting back in.
   */
  private keepRequests(batches: Outbound[]): void {
    if (!this.everWelcomed || this.stopped) return;
    this.held.push(...this.keptBatchesOf(batches));
  }

  private dropQueued(): void {
    if (this.flushTimer != null) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.outbound = [];
  }

  private flush(): void {
    const batches = this.outbound.flatMap((batch) =>
      Array.from({ length: Math.ceil(batch.events.length / SEND_CHUNK_EVENTS) }, (_, index) => ({
        to: batch.to,
        events: batch.events.slice(index * SEND_CHUNK_EVENTS, (index + 1) * SEND_CHUNK_EVENTS),
      }))
    );
    this.outbound = [];
    this.unwritten.push(...batches);
    const socket = this.socket;
    this.sending = this.sending
      .then(() => this.write(socket, batches))
      .catch((e) => Logger.warn('[ServerConnection] a send failed', e));
  }

  /**
   * Writes batches to the link in order, each once the window has room. A link that goes, or is
   * going, keeps what was not written yet for socketClosed, which holds the requests among them
   * ahead of what gathered behind them.
   */
  private async write(socket: WebSocket | null, batches: Outbound[]): Promise<void> {
    for (const batch of batches) {
      if (!this.unwritten.includes(batch)) return;
      const encoded = batch.events;
      let frames = await encodeSendFrames(encoded, batch.to);
      await this.pacer.roomFor(batch, frames.length, () => this.unwritten.includes(batch));
      if (!this.unwritten.includes(batch)) return;
      if (batch.events !== encoded) frames = await encodeSendFrames(batch.events, batch.to);
      if (socket == null || socket !== this.socket || socket.readyState !== SOCKET_OPEN) return;
      for (const frame of frames) socket.send(frame);
      this.pacer.wrote(batch.events.length, frames.length);
      this.deletionsWritten.note(batch.events);
      this.unwritten = this.unwritten.filter((waiting) => waiting !== batch);
    }
  }

  /** Forgets what the link had written, a new one being counted afresh, and ends any wait for it. */
  private stopPacing(): void {
    this.pacer.reset();
    this.deletionsWritten.clear();
  }

  /**
   * Sends one message of the connection's own, such as the hello, never held back behind a big load
   * going out. None of them has to keep its place among the events.
   */
  private post(message: ClientMessage): void {
    const socket = this.socket;
    this.posting = this.posting
      .then(async () => {
        const frame = await encodeFrame(message);
        if (socket != null && socket === this.socket && socket.readyState === SOCKET_OPEN) socket.send(frame);
      })
      .catch((e) => Logger.warn('[ServerConnection] a send failed', e));
  }

  /**
   * Takes a seat let out for the page left alone back into its room, on the same peer id, once its
   * reader asks. Nothing happens unless it was let out so.
   */
  comeBackFromIdle(): void {
    if (!this.leftAlone || this.stopped) return;
    this.leftAlone = false;
    this.reconnectScheduler.reset(SOCKET_KEY);
    this.connectSocket();
  }

  /**
   * Stays out of the room the server let the seat out of for the page left alone, connecting again
   * only when its reader asks, and says so.
   */
  private leaveForIdle(): void {
    this.leftAlone = true;
    this.idleWatch.end();
    this.reconnectScheduler.cancelAll();
    this.callback.onIdle?.('left');
  }
}
