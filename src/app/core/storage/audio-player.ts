import { Logger } from '@axe/core/logging/logger';
import { AudioCache } from '@axe/core/storage/audio-cache';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput, VolumeType } from '@axe/core/storage/audio-output';
import { LoopPointTrack } from '@axe/core/storage/loop-point-track';

/** What was asked of a player while its track was still being read and decoded, to apply once it starts. */
type PendingStart = {
  position: number;
  paused: boolean;
};

/**
 * One track at a time played through a channel of the page's audio output, streamed through an
 * `<audio>` element or, while it follows loop points, played from memory between them.
 */
export class AudioPlayer {
  private _audioElm: HTMLAudioElement | undefined;
  private get audioElm(): HTMLAudioElement {
    if (!this._audioElm) {
      this._audioElm = new Audio();
      this._audioElm.volume = this._volume;
      this._audioElm.loop = this._loop;
      this._audioElm.onpause = () => {
        this.mediaElementSource.disconnect();
      };
      this._audioElm.onended = () => {
        this.mediaElementSource.disconnect();
        this.onEnded?.();
      };
    }
    return this._audioElm;
  }

  private _mediaElementSource: MediaElementAudioSourceNode | undefined;
  private get mediaElementSource(): MediaElementAudioSourceNode {
    if (!this._mediaElementSource)
      this._mediaElementSource = AudioOutput.context.createMediaElementSource(this.audioElm);
    return this._mediaElementSource;
  }

  audio: AudioFile | undefined;
  volumeType: VolumeType = VolumeType.MASTER;
  onEnded: (() => void) | null = null;

  /**
   * Whether a track whose file names where it loops is played from memory, going round between
   * those points while the player loops and playing on to its end while it does not.
   *
   * Off, as it starts, every track streams through an `<audio>` element and loops whole. A track
   * that names no loop, that is too long to hold in memory, or whose file is not on this device yet
   * streams either way.
   */
  followsLoopPoints = false;

  private track: LoopPointTrack | null = null;
  private pending: PendingStart | null = null;
  private trimNode: GainNode | null = null;
  private trimRoutedTo: VolumeType | null = null;
  private _trim = 1;

  private _volume: number = 1;
  private _loop: boolean = false;

  /**
   * This player's own volume, from 0 to 1, applied on top of its channel's volume.
   *
   * It can be set before anything has played and carries over once the player starts.
   */
  get volume(): number {
    if (this.track) return this.track.volume;
    if (this.pending) return this._volume;
    return this._audioElm?.volume ?? this._volume;
  }
  set volume(volume: number) {
    this._volume = volume;
    if (this.track) this.track.volume = volume;
    if (this._audioElm) this._audioElm.volume = volume;
  }
  /**
   * How much this player's sound is turned up or down before its channel, as a factor that may be
   * above 1, apart from its volume and its fader. It levels one track against another.
   *
   * It can be set before anything has played; set while playing, it takes effect at once.
   */
  get trim(): number {
    return this._trim;
  }
  set trim(trim: number) {
    this._trim = trim;
    const node = this.trimNode;
    if (!node) return;
    const now = AudioOutput.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(trim, now);
  }

  /** Moves the trim to a new factor in a straight line over some seconds, so a track already playing changes level without a jump. */
  glideTrim(trim: number, seconds: number): void {
    this._trim = trim;
    const node = this.trimNode;
    if (!node) return;
    const now = AudioOutput.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(trim, now + Math.max(0.01, seconds));
  }

  /** Whether the track starts again when it ends; like the volume, it can be set before anything plays. */
  get loop(): boolean {
    if (this.track || this.pending) return this._loop;
    return this._audioElm?.loop ?? this._loop;
  }
  set loop(loop: boolean) {
    this._loop = loop;
    if (this.track) this.track.loop = loop;
    if (this._audioElm) this._audioElm.loop = loop;
  }
  /**
   * Whether the track asked for is still being read and decoded to loop between its points, so
   * nothing of it sounds yet.
   */
  get isLoading(): boolean {
    return this.pending !== null && !this.pending.paused;
  }

  /** Whether nothing is playing, which is also true before the player has played anything. */
  get paused(): boolean {
    if (this.pending) return this.pending.paused;
    if (this.track) return !this.track.isPlaying;
    return this._audioElm?.paused ?? true;
  }

  private _isAwaitingGesture = false;
  private playAttempt = 0;
  /**
   * Whether the browser refused the latest play because the user had not yet interacted with the
   * page, so a later gesture may start it. False before anything has played, while a play is still
   * settling, once the player is stopped, and when a play failed for any other reason, such as a
   * track that cannot be loaded.
   */
  get isAwaitingGesture(): boolean {
    return this._isAwaitingGesture;
  }

