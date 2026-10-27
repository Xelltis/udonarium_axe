import { IdleState } from '@axe/core/network/connection';
import { pageActivity } from '@axe/core/network/server/page-activity';
import { ACTIVE_REPORT_SECONDS, IDLE_SECONDS } from '@axe/core/network/server/server-protocol';

/** How long before a seat would be let out for the page left alone its reader is told so. */
export const IDLE_WARNING_MS = 5 * 60_000;

/** What an idle watch asks of the connection whose seat it watches. */
export interface IdleWatchHost {
  /** Whether the seat is in the room. */
  inRoom(): boolean;
  /** Tells the server the page is in use. */
  reportActive(): void;
  /** Tells the reader the seat is soon to be let out, or is no longer. */
  tell(state: Extract<IdleState, 'soon' | 'back'>): void;
}

/**
 * Hears the page's use while the seat is in, saying active to the server when it was used at least
 * ACTIVE_REPORT_SECONDS after the server last heard so, and warns IDLE_WARNING_MS before the seat
 * would be let out.
 */
export class IdleWatch {
  /** When the room server last heard the page was in use: by the hello that got in, or by active. */
  private reportedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private warned = false;
  private stopHearingInput: (() => void) | null = null;

  constructor(private readonly host: IdleWatchHost) {}

  /** Starts watching as the seat gets in, from the use the server last heard of, in Unix milliseconds. */
  start(reportedAt: number): void {
    this.reportedAt = reportedAt;
    this.stopHearingInput ??= pageActivity.onInput((at) => this.usedAt(at));
    this.arm();
  }

  /** Stops watching while the seat is out, keeping a warning given for when it gets back in. */
  stop(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = null;
    this.stopHearingInput?.();
    this.stopHearingInput = null;
  }

  /** Stops watching and forgets any warning given, as the seat leaves the room. */
  end(): void {
    this.stop();
    this.warned = false;
  }

  private usedAt(at: number): void {
    if (!this.host.inRoom() || at - this.reportedAt < ACTIVE_REPORT_SECONDS * 1000) return;
    this.reportedAt = at;
    this.host.reportActive();
    this.arm();
    if (!this.warned) return;
    this.warned = false;
    this.host.tell('back');
  }

  private arm(): void {
    if (this.timer != null) clearTimeout(this.timer);
    const warnAt = this.reportedAt + IDLE_SECONDS * 1000 - IDLE_WARNING_MS;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (!this.host.inRoom() || this.warned) return;
        this.warned = true;
        this.host.tell('soon');
      },
      Math.max(0, warnAt - Date.now())
    );
  }
}
