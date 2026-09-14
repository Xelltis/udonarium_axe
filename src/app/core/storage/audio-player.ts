import { USER_GESTURE_EVENTS } from '@axe/core/input/user-interaction-unlock';
import { Logger } from '@axe/core/logging/logger';
import { AudioFile, AudioState } from '@axe/core/storage/audio-file';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { PERF_SE_DECODE, perfCounters } from '@axe/core/util/perf-counters';

export enum VolumeType {
  MASTER,
  AUDITION,
  SE,
}

declare global {
  interface Window {
    AudioContext: typeof AudioContext;
    webkitAudioContext: typeof AudioContext;
  }
}

type AudioCache = { url: string; blob: Blob };

export class AudioPlayer {
  private static _audioContext: AudioContext;
  static get audioContext(): AudioContext {
    if (!AudioPlayer._audioContext)
      AudioPlayer._audioContext = new (window.AudioContext || window.webkitAudioContext)();
    return AudioPlayer._audioContext;
  }

  private static _volume: number = 0.5;
  static get volume(): number {
    return AudioPlayer._volume;
  }
  static set volume(volume: number) {
    AudioPlayer._volume = volume;
    AudioPlayer.masterGainNode.gain.setTargetAtTime(AudioPlayer._volume, AudioPlayer.audioContext.currentTime, 0.01);
  }

  private static _auditionVolume: number = 0.5;
  static get auditionVolume(): number {
    return AudioPlayer._auditionVolume;
  }
  static set auditionVolume(auditionVolume: number) {
    AudioPlayer._auditionVolume = auditionVolume;
    AudioPlayer.auditionGainNode.gain.setTargetAtTime(
      AudioPlayer._auditionVolume,
      AudioPlayer.audioContext.currentTime,
      0.01
    );
  }

  private static _masterGainNode: GainNode;
  private static get masterGainNode(): GainNode {
    if (!AudioPlayer._masterGainNode) {
      const masterGain = AudioPlayer.audioContext.createGain();
      masterGain.gain.setValueAtTime(AudioPlayer._volume, AudioPlayer.audioContext.currentTime);
      masterGain.connect(AudioPlayer.audioContext.destination);
      AudioPlayer._masterGainNode = masterGain;
    }
    return AudioPlayer._masterGainNode;
  }

  private static _auditionGainNode: GainNode;
  private static get auditionGainNode(): GainNode {
    if (!AudioPlayer._auditionGainNode) {
      const auditionGain = AudioPlayer.audioContext.createGain();
      auditionGain.gain.setValueAtTime(AudioPlayer._auditionVolume, AudioPlayer.audioContext.currentTime);
      auditionGain.connect(AudioPlayer.audioContext.destination);
      AudioPlayer._auditionGainNode = auditionGain;
    }
    return AudioPlayer._auditionGainNode;
  }

  private static _seVolume: number = 0.5;
  static get seVolume(): number {
    return AudioPlayer._seVolume;
  }
  static set seVolume(seVolume: number) {
    AudioPlayer._seVolume = seVolume;
    AudioPlayer.seGainNode.gain.setTargetAtTime(AudioPlayer._seVolume, AudioPlayer.audioContext.currentTime, 0.01);
  }

  private static _seGainNode: GainNode;
  private static get seGainNode(): GainNode {
    if (!AudioPlayer._seGainNode) {
      const seGain = AudioPlayer.audioContext.createGain();
      seGain.gain.setValueAtTime(AudioPlayer._seVolume, AudioPlayer.audioContext.currentTime);
      seGain.connect(AudioPlayer.audioContext.destination);
      AudioPlayer._seGainNode = seGain;
    }
    return AudioPlayer._seGainNode;
  }

