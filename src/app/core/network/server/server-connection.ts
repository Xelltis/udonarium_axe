import { Logger } from '@axe/core/logging/logger';
import { Connection, ConnectionCallback } from '@axe/core/network/connection';
import { IPeerContext, PeerContext } from '@axe/core/network/peer-context';
import { PeerReconnectScheduler } from '@axe/core/network/peer-reconnect-scheduler';
import { IRoomInfo } from '@axe/core/network/room-info';
import { decodeFrame, encodeFrame, encodeSendFrames } from '@axe/core/network/server/server-frames';
import {
  ClientMessage,
  DataMessage,
  EventContext,
  helloMessage,
  isRetryableError,
  Member,
  PING,
  readServerMessage,
  ServerMessage,
  WelcomeMessage,
} from '@axe/core/network/server/server-protocol';
import { listRooms, roomInfoOf, roomSocketUrl } from '@axe/core/network/server/server-room-api';

/** How long a connection waits between asking whether the server is still there. */
export const PING_INTERVAL_MS = 25_000;
/** How long it waits for any answer to that before it takes the connection as lost. */
export const PONG_TIMEOUT_MS = 10_000;
/**
 * How long sends gather before they go out as one frame. It keeps a busy table, sixty frames a
 * second at most, well inside the server's limit of 2000 frames in ten seconds.
 */
export const SEND_GATHER_MS = 16;

/** The error a session reports when it never got into the room, or lost the server for good. */
export const SERVER_UNREACHABLE = 'server-unreachable';
/** The error a session reports when the deployment names no backend to reach. */
export const NO_BACKEND = 'no-backend';

const SOCKET_OPEN = 1;
const SOCKET_KEY = 'room-server';

interface Outbound {
  to: string | undefined;
  events: EventContext[];
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
 * refusal ends the session with an error, except for a full room or too many messages, which are
 * tried again in the same way.
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

  private baseUrl = '';
  private me: PeerContext = PeerContext.parse('???');
  private authority: PeerContext | null = null;
  private readonly members: Map<string, PeerContext> = new Map();
  private room: { roomKey: string; password: string } | null = null;

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
      peer.isOpen = true;
      this.callback.onOpen?.(peer);
    });
  }

  /**
   * Opens a session in the room the key finds. The peer id carries the room but no password:
   * the server checks the password, which travels in the hello.
   */
  open(userId: string, roomId: string, roomName: string, password: string, roomKey?: string): void {
    this.stopped = false;
    void PeerContext.createRoom(userId, roomId, roomName, '').then((peer) => {
      if (this.stopped) return;
      peer.password = password;
      this.me = peer;
      if (!roomKey) {
        this.fail('room-not-found', 'no key to find the room by');
        return;
      }
      this.room = { roomKey, password };
      this.connectSocket();
    });
  }

  /** Leaves the room for good, without reporting anything. */
  close(): void {
    this.stopped = true;
    this.teardown();
    this.me.isOpen = false;
    this.members.clear();
    this.authority = null;
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
    if (!this.welcomed || !Array.isArray(data) || data.length === 0) return;
    const events = data as EventContext[];
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

  async listAllPeers(): Promise<string[]> {
    return this.peerIds;
  }

  /** The rooms on the server. It rejects when the server cannot be reached or refuses. */
  async listAllRooms(): Promise<IRoomInfo[]> {
    return (await listRooms(this.baseUrl)).map(roomInfoOf);
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
    const { password } = this.room;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.post(helloMessage(this.me.peerId, this.me.userId, password));
      this.startPing(socket);
    };
    socket.onmessage = (event: MessageEvent) => {
      if (socket !== this.socket) return;
      this.heardFrom();
      if (typeof event.data !== 'string') this.receive(new Uint8Array(event.data as ArrayBuffer));
    };
    socket.onclose = () => {
      if (socket !== this.socket) return;
      this.socketClosed();
    };
    socket.onerror = () => {
      // a close always follows, and decides what comes next
    };
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
      case 'error':
        this.refusal = message.code;
        return;
    }
  }

  private welcome(message: WelcomeMessage): void {
    this.welcomed = true;
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

  private deliver(message: DataMessage): void {
    const from =
      this.members.get(message.from) ??
      (message.from === this.authority?.peerId ? this.authority : PeerContext.parse(message.from));
    for (const event of message.events) event.sendFrom = message.from;
    this.callback.onData?.(from, message.events);
  }

  private socketClosed(): void {
    const wasWelcomed = this.welcomed;
    this.socket = null;
    this.welcomed = false;
    this.stopPing();
    this.dropQueued();
    if (wasWelcomed && this.authority) {
      this.authority.isOpen = false;
      this.callback.onDisconnect?.(this.authority);
    }
    for (const peerId of [...this.members.keys()]) this.removeMember(peerId);
    if (this.stopped) return;

    const refusal = this.refusal;
    this.refusal = null;
    if (refusal != null && !isRetryableError(refusal)) {
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

  /** Ends the session and says why. A session that was in the room is reported closed first. */
  private fail(code: string, message: string): void {
    const wasOpen = this.me.isOpen;
    this.stopped = true;
    this.teardown();
    this.me.isOpen = false;
    if (wasOpen) this.callback.onClose?.(this.me);
    this.callback.onError?.(this.me, code, message, null);
  }

  private teardown(): void {
    this.reconnectScheduler.cancelAll();
    this.stopPing();
    this.dropQueued();
    const socket = this.socket;
    this.socket = null;
    this.welcomed = false;
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
          if (socket === this.socket) socket.close(4001, 'no answer to ping');
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