  /** The playback position in seconds, or 0 before anything has played. */
  get currentTime(): number {
    if (this.pending) return this.pending.position;
    if (this.track) return this.track.position;
    return this._audioElm?.currentTime ?? 0;
  }

  /**
   * The loaded track's length in seconds: 0 before anything has played, and NaN
   * while the track is still loading.
   */
  get duration(): number {
    if (this.pending) return NaN;
    if (this.track) return this.track.duration;
    return this._audioElm?.duration ?? 0;
  }

  constructor(audio?: AudioFile) {
    this.audio = audio;
  }

  /**
   * Plays a track from the start through this player's channel, replacing whatever it was playing.
   *
   * With no audio passed it plays the current one again, and does nothing if there is none. For
   * link-only audio the bytes are also fetched into a cache in the background so later plays load
   * locally. A browser refusing to start playback is logged, not thrown, and a refusal for want of
   * a gesture is kept as `isAwaitingGesture` until the next play.
   *
   * While the player follows loop points, a track whose file may name some is read first, and
   * decoded when it does; what is asked of the player meanwhile is kept and applied once it starts.
   */
  play(audio?: AudioFile) {
    this.stop();
    const attempt = ++this.playAttempt;
    this._isAwaitingGesture = false;
    if (audio !== undefined) this.audio = audio;
    if (!this.audio) return;
    if (this.followsLoopPoints && AudioCache.mayLoopBetweenPoints(this.audio)) {
      this.pending = { position: 0, paused: false };
      void this.playBetweenLoopPointsAsync(this.audio, attempt);
      return;
    }
    this.playThroughElement(attempt);
  }

  private playThroughElement(attempt: number): void {
    if (!this.audio) return;
    const url = AudioCache.streamUrlOf(this.audio);
    this.mediaElementSource.connect(this.getConnectingAudioNode());
    this.audioElm.src = url;
    this.audioElm.load();
    this.audioElm.play().catch((reason) => {
      if (attempt === this.playAttempt) {
        this._isAwaitingGesture = (reason as { name?: unknown } | null)?.name === 'NotAllowedError';
      }
      Logger.warn('[AudioPlayer] 再生失敗', reason);
    });
  }

  private async playBetweenLoopPointsAsync(audio: AudioFile, attempt: number): Promise<void> {
    const looped = await AudioCache.loopTrack(audio);
    const pending = this.pending;
    if (attempt !== this.playAttempt || !pending) return;
    this.pending = null;
    if (!looped) {
      this.playThroughElement(attempt);
      if (pending.position > 0) this.seekTo(pending.position);
      if (pending.paused) this.pause();
    } else {
      const track = new LoopPointTrack(
        AudioOutput.context,
        looped.buffer,
        looped.region,
        this.getConnectingAudioNode(),
        this._volume,
        this._loop
      );
      track.onEnded = () => this.onEnded?.();
      this.track = track;
      if (pending.paused) track.seek(pending.position);
      else track.start(pending.position);
    }
  }

  /** Pauses playback where it is, keeping the position; does nothing before anything has played. */
  pause() {
    if (this.pending) this.pending.paused = true;
    else if (this.track) this.track.pause();
    else this._audioElm?.pause();
  }

  /**
   * Moves playback to a position in seconds; does nothing before anything has played.
   *
   * If the track's metadata has not loaded yet, the move waits for it, since browsers
   * ignore a position set earlier.
   */
  seekTo(time: number) {
    if (this.pending) {
      this.pending.position = time;
      return;
    }
    if (this.track) {
      this.track.seek(time);
      return;
    }
    if (!this._audioElm) return;
    // Some browsers ignore currentTime before HAVE_METADATA; defer to the loadedmetadata event.
    if (this._audioElm.readyState >= 1) {
      this._audioElm.currentTime = time;
    } else {
      const elm = this._audioElm;
      const handler = () => {
        elm.removeEventListener('loadedmetadata', handler);
        elm.currentTime = time;
      };
      elm.addEventListener('loadedmetadata', handler);
    }
  }

