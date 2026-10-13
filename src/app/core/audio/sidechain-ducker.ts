/** What a ducker lowers: the music, eased to a factor of its level. */
export interface DuckingTarget {
  duckTo(level: number, timeConstant: number): void;
}

/** Something whose sound can be read a stretch at a time, as an analyser reads a channel. */
export interface SignalTap {
  readonly fftSize: number;
  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void;
}

/** How a ducker hears and how far it lowers. */
export interface DuckingOptions {
  /** How far the music goes down while something else sounds, in dB below its level. */
  readonly depthDb: number;
  /** How loud another sound must be to duck the music, in dB below full scale. */
  readonly thresholdDb: number;
  /** How quickly the music goes down, as a time constant in seconds. */
  readonly attackS: number;
  /** How slowly the music comes back, as a time constant in seconds. */
  readonly releaseS: number;
  /** How long the other sounds must have been quiet before the music comes back, in milliseconds. */
  readonly holdMs: number;
  /** How often the other sounds are listened to, in milliseconds. */
  readonly pollMs: number;
}

export const DEFAULT_DUCKING: DuckingOptions = {
  depthDb: 9,
  thresholdDb: -45,
  attackS: 0.04,
  releaseS: 0.4,
  holdMs: 250,
  pollMs: 50,
};

/**
 * Lowers the music while other sounds are heard, and brings it back once they stop, as a DJ rides
 * the music down under a voice.
 *
 * It listens to taps on the other channels a few dozen times a second and eases the music down
 * the moment any of them rises over the threshold, then back up once all have been quiet for a
 * moment. While turned off it listens to nothing and leaves the music at its level.
 */
export class SidechainDucker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly buffers: Float32Array<ArrayBuffer>[];
  private ducked = false;
  private lastHeard = -Infinity;

  constructor(
    private readonly taps: readonly SignalTap[],
    private readonly target: DuckingTarget,
    private readonly options: DuckingOptions = DEFAULT_DUCKING,
    private readonly now: () => number = () => performance.now()
  ) {
    this.buffers = taps.map((tap) => new Float32Array(tap.fftSize));
  }

  /** Whether it is listening. */
  get isEnabled(): boolean {
    return this.timer !== null;
  }

  /** Starts or stops listening; stopping brings the music back up at once. */
  setEnabled(enabled: boolean): void {
    if (enabled === this.isEnabled) return;
    if (enabled) {
      this.timer = setInterval(() => this.listen(), this.options.pollMs);
      return;
    }
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    if (this.ducked) this.target.duckTo(1, this.options.releaseS);
    this.ducked = false;
    this.lastHeard = -Infinity;
  }

  /** Listens once to the other sounds and moves the music if it should. */
  listen(): void {
    const now = this.now();
    if (this.loudestDb() > this.options.thresholdDb) {
      this.lastHeard = now;
      if (!this.ducked) {
        this.ducked = true;
        this.target.duckTo(Math.pow(10, -this.options.depthDb / 20), this.options.attackS);
      }
      return;
    }
    if (this.ducked && now - this.lastHeard >= this.options.holdMs) {
      this.ducked = false;
      this.target.duckTo(1, this.options.releaseS);
    }
  }

  private loudestDb(): number {
    let loudest = 0;
    this.taps.forEach((tap, index) => {
      const buffer = this.buffers[index];
      tap.getFloatTimeDomainData(buffer);
      let energy = 0;
      for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
      loudest = Math.max(loudest, energy / buffer.length);
    });
    return loudest > 0 ? 10 * Math.log10(loudest) : -Infinity;
  }
}
