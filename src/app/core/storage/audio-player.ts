import { USER_GESTURE_EVENTS } from '@axe/core/input/user-interaction-unlock';
import { Logger } from '@axe/core/logging/logger';
import { AudioFile, AudioState } from '@axe/core/storage/audio-file';
import { loopPointsFitInMemory, loopRegionOf, readAudioLoopPoints } from '@axe/core/storage/audio-loop-points';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { LoopPointTrack } from '@axe/core/storage/loop-point-track';
import { PERF_SE_DECODE, perfCounters } from '@axe/core/util/perf-counters';

/**
 * The channels sound plays through, each with a volume of its own that the listener sets.
 *
 * Music, previews, sound effects and background sounds came first. Cut-ins, notifications, the
 * sounds of handling things on the table, and the sounds of effects were split off from the sound
 * effects so that each can be turned down or off on its own.
 */
export enum VolumeType {
  MASTER,
  AUDITION,
  SE,
  BACKGROUND,
  CUT_IN,
  NOTIFICATION,
  HANDLING,
  EFFECT,
}

/** Every channel, in the order of `VolumeType`. */
export const VOLUME_TYPES: readonly VolumeType[] = [
  VolumeType.MASTER,
  VolumeType.AUDITION,
  VolumeType.SE,
  VolumeType.BACKGROUND,
  VolumeType.CUT_IN,
  VolumeType.NOTIFICATION,
  VolumeType.HANDLING,
  VolumeType.EFFECT,
];

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}

type AudioCache = { url: string; blob: Blob };
type DecodedEntry = { decoding: Promise<AudioBuffer | null>; bytes?: number };
type DecodedLoopTrack = { buffer: AudioBuffer; region: { start: number; end: number } };

/** What was asked of a player while its track was still being read and decoded, to apply once it starts. */
type PendingStart = {
  position: number;
  paused: boolean;
  fade: { target: number; durationMs: number; requestedAt: number } | null;
};

export class AudioPlayer {
  private static _audioContext: AudioContext;
  /**
   * The one Web Audio context every player and sound effect on the page goes
   * through, created on first use.
   *
   * Browsers keep it suspended until the user interacts with the page; see `resumeAudioContext`.
   */
  static get audioContext(): AudioContext {
    if (!AudioPlayer._audioContext)
      AudioPlayer._audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return AudioPlayer._audioContext;
  }

  private static readonly channels = new Map<VolumeType, { volume: number; node?: GainNode }>();

  private static channel(type: VolumeType): { volume: number; node?: GainNode } {
    let channel = AudioPlayer.channels.get(type);
    if (!channel) {
      channel = { volume: 0.5 };
      AudioPlayer.channels.set(type, channel);
    }
    return channel;
  }

  /** The volume of one channel, from 0 to 1, which is half until it is set. */
  static channelVolume(type: VolumeType): number {
    return AudioPlayer.channel(type).volume;
  }

  /**
   * Sets the volume of one channel, from 0 to 1, for everything playing through it and all that plays
   * through it later.
   *
   * The channel glides to the new level over a few milliseconds rather than jumping.
   */
  static setChannelVolume(type: VolumeType, volume: number): void {
    AudioPlayer.channel(type).volume = volume;
    AudioPlayer.channelNode(type).gain.setTargetAtTime(volume, AudioPlayer.audioContext.currentTime, 0.01);
  }

  /**
   * The gain node of one channel, which the players and sounds of that kind connect to. Each channel
   * runs straight to the speakers, so one channel's volume never touches another's.
   */
  static channelNode(type: VolumeType): GainNode {
    const channel = AudioPlayer.channel(type);
    if (!channel.node) {
      const context = AudioPlayer.audioContext;
      const gain = context.createGain();
      gain.gain.setValueAtTime(channel.volume, context.currentTime);
      gain.connect(context.destination);
      channel.node = gain;
    }
    return channel.node;
  }

  /** The volume of the master channel, from 0 to 1, which players use unless given another volume type. */
  static get volume(): number {
    return AudioPlayer.channelVolume(VolumeType.MASTER);
  }
  static set volume(volume: number) {
    AudioPlayer.setChannelVolume(VolumeType.MASTER, volume);
  }

