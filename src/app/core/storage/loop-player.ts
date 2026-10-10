import { Logger } from '@axe/core/logging/logger';
import { AudioFile } from '@axe/core/storage/audio-file';
import { loopPointsFitInMemory, loopRegionOf, readAudioLoopPoints } from '@axe/core/storage/audio-loop-points';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';

/** Files up to this size are decoded and looped from memory, which joins the end to the start without a gap. */
export const LOOP_FROM_MEMORY_MAX_FILE_BYTES = 2 * 1024 * 1024;

/** A decoded sound larger than this is let go and streamed from its file instead. */
export const LOOP_FROM_MEMORY_MAX_DECODED_BYTES = 48 * 1024 * 1024;

const VOLUME_GLIDE_S = 0.08;

/**
 * Plays one sound round and round through the background channel, fading it in as it starts and out
 * as it stops.
 *
 * A small file is decoded and looped from memory, which joins its end to its start without the gap
 * an `<audio>` element leaves at the seam. A large one is streamed through an element, since
 * decoding it whole would take many times the memory of the file. A file that names where it loops
 * is decoded whatever its size, within what memory allows, and goes round between those points.
 * Fades run on the audio clock, so one started in a tab that is then put in the background still
 * finishes.
 */
export class LoopPlayer {
  private _gain: GainNode | null = null;
  private source: AudioBufferSourceNode | null = null;
  private element: HTMLAudioElement | null = null;
  private elementSource: MediaElementAudioSourceNode | null = null;
  private stopTimer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private volume = 1;
  private audioIdentifier = '';
  private _isActive = false;
  private _isAwaitingGesture = false;

  /** Whether a sound has been started and not stopped, counting one still loading. */
  get isActive(): boolean {
    return this._isActive;
  }

  /**
   * Whether the browser refused to start the sound because the user had not yet interacted with the
   * page, so a later gesture may start it. Only a streamed sound can be refused; one looped from
   * memory waits for the audio context to be let run instead.
   */
  get isAwaitingGesture(): boolean {
    return this._isAwaitingGesture;
  }

  private get gain(): GainNode {
    if (!this._gain) {
      const context = AudioPlayer.audioContext;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, context.currentTime);
      gain.connect(AudioPlayer.backgroundNode);
      this._gain = gain;
    }
    return this._gain;
  }

  /**
   * Starts the sound looping at a volume from 0 to 1, rising to it over the fade.
   *
   * Whatever was playing is let go first. The same sound started again while it is still fading out
   * rises back from where it had got to instead of starting over.
   */
  start(audio: AudioFile, volume: number, fadeInMs: number): void {
    this.volume = volume;
    this._isActive = true;
    if (this.stopTimer !== null && this.audioIdentifier === audio.identifier && this.isSounding) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
      this.attempt++;
      this.rampTo(volume, fadeInMs / 1000);
      return;
    }
    this.teardown();
    this._isAwaitingGesture = false;
    this.audioIdentifier = audio.identifier;
    const attempt = ++this.attempt;
    void this.startAsync(audio, fadeInMs, attempt);
  }

  /** Moves the volume, from 0 to 1, gliding there rather than jumping. Kept for a sound still loading. */
  setVolume(volume: number): void {
    this.volume = volume;
    if (!this._isActive || !this.isSounding) return;
    this.rampTo(volume, VOLUME_GLIDE_S);
  }

  /** Fades the sound out and lets it go. Without a fade, or with nothing sounding yet, it goes at once. */
  stop(fadeOutMs: number = 0): void {
    if (!this._isActive) return;
    this._isActive = false;
    this._isAwaitingGesture = false;
    const attempt = ++this.attempt;
    if (fadeOutMs <= 0 || !this.isSounding) {
      this.teardown();
      return;
    }
    this.rampTo(0, fadeOutMs / 1000);
    this.stopTimer = setTimeout(() => {
      if (attempt === this.attempt) this.teardown();
    }, fadeOutMs);
  }

  /** Stops the sound at once and takes this player off the background channel for good. */
  dispose(): void {
    this._isActive = false;
    this._isAwaitingGesture = false;
    this.attempt++;
    this.teardown();
    this._gain?.disconnect();
    this._gain = null;
  }

  private get isSounding(): boolean {
    return this.source !== null || this.element !== null;
  }

  private async startAsync(audio: AudioFile, fadeInMs: number, attempt: number): Promise<void> {
    const decoded = await LoopPlayer.decodeForLoopAsync(audio);
    if (attempt !== this.attempt) return;
    const context = AudioPlayer.audioContext;
    if (decoded) {
      const source = context.createBufferSource();
      source.buffer = decoded.buffer;
      source.loop = true;
      if (decoded.region) {
        source.loopStart = decoded.region.start;
        source.loopEnd = decoded.region.end;
      }
      source.connect(this.gain);
      this.source = source;
      this.fadeIn(fadeInMs);
      source.start();
      return;
    }
    if (!audio.url) return;
    const element = new Audio();
    element.loop = true;
    element.src = audio.url;
    const elementSource = context.createMediaElementSource(element);
    elementSource.connect(this.gain);
    this.element = element;
    this.elementSource = elementSource;
    this.fadeIn(fadeInMs);
    element.play().catch((reason) => {
      if (attempt === this.attempt) {
        this._isAwaitingGesture = (reason as { name?: unknown } | null)?.name === 'NotAllowedError';
      }
      Logger.warn('[LoopPlayer] 再生失敗', reason);
    });
  }

  private fadeIn(fadeInMs: number): void {
    const param = this.gain.gain;
    const now = AudioPlayer.audioContext.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(0, now);
    param.linearRampToValueAtTime(this.volume, now + Math.max(fadeInMs, 1) / 1000);
  }

  private rampTo(target: number, seconds: number): void {
    const param = this.gain.gain;
    const now = AudioPlayer.audioContext.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + Math.max(seconds, 0.001));
  }

  private teardown(): void {
    if (this.stopTimer !== null) {
      clearTimeout(this.stopTimer);
      this.stopTimer = null;
    }
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source.buffer = null;
      this.source = null;
    }
    if (this.element) {
      this.element.pause();
      this.element.src = '';
      this.element.load();
      this.element = null;
    }
    if (this.elementSource) {
      this.elementSource.disconnect();
      this.elementSource = null;
    }
  }

  /**
   * The sound decoded for looping from memory, with the part that goes round where its file names
   * one, or null when it should be streamed instead.
   */
  private static async decodeForLoopAsync(
    audio: AudioFile
  ): Promise<{ buffer: AudioBuffer; region: { start: number; end: number } | null } | null> {
    const blob = audio.blob;
    if (!blob) return null;
    try {
      const data = await FileReaderUtil.readAsArrayBufferAsync(blob);
      const points = readAudioLoopPoints(new Uint8Array(data));
      const followsPoints =
        points !== null && loopPointsFitInMemory(points, AudioPlayer.audioContext.sampleRate, blob.size);
      if (!followsPoints && blob.size > LOOP_FROM_MEMORY_MAX_FILE_BYTES) return null;
      const buffer = await new Promise<AudioBuffer>((resolve, reject) =>
        AudioPlayer.audioContext.decodeAudioData(data, resolve, reject)
      );
      if (followsPoints) return { buffer, region: loopRegionOf(points, buffer.duration) };
      return buffer.length * buffer.numberOfChannels * 4 > LOOP_FROM_MEMORY_MAX_DECODED_BYTES
        ? null
        : { buffer, region: null };
    } catch (reason) {
      Logger.warn('[LoopPlayer] デコード失敗', reason);
      return null;
    }
  }
}
