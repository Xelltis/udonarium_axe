/** How long the first try again waits after a transfer failed; each later one waits twice as long. */
export const ASSET_RETRY_DELAY_MS = 10_000;
/** How many times a transfer that failed is tried again before it is left for the next chance. */
export const ASSET_RETRY_LIMIT = 3;
/** How long after its tries ran out an upload is given one last try, once in each room. */
export const ASSET_LAST_TRY_DELAY_MS = 120_000;

/** The least a GM or PL waits for each that comes before it to put up what a guest named. */
export const RECEIVED_UPLOAD_TURN_MS = 5_000;
/** How fast bytes are taken to go up, in bytes a millisecond, for how long a turn waits on top. */
const RECEIVED_UPLOAD_BYTES_PER_MS = 250;

/**
 * How long one turn waits to put up what a guest named: long enough for the seat before it to have
 * put up as many bytes over a slow line.
 */
export function receivedUploadTurnMs(bytes: number): number {
  return RECEIVED_UPLOAD_TURN_MS + Math.ceil(bytes / RECEIVED_UPLOAD_BYTES_PER_MS);
}

/**
 * Tries again, a few times and further apart each time, the transfers to or from the asset store
 * that failed for now, as when it asked for fewer requests or could not be reached. One that came
 * through starts afresh; leaving the room drops every try still to come.
 */
export class AssetRetries {
  private readonly tries = new Map<string, number>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Arranges one more try of a transfer that failed, unless it has been tried as often as it may.
   * Says whether one is to come.
   */
  schedule(identifier: string, retry: () => void): boolean {
    if (this.timers.has(identifier)) return true;
    const tries = this.tries.get(identifier) ?? 0;
    if (ASSET_RETRY_LIMIT <= tries) return false;
    this.tries.set(identifier, tries + 1);
    const timer = setTimeout(
      () => {
        this.timers.delete(identifier);
        retry();
      },
      ASSET_RETRY_DELAY_MS * 2 ** tries
    );
    this.timers.set(identifier, timer);
    return true;
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