  /**
   * Slows the track to a stop over the time given, its pitch falling as a record's does when the
   * turntable is switched off, then pauses it. Resolves once it has stopped, and at once when
   * nothing is sounding.
   *
   * A track played from memory slows on the audio clock; a streamed one is slowed in steps, as an
   * element's rate cannot be scheduled. A track played or stopped meanwhile is left alone: it plays
   * at its own speed and is not paused.
   */
  brake(durationMs: number): Promise<void> {
    const attempt = this.playAttempt;
    if (this.track) {
      return this.track.brake(durationMs).then(() => {
        if (attempt === this.playAttempt) this.pause();
      });
    }
    const element = this._audioElm;
    if (this.pending || !element || element.paused || durationMs <= 0) {
      this.pause();
      return Promise.resolve();
    }
    const pitched = element as HTMLAudioElement & { webkitPreservesPitch?: boolean; mozPreservesPitch?: boolean };
    const setPreservesPitch = (preserves: boolean) => {
      pitched.preservesPitch = preserves;
      pitched.webkitPreservesPitch = preserves;
      pitched.mozPreservesPitch = preserves;
    };
    setPreservesPitch(false);
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        const done = Math.min(1, (performance.now() - startedAt) / durationMs);
        const superseded = attempt !== this.playAttempt;
        if (done >= 1 || superseded || element.paused) {
          clearInterval(timer);
          if (!superseded) element.pause();
          element.playbackRate = 1;
          setPreservesPitch(true);
          resolve();
          return;
        }
        element.playbackRate = Math.max(AudioPlayer.SLOWEST_ELEMENT_RATE, 1 - done);
      }, AudioPlayer.BRAKE_STEP_MS);
    });
  }

  private static readonly SLOWEST_ELEMENT_RATE = 0.07;
  private static readonly BRAKE_STEP_MS = 30;

  /**
   * Where the player's fader stands, from 0 to 1. It multiplies the volume, and fades move it, so a
   * fade leaves the volume as it was set. It can be set before anything has played.
   */
  get fader(): number {
    return this._fader;
  }
  set fader(level: number) {
    this.endFade();
    this._fader = level;
    const node = this.faderNode;
    if (!node) return;
    const now = AudioOutput.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(level, now);
  }

  /**
   * Glides the player's fader to a target over a duration on the audio clock, resolving when it
   * gets there, so a fade goes on in a tab put in the background.
   *
   * A later fade cuts an earlier one short, which then resolves where it stopped. While the track
   * is still being read the fade runs all the same, and the track comes in partway through it once
   * it starts. Before anything has played, or with no duration, the fader is set and the promise
   * resolves at once.
   */
  fadeVolumeTo(target: number, durationMs: number): Promise<void> {
    if (!this.faderNode && this.pending) this.getConnectingAudioNode();
    const node = this.faderNode;
    if (!node || durationMs <= 0) {
      this.fader = target;
      return Promise.resolve();
    }
    this.endFade();
    this._fader = target;
    const now = AudioOutput.context.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(target, now + durationMs / 1000);
    return new Promise((resolve) => {
      this.fadeDone = resolve;
      this.fadeTimer = setTimeout(() => this.endFade(), durationMs);
    });
  }

  private endFade(): void {
    if (this.fadeTimer !== null) clearTimeout(this.fadeTimer);
    this.fadeTimer = null;
    const done = this.fadeDone;
    this.fadeDone = null;
    done?.();
  }

  private _fader = 1;
  private faderNode: GainNode | null = null;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private fadeDone: (() => void) | null = null;

  /** Stops playback, rewinds and unloads the track; does nothing before anything has played. */
  stop() {
    this.playAttempt++;
    this._isAwaitingGesture = false;
    this.pending = null;
    if (this.track) {
      this.track.dispose();
      this.track = null;
    }
    this.endFade();
    this.trimNode?.disconnect();
    this.trimRoutedTo = null;
    if (!this._audioElm) return;
    this._audioElm.pause();
    this._audioElm.currentTime = 0;
    this._audioElm.src = '';
    this._audioElm.load();
    this._mediaElementSource?.disconnect();
  }

  /**
   * Where the player's sound goes in: its fader, then its trim, made the first time it plays and
   * run into the channel of its volume type.
   */
  private getConnectingAudioNode(): AudioNode {
    const context = AudioOutput.context;
    if (!this.trimNode) {
      this.trimNode = context.createGain();
      this.trimNode.gain.setValueAtTime(this._trim, context.currentTime);
    }
    if (!this.faderNode) {
      this.faderNode = context.createGain();
      this.faderNode.gain.setValueAtTime(this._fader, context.currentTime);
      this.faderNode.connect(this.trimNode);
    }
    if (this.trimRoutedTo !== this.volumeType) {
      if (this.trimRoutedTo !== null) this.trimNode.disconnect();
      this.trimNode.connect(AudioOutput.channelInput(this.volumeType));
      this.trimRoutedTo = this.volumeType;
    }
    return this.faderNode;
  }
}
