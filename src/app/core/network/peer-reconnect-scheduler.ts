export const PEER_RECONNECT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];

export class PeerReconnectScheduler {
  private readonly attempts: Map<string, number> = new Map();
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(private readonly backoffMs: readonly number[] = PEER_RECONNECT_BACKOFF_MS) {}

  /** Ids of the peers with a reconnect attempt waiting to run. */
  get scheduledPeerIds(): string[] {
    return [...this.timers.keys()];
  }

  /** How many reconnect attempts have been scheduled for the peer since it was last reset. */
  attemptOf(peerId: string): number {
    return this.attempts.get(peerId) ?? 0;
  }

  /** Whether a reconnect attempt for the peer is waiting to run. */
  isScheduled(peerId: string): boolean {
    return this.timers.has(peerId);
  }

  /**
   * Schedules the peer's next reconnect attempt after its backoff delay, and gives that delay.
   *
   * Null, with nothing scheduled, when an attempt is already waiting or every backoff step has been
   * used. The count only goes back to zero on reset.
   */
  schedule(peerId: string, run: () => void): number | null {
    const attempt = this.attemptOf(peerId);
    if (attempt >= this.backoffMs.length) return null;
    if (this.timers.has(peerId)) return null;

    const delayMs = this.backoffMs[attempt];
    this.attempts.set(peerId, attempt + 1);
    this.timers.set(
      peerId,
      setTimeout(() => {
        this.timers.delete(peerId);
        run();
      }, delayMs)
    );
    return delayMs;
  }

  /** Cancels the peer's waiting attempt but keeps its count, so the next attempt backs off further. */
  cancel(peerId: string): void {
    const timer = this.timers.get(peerId);
    if (timer != null) clearTimeout(timer);
    this.timers.delete(peerId);
  }

  /** Cancels the peer's waiting attempt and clears its count, as once it has connected. */
  reset(peerId: string): void {
    this.cancel(peerId);
    this.attempts.delete(peerId);
  }

  /** Cancels every waiting attempt and clears every count. */
  cancelAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.attempts.clear();
  }
}
