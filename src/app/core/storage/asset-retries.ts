/** How long the first try again waits after a transfer failed; each later one waits twice as long. */
export const ASSET_RETRY_DELAY_MS = 10_000;
/** How many times a transfer that failed is tried again before it is left for the next chance. */
export const ASSET_RETRY_LIMIT = 3;

/**
 * Tries again, a few times and further apart each time, the transfers to or from the asset store
 * that failed for now, as when it asked for fewer requests or could not be reached. One that came
 * through starts afresh; leaving the room drops every try still to come.
 */
export class AssetRetries {
  private readonly tries = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Arranges one more try of a transfer that failed, unless it has been tried as often as it may. */
  schedule(identifier: string, retry: () => void): void {
    if (this.timers.has(identifier)) return;
    const tries = this.tries.get(identifier) ?? 0;
    if (ASSET_RETRY_LIMIT <= tries) return;
    this.tries.set(identifier, tries + 1);
    const timer = setTimeout(
      () => {
        this.timers.delete(identifier);
        retry();
      },
      ASSET_RETRY_DELAY_MS * 2 ** tries
    );
    this.timers.set(identifier, timer);
  }

  /** Whether a transfer is waiting to be tried again. */
  isWaiting(identifier: string): boolean {
    return this.timers.has(identifier);
  }

  /** Whether any transfer is waiting to be tried again. */
  get hasWaiting(): boolean {
    return this.timers.size > 0;
  }

  /** Forgets how often a transfer that has now come through was tried. */
  forget(identifier: string): void {
    this.tries.delete(identifier);
  }

  /** Drops every try still to come, and how often each was tried. */
  clear(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.tries.clear();
  }
}
