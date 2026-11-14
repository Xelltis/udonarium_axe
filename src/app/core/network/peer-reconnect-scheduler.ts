export const PEER_RECONNECT_BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000, 15000];

/** How long each further attempt waits once the backoff has been used up, where attempts go on. */
export const PEER_RECONNECT_STEADY_MS = 30_000;

export class PeerReconnectScheduler {
  private readonly attempts: Map<string, number> = new Map();
  private readonly timers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * With a steady delay, attempts go on at that delay once the backoff has been used up, until the
   * peer is reset; with none, the backoff is all the attempts there are.
   */
  constructor(
    private readonly backoffMs: readonly number[] = PEER_RECONNECT_BACKOFF_MS,
    private readonly steadyMs: number | null = null
  ) {}

  /** How many attempts the backoff covers before the steady delay, if any, takes over. */
  get backoffSteps(): number {
    return this.backoffMs.length;
  }

  /** Ids of the peers with a reconnect attempt waiting to run. */
  get scheduledPeerIds(): string[] {
    return [...this.timers.keys()];
  }

  /** How many reconnect attempts have been scheduled for the peer since it was last reset. */
  attemptOf(peerId: string): number {
    return this.attempts.get(peerId) ?? 0;
  }

  /** Whether the peer has been tried more often than the backoff has steps, so it is on the steady delay. */
  isPastBackoff(peerId: string): boolean {
    return this.attemptOf(peerId) > this.backoffMs.length;
  }

  /** Whether a reconnect attempt for the peer is waiting to run. */
  isScheduled(peerId: string): boolean {
    return this.timers.has(peerId);
  }

  /**
   * Schedules the peer's next reconnect attempt after its backoff delay, and gives that delay.
   *
   * Null, with nothing scheduled, when an attempt is already waiting, or when every backoff step
   * has been used and there is no steady delay to go on at. The count only goes back to zero on
   * reset.
   */
  schedule(peerId: string, run: () => void): number | null {
    const attempt = this.attemptOf(peerId);
    const delayMs = attempt < this.backoffMs.length ? this.backoffMs[attempt] : this.steadyMs;
    if (delayMs === null) return null;
    if (this.timers.has(peerId)) return null;

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