  static get rootNode(): AudioNode {
    return AudioPlayer.masterGainNode;
  }
  static get auditionNode(): AudioNode {
    return AudioPlayer.auditionGainNode;
  }
  static get seNode(): AudioNode {
    return AudioPlayer.seGainNode;
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

  private _volume: number = 1;
  private _loop: boolean = false;

  get volume(): number {
    return this._audioElm?.volume ?? this._volume;
  }
  set volume(volume: number) {
    this._volume = volume;
    if (this._audioElm) this._audioElm.volume = volume;
  }
  get loop(): boolean {
    return this._audioElm?.loop ?? this._loop;
  }
  set loop(loop: boolean) {
    this._loop = loop;
    if (this._audioElm) this._audioElm.loop = loop;
  }
  get paused(): boolean {
    return this._audioElm?.paused ?? true;
  }

  get currentTime(): number {
    return this._audioElm?.currentTime ?? 0;
  }

  get duration(): number {
    return this._audioElm?.duration ?? 0;
  }

  private static cacheMap: Map<string, AudioCache> = new Map();
  private static readonly MAX_CACHE_SIZE = 100;

  constructor(audio?: AudioFile) {
    this.audio = audio;
  }

  static removeCache(identifier: string) {
    const cache = AudioPlayer.cacheMap.get(identifier);
    if (cache) {
      URL.revokeObjectURL(cache.url);
      AudioPlayer.cacheMap.delete(identifier);
    }
    AudioPlayer.decodedBuffers.delete(identifier);
  }

  static clearAllCache() {
    for (const [, cache] of AudioPlayer.cacheMap) {
      URL.revokeObjectURL(cache.url);
    }
    AudioPlayer.cacheMap.clear();
    AudioPlayer.decodedBuffers.clear();
  }

  private static evictCacheIfNeeded() {
    while (AudioPlayer.cacheMap.size > AudioPlayer.MAX_CACHE_SIZE) {
      const oldestKey = AudioPlayer.cacheMap.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      AudioPlayer.removeCache(oldestKey);
    }
  }

  static play(audio: AudioFile, volume: number = 1.0) {
    this.playBufferAsync(audio, volume);
  }

  play(audio?: AudioFile) {
    this.stop();
    if (audio !== undefined) this.audio = audio;
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
      Logger.warn('[AudioPlayer] 再生失敗', reason);
    });
  }

  pause() {
    this._audioElm?.pause();
  }

  seekTo(time: number) {
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

  fadeVolumeTo(target: number, durationMs: number): Promise<void> {
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

  stop() {
    if (!this._audioElm) return;
    this._audioElm.pause();
    this._audioElm.currentTime = 0;
    this._audioElm.src = '';
    this._audioElm.load();
    this._mediaElementSource?.disconnect();
  }

  private getConnectingAudioNode() {
    switch (this.volumeType) {
      case VolumeType.AUDITION:
        return AudioPlayer.auditionNode;
      case VolumeType.SE:
        return AudioPlayer.seNode;
      default:
        return AudioPlayer.rootNode;
    }
  }

  private static async playBufferAsync(audio: AudioFile, volume: number = 1.0) {
    const source = await AudioPlayer.createBufferSourceAsync(audio);
    if (!source) return;

    const gain = AudioPlayer.audioContext.createGain();
    gain.gain.setValueAtTime(volume, AudioPlayer.audioContext.currentTime);

    gain.connect(AudioPlayer.seNode);
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

  static playSE(audio: AudioFile): void {
    const identifier = audio.identifier;
    AudioPlayer.sePending.set(identifier, (AudioPlayer.sePending.get(identifier) ?? 0) + 1);
    AudioPlayer.playSeBufferAsync(audio, identifier);
  }

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

  static stopAllSE(): void {
    for (const identifier of [...AudioPlayer.seSources.keys()]) AudioPlayer.stopSE(identifier);
    AudioPlayer.sePending.clear();
  }

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
   * Decoded sound effects, by the audio they came from, oldest first.
   *
   * A sound effect used to be read and decoded afresh on every play, so each die rolled and
   * each message chimed paid for the decoding again. A decoded buffer can feed any number of
   * sources at once, and a promise kept here lets plays that overlap share one decoding.
   */
  private static readonly decodedBuffers = new Map<string, Promise<AudioBuffer | null>>();
  private static readonly MAX_DECODED_BUFFERS = 64;

  private static async createBufferSourceAsync(audio: AudioFile): Promise<AudioBufferSourceNode | null> {
    try {
      let decoding = AudioPlayer.decodedBuffers.get(audio.identifier);
      if (!decoding) {
        decoding = AudioPlayer.decodeAsync(audio);
        AudioPlayer.decodedBuffers.set(audio.identifier, decoding);
        while (AudioPlayer.decodedBuffers.size > AudioPlayer.MAX_DECODED_BUFFERS) {
          const oldest = AudioPlayer.decodedBuffers.keys().next().value;
          if (typeof oldest !== 'string') break;
          AudioPlayer.decodedBuffers.delete(oldest);
        }
      }
      const decodedData = await decoding;
      if (!decodedData) {
        AudioPlayer.forgetDecoded(audio.identifier, decoding);
        return null;
      }
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
  private static forgetDecoded(identifier: string, decoding?: Promise<AudioBuffer | null>): void {
    if (decoding === undefined || AudioPlayer.decodedBuffers.get(identifier) === decoding) {
      AudioPlayer.decodedBuffers.delete(identifier);
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
