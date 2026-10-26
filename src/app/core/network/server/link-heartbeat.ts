import { PING } from '@axe/core/network/server/server-protocol';

/** How long a connection waits between asking whether the server is still there. */
export const PING_INTERVAL_MS = 25_000;
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
 * when nothing at all comes back within PONG_TIMEOUT_MS.
 */
export class LinkHeartbeat {
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private welcomeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly host: LinkHeartbeatHost) {}

  /** Starts watching a link just opened, in place of any watched before. */
  start(socket: WebSocket): void {
    this.stop();
    this.welcomeTimer = setTimeout(() => {
      this.welcomeTimer = null;
      if (!this.host.isCurrent(socket) || this.host.welcomed()) return;
      this.host.lost(socket, 4002, 'no welcome');
    }, WELCOME_TIMEOUT_MS);
    this.pingTimer = setInterval(() => {
      if (!this.host.isCurrent(socket) || socket.readyState !== SOCKET_OPEN) return;
      socket.send(PING);
      if (this.pongTimer == null) {
        this.pongTimer = setTimeout(() => {
          this.pongTimer = null;
          if (!this.host.isCurrent(socket)) return;
          // A dead link may take a minute to report the close; take it as lost now.
          this.host.lost(socket, 4001, 'no answer to ping');
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  /** Anything from the server shows it is there, a pong or otherwise. */
  heard(): void {
    if (this.pongTimer != null) clearTimeout(this.pongTimer);
    this.pongTimer = null;
  }

  stop(): void {
    if (this.pingTimer != null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    if (this.welcomeTimer != null) clearTimeout(this.welcomeTimer);
    this.welcomeTimer = null;
    this.heard();
  }
}
