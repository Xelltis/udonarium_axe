/** A tap on the beat: when it came, in milliseconds, and where the track was then, in seconds. */
export interface Tap {
  readonly atMs: number;
  readonly position: number;
}

/**
 * Works a tempo out from taps along with the music, as a DJ taps a button on the beat.
 *
 * The tempo is the average gap between the last few taps, so it settles as more come. A pause of
 * two seconds, or a tap out of order, starts the count again.
 */
export class TapTempo {
  /** How long a pause between taps starts the count again, in milliseconds. */
  static readonly RESET_MS = 2000;
  /** How many of the latest taps the tempo is taken from. */
  static readonly KEPT = 8;

  private taps: Tap[] = [];

  /** How many taps the tempo is being worked out from. */
  get count(): number {
    return this.taps.length;
  }

  /** The latest tap, or null before any. */
  get last(): Tap | null {
    return this.taps.at(-1) ?? null;
  }

  /** Takes a tap and gives the tempo from the taps so far in beats per minute, or null until there are two. */
  tap(tap: Tap): number | null {
    const last = this.last;
    if (last && (tap.atMs - last.atMs > TapTempo.RESET_MS || tap.atMs <= last.atMs)) this.taps = [];
    this.taps.push(tap);
    if (this.taps.length > TapTempo.KEPT) this.taps.shift();
    return this.bpm;
  }

  /** The tempo from the taps so far, in beats per minute, or null until there are two. */
  get bpm(): number | null {
    if (this.taps.length < 2) return null;
    const span = this.taps[this.taps.length - 1].atMs - this.taps[0].atMs;
    return span > 0 ? (60000 * (this.taps.length - 1)) / span : null;
  }

  /** Forgets every tap. */
  reset(): void {
    this.taps = [];
  }
}
