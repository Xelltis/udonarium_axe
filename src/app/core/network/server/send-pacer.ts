/** The window the server counts a connection's sends in, the protocol's RATE_WINDOW_SECONDS. */
export const SEND_WINDOW_MS = 10_000;
/**
 * The window a seat paces its sends over: a second longer than the server's, which starts as the
 * first frame is taken in, so that a frame held up on the way does not bring two steps into one.
 */
export const PACE_WINDOW_MS = SEND_WINDOW_MS + 1000;
/**
 * How many events a seat writes in PACE_WINDOW_MS at most, under half of the 20,000 past which the
 * server cuts the connection off, so that two steps taken into one of its windows, the first held up
 * on the way, still keep inside it. A tab of many lines deleted, or a big room loaded again, goes out
 * over a few windows rather than losing the seat and what was over. The events stay in the order they
 * were sent, whoever they go to; only the connection's own messages are not held back.
 */
export const SEND_BUDGET_EVENTS = 9_000;
/** How many frames a seat writes in PACE_WINDOW_MS at most, under half of the server's 2,000. */
export const SEND_BUDGET_FRAMES = 900;

/**
 * Keeps what a link writes inside the room server's limits: counts what was written within the last
 * PACE_WINDOW_MS, and holds each batch back until it fits in what the window has left of the budget.
 */
export class SendPacer {
  /** What was written to the link within the last PACE_WINDOW_MS, oldest first. */
  private sentLately: { at: number; events: number; frames: number }[] = [];
  /** Ends a wait for room in the window early, as when the link goes. */
  private wake: (() => void) | null = null;

  /**
   * Waits until a batch fits in what the window has left of the budget, or it is no longer wanted.
   * A batch over the budget on its own goes once the window is empty.
   */
  async roomFor(batch: { readonly events: readonly unknown[] }, frames: number, wanted: () => boolean): Promise<void> {
    while (wanted()) {
      const now = Date.now();
      this.sentLately = this.sentLately.filter((sent) => now - sent.at < PACE_WINDOW_MS);
      const events = this.sentLately.reduce((count, sent) => count + sent.events, batch.events.length);
      const written = this.sentLately.reduce((count, sent) => count + sent.frames, frames);
      if (this.sentLately.length === 0 || (events <= SEND_BUDGET_EVENTS && written <= SEND_BUDGET_FRAMES)) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(wake, this.sentLately[0].at + PACE_WINDOW_MS - now);
        function wake(): void {
          clearTimeout(timer);
          resolve();
        }
        this.wake = wake;
      });
      this.wake = null;
    }
  }

  /** Counts a batch of so many events, in so many frames, as written to the link just now. */
  wrote(events: number, frames: number): void {
    this.sentLately.push({ at: Date.now(), events, frames });
  }

  /** Forgets what the link had written, a new one being counted afresh, and ends any wait for room. */
  reset(): void {
    this.sentLately = [];
    this.wake?.();
    this.wake = null;
  }
}
