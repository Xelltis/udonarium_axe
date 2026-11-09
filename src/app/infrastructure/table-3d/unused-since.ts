/**
 * When each of the things read stopped being used, by its key, so that what has gone unused long
 * enough can be let go of. A thing used again before then is kept as though it had never gone.
 */
export class UnusedSince {
  private readonly since = new Map<string, number>();

  constructor(private readonly keepMs: number) {}

  /** Notes, at a moment, which of the things read are used now: those that are not, from then on. */
  note(read: Iterable<string>, used: ReadonlySet<string>, now: number): void {
    const stillRead = new Set<string>();
    for (const key of read) {
      stillRead.add(key);
      if (used.has(key)) this.since.delete(key);
      else if (!this.since.has(key)) this.since.set(key, now);
    }
    for (const key of this.since.keys()) if (!stillRead.has(key)) this.since.delete(key);
  }

  /** The things gone unused for as long as they are kept, at a moment; they are forgotten here as they are answered. */
  takeDue(now: number): string[] {
    const due: string[] = [];
    for (const [key, since] of this.since) {
      if (now - since < this.keepMs) continue;
      due.push(key);
      this.since.delete(key);
    }
    return due;
  }

  /** How long from a moment until the next thing has gone unused for as long as it is kept, or null when nothing is unused. */
  nextDueIn(now: number): number | null {
    if (this.since.size === 0) return null;
    return Math.max(0, Math.min(...this.since.values()) + this.keepMs - now);
  }

  clear(): void {
    this.since.clear();
  }
}
