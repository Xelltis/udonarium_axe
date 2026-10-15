/** How long the first try again waits after a download failed; each later one waits twice as long. */
export const ASSET_RETRY_DELAY_MS = 10_000;
/** How many times a download that failed is tried again before it waits for a catalogue to name it. */
export const ASSET_RETRY_LIMIT = 3;

/**
 * Tries again, a few times and further apart each time, the downloads from the asset store that
 * failed for now, as when it asked for fewer requests or could not be reached. A download that came
 * through starts afresh; leaving the room drops every try still to come.
 */
export class AssetDownloadRetries {
  private readonly tries = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /** Arranges one more try of a download that failed, unless it has been tried as often as it may. */
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

  /** Forgets how often a download that has now come through was tried. */
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