  /**
   * The volume of the audition channel, from 0 to 1, which the preview players of the jukebox and
   * of the cut-in music picker play through, on this device alone.
   */
  static get auditionVolume(): number {
    return AudioPlayer.channelVolume(VolumeType.AUDITION);
  }
  static set auditionVolume(auditionVolume: number) {
    AudioPlayer.setChannelVolume(VolumeType.AUDITION, auditionVolume);
  }

  /**
   * The volume of the sound-effect channel, from 0 to 1, which one-shot effects play through unless
   * given another kind, along with `playSE` and players set to the SE volume type.
   */
  static get seVolume(): number {
    return AudioPlayer.channelVolume(VolumeType.SE);
  }
  static set seVolume(seVolume: number) {
    AudioPlayer.setChannelVolume(VolumeType.SE, seVolume);
  }

  /**
   * The volume of the background channel, from 0 to 1, which the room's looping background sounds,
   * such as rain or a crowd, play through underneath the music.
   */
  static get backgroundVolume(): number {
    return AudioPlayer.channelVolume(VolumeType.BACKGROUND);
  }
  static set backgroundVolume(backgroundVolume: number) {
    AudioPlayer.setChannelVolume(VolumeType.BACKGROUND, backgroundVolume);
  }

  /** The master channel gain node, which players on the master volume type connect to. */
  static get rootNode(): AudioNode {
    return AudioPlayer.channelNode(VolumeType.MASTER);
  }
  /**
   * The audition channel gain node, which players on the audition volume type connect to: the
   * preview players of the jukebox and of the cut-in music picker.
   */
  static get auditionNode(): AudioNode {
    return AudioPlayer.channelNode(VolumeType.AUDITION);
  }
  /** The sound-effect channel gain node, which one-shot effects and SE players connect to. */
  static get seNode(): AudioNode {
    return AudioPlayer.channelNode(VolumeType.SE);
  }
  /** The background channel gain node, which the looping background sounds and background players connect to. */
  static get backgroundNode(): AudioNode {
    return AudioPlayer.channelNode(VolumeType.BACKGROUND);
  }

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
      this._mediaElementSource = AudioPlayer.audioContext.createMediaElementSource(this.audioElm);
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

  private static cacheMap: Map<string, AudioCache> = new Map();
  private static readonly MAX_CACHE_SIZE = 100;

  constructor(audio?: AudioFile) {
    this.audio = audio;
  }

  /**
   * Forgets the fetched copy and decoded sound effect held for this audio,
   * revoking the cached object URL.
   */
  static removeCache(identifier: string) {
    const cache = AudioPlayer.cacheMap.get(identifier);
    if (cache) {
      URL.revokeObjectURL(cache.url);
      AudioPlayer.cacheMap.delete(identifier);
    }
    AudioPlayer.decodedBuffers.delete(identifier);
    AudioPlayer.loopTracks.delete(identifier);
    AudioPlayer.loopFollowable.delete(identifier);
  }

  /** Forgets every fetched copy and decoded sound effect, revoking the cached object URLs. */
  static clearAllCache() {
    for (const [, cache] of AudioPlayer.cacheMap) {
      URL.revokeObjectURL(cache.url);
    }
    AudioPlayer.cacheMap.clear();
    AudioPlayer.decodedBuffers.clear();
    AudioPlayer.loopTracks.clear();
    AudioPlayer.loopFollowable.clear();
  }

  private static evictCacheIfNeeded() {
    while (AudioPlayer.cacheMap.size > AudioPlayer.MAX_CACHE_SIZE) {
      const oldestKey = AudioPlayer.cacheMap.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      AudioPlayer.removeCache(oldestKey);
    }
  }

