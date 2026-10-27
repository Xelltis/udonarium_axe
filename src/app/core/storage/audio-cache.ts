import { Logger } from '@axe/core/logging/logger';
import { AudioFile, AudioState } from '@axe/core/storage/audio-file';
import { loopPointsFitInMemory, loopRegionOf, readAudioLoopPoints } from '@axe/core/storage/audio-loop-points';
import { AudioOutput } from '@axe/core/storage/audio-output';
import * as FileReaderUtil from '@axe/core/storage/file-reader-util';
import { PERF_SE_DECODE, perfCounters } from '@axe/core/util/perf-counters';

type FetchedCopy = { url: string; blob: Blob };
type DecodedEntry = { decoding: Promise<AudioBuffer | null>; bytes?: number };

/** A track decoded to loop between the points its file names, and where those fall in seconds. */
export type DecodedLoopTrack = { buffer: AudioBuffer; region: { start: number; end: number } };

/**
 * What the page keeps of its sounds for playing them: copies fetched of those only linked to, the
 * sound effects decoded, and the tracks decoded to loop between their points.
 */
export class AudioCache {
  private static readonly cacheMap = new Map<string, FetchedCopy>();
  private static readonly MAX_CACHE_SIZE = 100;

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

  /**
   * Where to stream an audio from. One only linked to streams from the copy fetched of it, which is
   * fetched in the background the first time so that later plays load locally.
   */
  static streamUrlOf(audio: AudioFile): string {
    if (audio.state !== AudioState.URL) return audio.url;
    const cache = AudioCache.cacheMap.get(audio.identifier);
    if (cache) return cache.url;
    void AudioCache.createCacheAsync(audio);
    return audio.url;
  }

  /**
   * A source ready to play an audio as a sound effect, from its decoded buffer, decoding it the
   * first time; null when it has no bytes to decode or cannot be decoded.
   */
  static async bufferSource(audio: AudioFile): Promise<AudioBufferSourceNode | null> {
    try {
      const entry = AudioCache.decodedBuffers.get(audio.identifier) ?? { decoding: AudioCache.decodeAsync(audio) };
      AudioCache.decodedBuffers.delete(audio.identifier);
      AudioCache.decodedBuffers.set(audio.identifier, entry);
      const decodedData = await entry.decoding;
      if (!decodedData) {
        AudioCache.forgetDecoded(audio.identifier, entry);
        return null;
      }
      AudioCache.keepDecodedWithinBudget(audio.identifier, entry, decodedData);
      const source = AudioOutput.context.createBufferSource();
      source.buffer = decodedData;
      return source;
    } catch (reason) {
      AudioCache.forgetDecoded(audio.identifier);
      Logger.warn('[AudioCache] バッファソース作成失敗', reason);
      return null;
    }
  }

  /** Whether a track may name loop points worth reading for: its file is on this device and not known to name none. */
  static mayLoopBetweenPoints(audio: AudioFile): boolean {
    if (AudioCache.loopFollowable.get(audio.identifier) === false) return false;
    return AudioCache.blobOf(audio) !== null;
  }

  /**
   * A track decoded to loop between the points its file names, decoding it unless it is among the
   * last kept; null, remembered, when the file names no loop, the track is too long to hold in
   * memory, or it cannot be decoded.
   */
  static loopTrack(audio: AudioFile): Promise<DecodedLoopTrack | null> {
    const identifier = audio.identifier;
    const kept = AudioCache.loopTracks.get(identifier);
    const entry = kept ?? AudioCache.decodeLoopTrackAsync(audio);
    AudioCache.loopTracks.delete(identifier);
    AudioCache.loopTracks.set(identifier, entry);
    while (AudioCache.loopTracks.size > AudioCache.MAX_LOOP_TRACKS) {
      const oldest = AudioCache.loopTracks.keys().next().value;
      if (typeof oldest !== 'string') break;
      AudioCache.loopTracks.delete(oldest);
    }
    return entry;
  }

  /** Forgets all that is kept for this audio, revoking the url of its fetched copy. */
  static forget(identifier: string): void {
    const cache = AudioCache.cacheMap.get(identifier);
    if (cache) {
      URL.revokeObjectURL(cache.url);
      AudioCache.cacheMap.delete(identifier);
    }
    AudioCache.decodedBuffers.delete(identifier);
    AudioCache.loopTracks.delete(identifier);
    AudioCache.loopFollowable.delete(identifier);
  }

  /** Forgets all that is kept for every audio, revoking the urls of the fetched copies. */
  static forgetAll(): void {
    for (const [, cache] of AudioCache.cacheMap) {
      URL.revokeObjectURL(cache.url);
    }
    AudioCache.cacheMap.clear();
    AudioCache.decodedBuffers.clear();
    AudioCache.loopTracks.clear();
    AudioCache.loopFollowable.clear();
  }

  private static evictCacheIfNeeded(): void {
    while (AudioCache.cacheMap.size > AudioCache.MAX_CACHE_SIZE) {
      const oldestKey = AudioCache.cacheMap.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      AudioCache.forget(oldestKey);
    }
  }

