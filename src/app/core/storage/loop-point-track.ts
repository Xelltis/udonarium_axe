/**
 * One track played from memory, which goes round between the points its file names while it is set
 * to loop, and plays on to its end when it is not.
 *
 * An `<audio>` element can only loop a track whole, so a track with an introduction would play the
 * introduction again at every turn; a decoded buffer can loop any part of itself without a gap.
 * Where it has got to is worked out from the audio clock, which stands still while the context is
 * held back for want of a gesture, so the track starts from where it was asked to once let run.
 */
export class LoopPointTrack {
  private source: AudioBufferSourceNode | null = null;
  private readonly gain: GainNode;
  private startedAt = 0;
  private offset = 0;
  private _loop: boolean;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeDone: (() => void) | null = null;

  /** Called when the track plays to its end, which it never does while it loops. */
  onEnded: (() => void) | null = null;

  constructor(
    private readonly context: BaseAudioContext,
    private readonly buffer: AudioBuffer,
    private readonly region: { readonly start: number; readonly end: number },
    output: AudioNode,
    volume: number,
    loop: boolean
  ) {
    this._loop = loop;
    this.gain = context.createGain();
    this.gain.gain.setValueAtTime(volume, context.currentTime);
    this.gain.connect(output);
  }

  /** The length of the whole track in seconds, the part after the loop included. */
  get duration(): number {
    return this.buffer.duration;
  }

  /** Whether the track is sounding, or waiting for the context to be let run. */
  get isPlaying(): boolean {
    return this.source !== null;
  }

  /** Where the track has got to, in seconds, folded back into the loop once it has gone round. */
  get position(): number {
    if (!this.source) return this.offset;
    return this.fold(this.offset + (this.context.currentTime - this.startedAt));
  }

  /** Whether the track goes round between its loop points; changed while it plays, it takes effect at once. */
  get loop(): boolean {
    return this._loop;
  }
  set loop(loop: boolean) {
    if (loop === this._loop) return;
    this.anchor();
    this._loop = loop;
    if (this.source) this.source.loop = loop;
  }

  /** The track's own volume, from 0 to 1, on top of the channel it plays through. */
  get volume(): number {
    return this.gain.gain.value;
  }
  set volume(volume: number) {
    this.cancelFade();
    const param = this.gain.gain;
    param.cancelScheduledValues(this.context.currentTime);
    param.setValueAtTime(volume, this.context.currentTime);
  }

  /** Plays the track from a point in seconds, folded into the loop when it lies past the loop's end. */
  start(at: number): void {
    this.release();
    const position = this.fold(Math.min(Math.max(0, at), this.buffer.duration));
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = this._loop;
    source.loopStart = this.region.start;
    source.loopEnd = this.region.end;
    source.connect(this.gain);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.offset = this.buffer.duration;
      source.disconnect();
      this.onEnded?.();
    };
    this.source = source;
    this.offset = position;
    this.startedAt = this.context.currentTime;
    source.start(0, position);
  }

  /** Moves to a point in seconds: playing on from there, or keeping it to start from while stopped. */
  seek(at: number): void {
    if (this.source) this.start(at);
    else this.offset = this.fold(Math.min(Math.max(0, at), this.buffer.duration));
  }

  /** Stops where it is, keeping the place to start from again. */
  pause(): void {
    const position = this.position;
    this.release();
    this.offset = position;
  }

  /**
   * Glides the volume to a target over a duration on the audio clock, resolving when it gets there.
   * A later fade or a volume set cuts it short, and it resolves then.
   */
  fadeTo(target: number, durationMs: number): Promise<void> {
    this.cancelFade();
    const param = this.gain.gain;
    const now = this.context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + Math.max(durationMs, 1) / 1000);
    return new Promise((resolve) => {
      this.fadeDone = resolve;
      this.fadeTimer = setTimeout(() => this.cancelFade(), Math.max(durationMs, 0));
    });
  }

  /** Stops the track for good and takes it off the channel. */
  dispose(): void {
    this.cancelFade();
    this.release();
    this.gain.disconnect();
  }

  private fold(position: number): number {
    const { start, end } = this.region;
    if (!this._loop || position < end) return position;
    return start + ((position - start) % (end - start));
  }

  /** Sets the place counted from to where the track is now, before what it is counted by changes. */
  private anchor(): void {
    if (!this.source) return;
    this.offset = this.position;
    this.startedAt = this.context.currentTime;
  }

  private release(): void {
    const source = this.source;
    if (!source) return;
    this.source = null;
    source.onended = null;
    source.stop();
    source.disconnect();
  }

  private cancelFade(): void {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    const done = this.fadeDone;
    this.fadeDone = null;
    done?.();
  }
}