  /**
   * Plays the audio once at the given volume, through the channel of its kind, and forgets about it.
   *
   * It goes through the sound-effect channel unless given another kind. Nothing is kept to stop it
   * with or to report it as playing; use `playSE` for an effect that may need stopping.
   */
  static play(audio: AudioFile, volume: number = 1.0, type: VolumeType = VolumeType.SE) {
    this.playBufferAsync(audio, volume, type);
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
    if (this.followsLoopPoints && AudioPlayer.mayLoopBetweenPoints(this.audio)) {
      this.pending = { position: 0, paused: false, fade: null };
      void this.playBetweenLoopPointsAsync(this.audio, attempt);
      return;
    }
    this.playThroughElement(attempt);
  }

  private playThroughElement(attempt: number): void {
    if (!this.audio) return;
    let url = this.audio.url;

    if (this.audio.state === AudioState.URL) {
      const cache = AudioPlayer.cacheMap.get(this.audio.identifier);
      if (cache) {
        url = cache.url;
      } else {
        AudioPlayer.createCacheAsync(this.audio);
      }
    }

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
    const looped = await AudioPlayer.loopTrackAsync(audio);
    const pending = this.pending;
    if (attempt !== this.playAttempt || !pending) return;
    this.pending = null;
    if (!looped) {
      this.playThroughElement(attempt);
      if (pending.position > 0) this.seekTo(pending.position);
      if (pending.paused) this.pause();
    } else {
      const track = new LoopPointTrack(
        AudioPlayer.audioContext,
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
    if (pending.fade) {
      const remaining = pending.fade.durationMs - (performance.now() - pending.fade.requestedAt);
      void this.fadeVolumeTo(pending.fade.target, Math.max(0, remaining));
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
   * Glides this player's volume to a target over a duration, resolving when it gets there.
   *
   * A later fade cuts an earlier one short, which then resolves where it stopped. With nothing
   * played yet, no real change or no duration, the volume is set and the promise resolves at once.
   */
  fadeVolumeTo(target: number, durationMs: number): Promise<void> {
    if (this.pending) {
      this.pending.fade = { target, durationMs, requestedAt: performance.now() };
      return new Promise((resolve) => setTimeout(resolve, Math.max(0, durationMs)));
    }
    if (this.track) {
      this._volume = target;
      return this.track.fadeTo(target, durationMs);
    }
    if (!this._audioElm) return Promise.resolve();
    const audioElm = this._audioElm;
    const startVol = audioElm.volume;
    if (Math.abs(startVol - target) < 1e-3 || durationMs <= 0) {
      audioElm.volume = target;
      this._volume = target;
      return Promise.resolve();
    }
    this._fadeToken += 1;
    const myToken = this._fadeToken;
    return new Promise((resolve) => {
      const startTime = performance.now();
      const tick = () => {
        if (this._audioElm !== audioElm || this._fadeToken !== myToken) return resolve();
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / durationMs, 1);
        const v = startVol + (target - startVol) * t;
        audioElm.volume = v;
        this._volume = v;
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
  }

  private _fadeToken = 0;

  /** Stops playback, rewinds and unloads the track; does nothing before anything has played. */
  stop() {
    this.playAttempt++;
    this._isAwaitingGesture = false;
    this.pending = null;
    if (this.track) {
      this.track.dispose();
      this.track = null;
    }
    if (!this._audioElm) return;
    this._audioElm.pause();
    this._audioElm.currentTime = 0;
    this._audioElm.src = '';
    this._audioElm.load();
    this._mediaElementSource?.disconnect();
  }

  private getConnectingAudioNode() {
    return AudioPlayer.channelNode(this.volumeType);
  }

  private static async playBufferAsync(audio: AudioFile, volume: number, type: VolumeType) {
    const source = await AudioPlayer.createBufferSourceAsync(audio);
    if (!source) return;

    const gain = AudioPlayer.audioContext.createGain();
    gain.gain.setValueAtTime(volume, AudioPlayer.audioContext.currentTime);

    gain.connect(AudioPlayer.channelNode(type));
    source.connect(gain);

    source.onended = () => {
      source.stop();
      source.disconnect();
      gain.disconnect();
      source.buffer = null;
    };

    source.start();
  }

  private static readonly seSources = new Map<string, Set<{ source: AudioBufferSourceNode; gain: GainNode }>>();
  private static readonly sePending = new Map<string, number>();

  /**
   * Plays the audio as a sound effect that `stopSE` can cut off and `isSePlaying` reports
   * from the moment it is asked for.
   *
   * The effect is decoded once and kept, so repeated and overlapping plays of it are cheap.
   */
  static playSE(audio: AudioFile): void {
    const identifier = audio.identifier;
    AudioPlayer.sePending.set(identifier, (AudioPlayer.sePending.get(identifier) ?? 0) + 1);
    AudioPlayer.playSeBufferAsync(audio, identifier);
  }

  /**
   * Stops every play of this sound effect that has started sounding.
   *
   * A play still being decoded stops being reported by `isSePlaying`, but it will
   * still sound once decoding finishes.
   */
  static stopSE(identifier: string): void {
    const entries = AudioPlayer.seSources.get(identifier);
    if (entries) {
      for (const { source, gain } of entries) {
        source.onended = null;
        source.stop();
        source.disconnect();
        gain.disconnect();
        source.buffer = null;
      }
      AudioPlayer.seSources.delete(identifier);
    }
    AudioPlayer.sePending.delete(identifier);
  }

  /**
   * Stops every sound effect started with `playSE`, with the same caveat as `stopSE`
   * for plays still being decoded.
   */
  static stopAllSE(): void {
    for (const identifier of [...AudioPlayer.seSources.keys()]) AudioPlayer.stopSE(identifier);
    AudioPlayer.sePending.clear();
  }

  /**
   * Whether a sound effect from `playSE` is sounding, or still being decoded, for this audio, which
   * the jukebox and sound board show as playing.
   */
  static isSePlaying(identifier: string): boolean {
    return (AudioPlayer.seSources.get(identifier)?.size ?? 0) > 0 || (AudioPlayer.sePending.get(identifier) ?? 0) > 0;
  }

  private static async playSeBufferAsync(audio: AudioFile, identifier: string): Promise<void> {
    const source = await AudioPlayer.createBufferSourceAsync(audio);
    const remaining = (AudioPlayer.sePending.get(identifier) ?? 1) - 1;
    if (remaining > 0) AudioPlayer.sePending.set(identifier, remaining);
    else AudioPlayer.sePending.delete(identifier);
    if (!source) return;

    const gain = AudioPlayer.audioContext.createGain();
    gain.gain.setValueAtTime(1, AudioPlayer.audioContext.currentTime);
    gain.connect(AudioPlayer.seNode);
    source.connect(gain);

    let entries = AudioPlayer.seSources.get(identifier);
    if (!entries) {
      entries = new Set();
      AudioPlayer.seSources.set(identifier, entries);
    }
    const set = entries;
    const entry = { source, gain };
    set.add(entry);

    source.onended = () => {
      source.stop();
      source.disconnect();
      gain.disconnect();
      source.buffer = null;
      set.delete(entry);
      if (set.size === 0) AudioPlayer.seSources.delete(identifier);
    };

    source.start();
  }

  /**
   * Decoded sound effects, by the audio they came from, least recently played first.
   *
   * Each play of an effect takes its buffer from here, and a buffer can feed any number of sources
   * at once. An entry is kept while its decoding is under way, so plays that overlap share one
   * decoding.
   *
   * Decoded audio is many times larger than its file, so the finished buffers kept here add up to
   * no more than `MAX_DECODED_BYTES`, the least recently played going first, and a buffer larger
   * than that on its own is played without being kept.
   */
  private static readonly decodedBuffers = new Map<string, DecodedEntry>();
  private static readonly MAX_DECODED_BYTES = 64 * 1024 * 1024;

  private static async createBufferSourceAsync(audio: AudioFile): Promise<AudioBufferSourceNode | null> {
    try {
      const entry = AudioPlayer.decodedBuffers.get(audio.identifier) ?? { decoding: AudioPlayer.decodeAsync(audio) };
      AudioPlayer.decodedBuffers.delete(audio.identifier);
      AudioPlayer.decodedBuffers.set(audio.identifier, entry);
      const decodedData = await entry.decoding;
      if (!decodedData) {
        AudioPlayer.forgetDecoded(audio.identifier, entry);
        return null;
      }
      AudioPlayer.keepDecodedWithinBudget(audio.identifier, entry, decodedData);
      const source = AudioPlayer.audioContext.createBufferSource();
      source.buffer = decodedData;
      return source;
    } catch (reason) {
      AudioPlayer.forgetDecoded(audio.identifier);
      Logger.warn('[AudioPlayer] バッファソース作成失敗', reason);
      return null;
    }
  }

  private static async decodeAsync(audio: AudioFile): Promise<AudioBuffer | null> {
    let blob: Blob | undefined = audio.blob ?? undefined;
    if (audio.state === AudioState.URL) {
      const cache = AudioPlayer.cacheMap.get(audio.identifier);
      if (cache) {
        blob = cache.blob;
      } else {
        const createdCache = await AudioPlayer.createCacheAsync(audio);
        blob = createdCache?.blob ?? undefined;
      }
    }
    if (!blob) return null;
    return AudioPlayer.decodeAudioDataAsync(blob);
  }

  /** Drops a decoding that came to nothing, unless a later one has taken its place. */
  private static forgetDecoded(identifier: string, entry?: DecodedEntry): void {
    if (entry === undefined || AudioPlayer.decodedBuffers.get(identifier) === entry) {
      AudioPlayer.decodedBuffers.delete(identifier);
    }
  }

  /**
   * Records how much memory a finished decoding holds, then lets the least recently played buffers
   * go until what is kept fits the budget. A buffer over the budget on its own is dropped instead,
   * and decodings still under way are left, having no size yet.
   */
  private static keepDecodedWithinBudget(identifier: string, entry: DecodedEntry, buffer: AudioBuffer): void {
    if (entry.bytes !== undefined || AudioPlayer.decodedBuffers.get(identifier) !== entry) return;
    entry.bytes = buffer.length * buffer.numberOfChannels * 4;
    if (entry.bytes > AudioPlayer.MAX_DECODED_BYTES) {
      AudioPlayer.decodedBuffers.delete(identifier);
      return;
    }
    let kept = 0;
    for (const { bytes } of AudioPlayer.decodedBuffers.values()) kept += bytes ?? 0;
    for (const [key, { bytes }] of AudioPlayer.decodedBuffers) {
      if (kept <= AudioPlayer.MAX_DECODED_BYTES) break;
      if (bytes === undefined) continue;
      AudioPlayer.decodedBuffers.delete(key);
      kept -= bytes;
    }
  }

  private static async decodeAudioDataAsync(blob: Blob): Promise<AudioBuffer> {
    perfCounters.bump(PERF_SE_DECODE);
    const arrayBuffer = await FileReaderUtil.readAsArrayBufferAsync(blob);
    return new Promise<AudioBuffer>((resolve, reject) => {
      AudioPlayer.audioContext.decodeAudioData(
        arrayBuffer,
        (decodedData) => resolve(decodedData),
        (error) => reject(error)
      );
    });
  }

  /**
   * Whether each track's file names loop points that can be followed, once its file has been read.
   * A track known to name none streams at once rather than being read again.
   */
  private static readonly loopFollowable = new Map<string, boolean>();

  /**
   * The tracks decoded to loop between their points, by the audio they came from, the most recently
   * played last. A decoded track takes many times the memory of its file, so only the last two are
   * kept, which is enough for one track to cross-fade into itself and to go back to the one before.
   */
  private static readonly loopTracks = new Map<string, Promise<DecodedLoopTrack | null>>();
  private static readonly MAX_LOOP_TRACKS = 2;

  /** Whether a track may name loop points worth reading for: its file is on this device and not known to name none. */
  private static mayLoopBetweenPoints(audio: AudioFile): boolean {
    if (AudioPlayer.loopFollowable.get(audio.identifier) === false) return false;
    return AudioPlayer.blobOf(audio) !== null;
  }

  private static blobOf(audio: AudioFile): Blob | null {
    return audio.blob ?? AudioPlayer.cacheMap.get(audio.identifier)?.blob ?? null;
  }

  private static loopTrackAsync(audio: AudioFile): Promise<DecodedLoopTrack | null> {
    const identifier = audio.identifier;
    const kept = AudioPlayer.loopTracks.get(identifier);
    const entry = kept ?? AudioPlayer.decodeLoopTrackAsync(audio);
    AudioPlayer.loopTracks.delete(identifier);
    AudioPlayer.loopTracks.set(identifier, entry);
    while (AudioPlayer.loopTracks.size > AudioPlayer.MAX_LOOP_TRACKS) {
      const oldest = AudioPlayer.loopTracks.keys().next().value;
      if (typeof oldest !== 'string') break;
      AudioPlayer.loopTracks.delete(oldest);
    }
    return entry;
  }

  /**
   * Reads where a track's file asks to loop and decodes it to loop there, or null, remembered, when
   * the file names no loop, the track is too long to hold in memory, or it cannot be decoded.
   */
  private static async decodeLoopTrackAsync(audio: AudioFile): Promise<DecodedLoopTrack | null> {
    const identifier = audio.identifier;
    const blob = AudioPlayer.blobOf(audio);
    let looped: DecodedLoopTrack | null = null;
    try {
      if (blob) {
        const data = await FileReaderUtil.readAsArrayBufferAsync(blob);
        const points = readAudioLoopPoints(new Uint8Array(data));
        if (points && loopPointsFitInMemory(points, AudioPlayer.audioContext.sampleRate, blob.size)) {
          const buffer = await new Promise<AudioBuffer>((resolve, reject) =>
            AudioPlayer.audioContext.decodeAudioData(data, resolve, reject)
          );
          const region = loopRegionOf(points, buffer.duration);
          if (region) looped = { buffer, region };
        }
      }
    } catch (reason) {
      Logger.warn('[AudioPlayer] ループ位置の読み込み失敗', reason);
    }
    AudioPlayer.loopFollowable.set(identifier, looped !== null);
    if (!looped) AudioPlayer.loopTracks.delete(identifier);
    return looped;
  }

  private static async getBlobAsync(audio: AudioFile): Promise<Blob> {
    if (audio.blob) return audio.blob;
    if (audio.url.length < 1) throw new Error('えっ なにそれ怖い');

    const response = await fetch(audio.url);
    if (!response.ok) throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    return response.blob();
  }

  private static async createCacheAsync(audio: AudioFile): Promise<AudioCache | null> {
    let blob: Blob;
    try {
      blob = await AudioPlayer.getBlobAsync(audio);
    } catch (e) {
      Logger.error('[AudioPlayer] キャッシュ作成失敗', e);
      return null;
    }

    if (AudioPlayer.cacheMap.has(audio.identifier)) {
      const existingCache = AudioPlayer.cacheMap.get(audio.identifier);
      if (existingCache) return existingCache;
    }

    const url = URL.createObjectURL(blob);
    const finalCache: AudioCache = { url, blob };
    AudioPlayer.cacheMap.set(audio.identifier, finalCache);
    AudioPlayer.evictCacheIfNeeded();
    return finalCache;
  }

  /**
   * Starts the audio context on a gesture the browser counts, and again whenever it stops.
   *
   * iOS lets a context start from a finger lifting, a press or a key, but not from a touch that
   * has only begun. It stops the context again when the page is put away or a call comes in, so
   * the listeners stay until the context is running and come back whenever it is not.
   */
  static resumeAudioContext() {
    let watching = false;
    const listen = () => {
      for (const type of USER_GESTURE_EVENTS) document.addEventListener(type, resume, true);
    };
    const stopListening = () => {
      for (const type of USER_GESTURE_EVENTS) document.removeEventListener(type, resume, true);
    };
    const resume = () => {
      const context = AudioPlayer.audioContext;
      if (!watching) {
        watching = true;
        context.addEventListener?.('statechange', () => {
          if (context.state !== 'running') listen();
        });
      }
      void Promise.resolve(context.resume()).then(
        () => {
          if (context.state === 'running') stopListening();
        },
        () => undefined
      );
    };
    listen();
  }
}
