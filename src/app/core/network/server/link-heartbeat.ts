import { PING } from '@axe/core/network/server/server-protocol';

/** How long a connection waits between asking whether the server is still there. */
export const PING_INTERVAL_MS = 25_000;
/**
 * How long it waits between asking while somebody looks at how the link is doing, to tell how long
 * an answer takes: longer than the 5 seconds a room server passing pings on to another instance waits
 * before it passes on the next, so that none goes unanswered.
 */
export const WATCHED_PING_INTERVAL_MS = 6_000;
/** How long it waits for any answer to that before it takes the connection as lost. */
export const PONG_TIMEOUT_MS = 10_000;
/**
 * How long a connection waits to be let into the room after it says hello before it takes the
 * connection as lost: longer than a room server spread over instances looks for the one holding
 * the room (twice its 15-second lease), so that a holder gone silent does not keep it waiting.
 */
export const WELCOME_TIMEOUT_MS = 45_000;

/** A WebSocket's readyState while it is open. */
export const SOCKET_OPEN = 1;

/** What a heartbeat asks of the connection whose link it watches. */
export interface LinkHeartbeatHost {
  /** Whether the socket is still the connection's link. */
  isCurrent(socket: WebSocket): boolean;
  /** Whether the seat has been let into the room over the link. */
  welcomed(): boolean;
  /** Takes the link as lost, closing it with the code and reason given. */
  lost(socket: WebSocket, code: number, reason: string): void;
}

/**
 * Watches a link for the room server gone silent: it waits WELCOME_TIMEOUT_MS for the seat to be let
 * in, and asks every PING_INTERVAL_MS whether the server is still there, taking the link as lost
 * when nothing at all comes back within PONG_TIMEOUT_MS. How long the last answer took to come back
 * is kept, and asked for every WATCHED_PING_INTERVAL_MS while somebody looks.
 */
export class LinkHeartbeat {
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;
  private socket: WebSocket | null = null;
  private interval = PING_INTERVAL_MS;
  /** When the last ask that waits for its answer went, or null while none waits. */
  private askedAt: number | null = null;
  /** When the last ask went, so that looking closely does not ask again sooner than a while after. */
  private lastAskedAt = -Infinity;
  private answerMs = 0;

  constructor(private readonly host: LinkHeartbeatHost) {}

  /** How long the last answer to a ping took to come back, in milliseconds; 0 before any has on this link. */
  get roundTripMs(): number {
    return this.answerMs;
  }

  /** Starts watching a link just opened, in place of any watched before. */
  start(socket: WebSocket): void {
    this.stop();
    this.socket = socket;
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      if (!this.host.isCurrent(socket) || this.host.welcomed()) return;
      this.host.lost(socket, 4002, 'no welcome');
    }, WELCOME_TIMEOUT_MS);
    this.keepAsking();
  }

  /**
   * Asks every WATCHED_PING_INTERVAL_MS while somebody looks at how the link is doing, and every
   * PING_INTERVAL_MS again once nobody does. Looking afresh asks at once, unless it asked a moment ago.
   */
  watch(closely: boolean): void {
    const interval = closely ? WATCHED_PING_INTERVAL_MS : PING_INTERVAL_MS;
    if (interval === this.interval) return;
    this.interval = interval;
    if (this.pingTimer == null) return;
    this.keepAsking();
    if (closely && Date.now() - this.lastAskedAt >= WATCHED_PING_INTERVAL_MS) this.ask();
  }

  /** Anything from the server shows it is there, a pong or otherwise. */
  heard(): void {
    if (this.pongTimer != null) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  /**
   * The answer to a ping came, which tells how long it took, timed from the last ping. A ping goes
   * every while though one waits for its answer, so that one left unanswered does not end a link
   * that is still there; which ping an answer is to cannot be told, so one slower than the pings are
   * apart reads as the time since the last ping, and one left unanswered does not stretch the next.
   */
  answered(): void {
    if (this.askedAt !== null) this.answerMs = Date.now() - this.askedAt;
    this.askedAt = null;
    this.heard();
  }

  stop(): void {
    if (this.pingTimer != null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.welcomeTimer != null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.socket = null;
    this.askedAt = null;
    this.lastAskedAt = -Infinity;
    this.answerMs = 0;
    this.heard();
  }

  private keepAsking(): void {
    if (this.pingTimer != null) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => this.ask(), this.interval);
  }

  private ask(): void {
    const socket = this.socket;
    if (!socket || !this.host.isCurrent(socket) || socket.readyState !== SOCKET_OPEN) return;
    socket.send(PING);
    this.lastAskedAt = Date.now();
    this.askedAt = this.lastAskedAt;
    if (this.pongTimer == null) {
      this.pongTimer = setTimeout(() => {
        this.pongTimer = null;
        if (!this.host.isCurrent(socket)) return;
        // A dead link may take a minute to report the close; take it as lost now.
        this.host.lost(socket, 4001, 'no answer to ping');
      }, PONG_TIMEOUT_MS);
    }
  }
}
