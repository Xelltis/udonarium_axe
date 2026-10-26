import { ServerCredentials } from '@axe/core/network/connection';

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

/** What a renewal asks of the connection whose seat it keeps the access token fresh for. */
export interface AccessTokenHost {
  /** The user id of the seat. */
  userId(): string;
  /** Whether the seat is in the room. */
  inRoom(): boolean;
  /** The login's credentials just now, when there is a login. */
  credentials(): Promise<ServerCredentials | null> | undefined;
  /** Hands the server a fresh access token for the seat. */
  hand(accessToken: string): void;
}

/**
 * Hands the server each fresh access token while the seat is in the room, so that the seat stays; a
 * seat whose token runs out without a new one is closed by the server.
 */
export class AccessTokenRenewal {
  /** The access token the server was last handed for the seat, which it may turn down. */
  carried: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly host: AccessTokenHost) {}

  /** Checks every TOKEN_CHECK_MS for a token the login refreshed. */
  start(): void {
    this.stop();
    this.timer = setInterval(() => void this.renew(), TOKEN_CHECK_MS);
  }

  stop(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  private async renew(): Promise<void> {
    const userId = this.host.userId();
    let credentials;
    try {
      credentials = await this.host.credentials();
    } catch {
      return;
    }
    if (!this.host.inRoom() || credentials?.userId !== userId) return;
    if (credentials.accessToken === this.carried) return;
    this.carried = credentials.accessToken;
    this.host.hand(credentials.accessToken);
  }
}

/** What a renewal asks of the connection whose seat it keeps the asset token fresh for. */
export interface AssetTokenHost {
  /** Whether the seat is in the room. */
  inRoom(): boolean;
  /** How far the server's clock is ahead of this one, in milliseconds. */
  clockOffset(): number;
  /** Asks the server for a fresh asset token. */
  ask(): void;
}

/**
 * The token for the room's pictures and sounds, asked for afresh a while before it runs out by the
 * server's clock, or at once when the asset store turned it down.
 */
export class AssetTokenRenewal {
  private held: { token: string; expiresAt: number } | null = null;
  /** Whether a fresh token has been asked for and has not come yet. */
  private asked = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Those waiting for the fresh token asked for, called once it comes. */
  private waiters: (() => void)[] = [];

  constructor(private readonly host: AssetTokenHost) {}

  /** The token held, or null without one. */
  get token(): string | null {
    return this.held?.token ?? null;
  }

  /**
   * Holds the token the server handed over, and calls those waiting for one. A Worker with its login
   * taken away hands an empty one, which is no token at all, so the room's pictures and sounds then
   * travel between peers.
   */
  take(token: string, expiresAt: number): void {
    this.held = token ? { token, expiresAt } : null;
    this.asked = false;
    this.release();
  }

  /**
   * Asks for a fresh token, unless one is asked for already, and gives what `read` makes of things
   * once it comes, or once released; null without an answer after ASSET_TOKEN_WAIT_MS.
   */
  whenFresh<T>(read: () => T): Promise<T | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ASSET_TOKEN_WAIT_MS);
      this.waiters.push(() => {
        clearTimeout(timer);
        resolve(read());
      });
      if (!this.asked) {
        this.asked = true;
        this.host.ask();
      }
    });
  }

  /** Checks every TOKEN_CHECK_MS for the token near its end, asking for a fresh one once each time. */
  start(): void {
    this.stop();
    this.timer = setInterval(() => this.renew(), TOKEN_CHECK_MS);
  }

  stop(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = null;
  }

  /** Calls those waiting for a fresh token without one, as when the seat leaves the room. */
  release(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter();
  }

  private renew(): void {
    if (!this.host.inRoom() || !this.held || this.asked) return;
    if (this.held.expiresAt - (Date.now() + this.host.clockOffset()) > ASSET_TOKEN_MARGIN_MS) return;
    this.asked = true;
    this.host.ask();
  }
}