  private static async decodeAsync(audio: AudioFile): Promise<AudioBuffer | null> {
    let blob: Blob | undefined = audio.blob ?? undefined;
    if (audio.state === AudioState.URL) {
      const cache = AudioCache.cacheMap.get(audio.identifier);
      if (cache) {
        blob = cache.blob;
      } else {
        const createdCache = await AudioCache.createCacheAsync(audio);
        blob = createdCache?.blob ?? undefined;
      }
    }
    if (!blob) return null;
    return AudioCache.decodeAudioDataAsync(blob);
  }

  /** Drops a decoding that came to nothing, unless a later one has taken its place. */
  private static forgetDecoded(identifier: string, entry?: DecodedEntry): void {
    if (entry === undefined || AudioCache.decodedBuffers.get(identifier) === entry) {
      AudioCache.decodedBuffers.delete(identifier);
    }
  }

  /**
   * Records how much memory a finished decoding holds, then lets the least recently played buffers
   * go until what is kept fits the budget. A buffer over the budget on its own is dropped instead,
   * and decodings still under way are left, having no size yet.
   */
  private static keepDecodedWithinBudget(identifier: string, entry: DecodedEntry, buffer: AudioBuffer): void {
    if (entry.bytes !== undefined || AudioCache.decodedBuffers.get(identifier) !== entry) return;
    entry.bytes = buffer.length * buffer.numberOfChannels * 4;
    if (entry.bytes > AudioCache.MAX_DECODED_BYTES) {
      AudioCache.decodedBuffers.delete(identifier);
      return;
    }
    let kept = 0;
    for (const { bytes } of AudioCache.decodedBuffers.values()) kept += bytes ?? 0;
    for (const [key, { bytes }] of AudioCache.decodedBuffers) {
      if (kept <= AudioCache.MAX_DECODED_BYTES) break;
      if (bytes === undefined) continue;
      AudioCache.decodedBuffers.delete(key);
      kept -= bytes;
    }
  }

  private static async decodeAudioDataAsync(blob: Blob): Promise<AudioBuffer> {
    perfCounters.bump(PERF_SE_DECODE);
    const arrayBuffer = await FileReaderUtil.readAsArrayBufferAsync(blob);
    return new Promise<AudioBuffer>((resolve, reject) => {
      AudioOutput.context.decodeAudioData(
        arrayBuffer,
        (decodedData) => resolve(decodedData),
        (error) => reject(error)
      );
    });
  }

  private static blobOf(audio: AudioFile): Blob | null {
    return audio.blob ?? AudioCache.cacheMap.get(audio.identifier)?.blob ?? null;
  }

  /**
   * Reads where a track's file asks to loop and decodes it to loop there, or null, remembered, when
   * the file names no loop, the track is too long to hold in memory, or it cannot be decoded.
   */
  private static async decodeLoopTrackAsync(audio: AudioFile): Promise<DecodedLoopTrack | null> {
    const identifier = audio.identifier;
    const blob = AudioCache.blobOf(audio);
    let looped: DecodedLoopTrack | null = null;
    try {
      if (blob) {
        const data = await FileReaderUtil.readAsArrayBufferAsync(blob);
        const points = readAudioLoopPoints(new Uint8Array(data));
        if (points && loopPointsFitInMemory(points, AudioOutput.context.sampleRate, blob.size)) {
          const buffer = await new Promise<AudioBuffer>((resolve, reject) =>
            AudioOutput.context.decodeAudioData(data, resolve, reject)
          );
          const region = loopRegionOf(points, buffer.duration);
          if (region) looped = { buffer, region };
        }
      }
    } catch (reason) {
      Logger.warn('[AudioCache] ループ位置の読み込み失敗', reason);
    }
    AudioCache.loopFollowable.set(identifier, looped !== null);
    if (!looped) AudioCache.loopTracks.delete(identifier);
    return looped;
  }

  private static async getBlobAsync(audio: AudioFile): Promise<Blob> {
    if (audio.blob) return audio.blob;
    if (audio.url.length < 1) throw new Error('えっ なにそれ怖い');

    const response = await fetch(audio.url);
    if (!response.ok) throw new Error(`Network response was not ok: ${response.status} ${response.statusText}`);
    return response.blob();
  }

  private static async createCacheAsync(audio: AudioFile): Promise<FetchedCopy | null> {
    let blob: Blob;
    try {
      blob = await AudioCache.getBlobAsync(audio);
    } catch (e) {
      Logger.error('[AudioCache] キャッシュ作成失敗', e);
      return null;
    }

    if (AudioCache.cacheMap.has(audio.identifier)) {
      const existingCache = AudioCache.cacheMap.get(audio.identifier);
      if (existingCache) return existingCache;
    }

    const url = URL.createObjectURL(blob);
    const finalCache: FetchedCopy = { url, blob };
    AudioCache.cacheMap.set(audio.identifier, finalCache);
    AudioCache.evictCacheIfNeeded();
    return finalCache;
  }
}
