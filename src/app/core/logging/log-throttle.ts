/**
 * Holds a repeated log line back to one per interval for each key, so that something which goes
 * wrong on every message, as a send to a peer whose stream is down does, says so without filling
 * the console.
 */
export class LogThrottle {
  private readonly last = new Map<string, { at: number; held: number }>();

  constructor(private readonly intervalMs: number) {}

  /**
   * Whether the line for this key may be written now: the number of lines held back since the
   * last one written, or null when this one is to be held back too.
   */
  pass(key: string, now: number = performance.now()): number | null {
    const entry = this.last.get(key);
    if (entry && now - entry.at < this.intervalMs) {
      entry.held++;
      return null;
    }
    this.last.set(key, { at: now, held: 0 });
    return entry?.held ?? 0;
  }

  /** Forgets a key, or every key when given none, so the next line is written at once. */
  reset(key?: string): void {
    if (key === undefined) this.last.clear();
    else this.last.delete(key);
  }
}
