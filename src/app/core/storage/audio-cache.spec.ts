import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioCache } from '@axe/core/storage/audio-cache';
import { AudioFile } from '@axe/core/storage/audio-file';
import { type AudioContextMock, audioFileWith, installWebAudioMock } from '@axe/testing/web-audio-mock';

type AudioCachePrivateStatic = {
  cacheMap: Map<string, { url: string; blob: Blob }>;
  MAX_CACHE_SIZE: number;
  MAX_DECODED_BYTES: number;
  evictCacheIfNeeded: () => void;
  createCacheAsync: (audio: AudioFile) => Promise<{ url: string; blob: Blob } | null>;
};

const audioCachePrivate = AudioCache as unknown as AudioCachePrivateStatic;

describe('AudioCache', () => {
  let audioCtxMock: AudioContextMock;

  beforeEach(() => {
    Logger.setLevel(LogLevel.DEBUG);
    ({ context: audioCtxMock } = installWebAudioMock());
    AudioCache.forgetAll();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('decoding a sound effect', () => {
    it('decodes it once however often it is asked for, overlapping asks included', async () => {
      const audio = audioFileWith({ identifier: 'se-once', blob: new Blob(['x']) });

      await Promise.all([AudioCache.bufferSource(audio), AudioCache.bufferSource(audio)]);
      await AudioCache.bufferSource(audio);

      expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(3);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(1);
    });

    it('decodes it again once the cache is cleared', async () => {
      const audio = audioFileWith({ identifier: 'se-cleared', blob: new Blob(['x']) });

      await AudioCache.bufferSource(audio);
      AudioCache.forgetAll();
      await AudioCache.bufferSource(audio);

      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(2);
    });

    const STEREO = 2;
    const BYTES_PER_STEREO_FRAME = STEREO * 4;

    function decodesInTurn(...frameCounts: number[]) {
      const queue = [...frameCounts];
      audioCtxMock.decodeAudioData.mockImplementation(
        (_buf: ArrayBuffer, resolve: (b: AudioBuffer) => void, _reject: (e: DOMException) => void) => {
          const length = queue.length > 1 ? queue.shift()! : queue[0];
          resolve({ duration: length / 48000, length, numberOfChannels: STEREO } as AudioBuffer);
        }
      );
    }

    it('keeps decoded effects within a byte budget, letting the least recently played go first', async () => {
      decodesInTurn(Math.floor((audioCachePrivate.MAX_DECODED_BYTES * 0.4) / BYTES_PER_STEREO_FRAME));
      const a = audioFileWith({ identifier: 'se-budget-a', blob: new Blob(['a']) });
      const b = audioFileWith({ identifier: 'se-budget-b', blob: new Blob(['b']) });
      const c = audioFileWith({ identifier: 'se-budget-c', blob: new Blob(['c']) });

      await AudioCache.bufferSource(a);
      await AudioCache.bufferSource(b);
      await AudioCache.bufferSource(a);
      await AudioCache.bufferSource(c);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);

      await AudioCache.bufferSource(a);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);
      await AudioCache.bufferSource(b);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(4);
    });

    it('decodes a clip larger than the whole budget without keeping it or pushing out the rest', async () => {
      const tooLarge = Math.floor(audioCachePrivate.MAX_DECODED_BYTES / BYTES_PER_STEREO_FRAME) + 1;
      decodesInTurn(48000, tooLarge);
      const short = audioFileWith({ identifier: 'se-short', blob: new Blob(['s']) });
      const long = audioFileWith({ identifier: 'se-long', blob: new Blob(['l']) });

      await AudioCache.bufferSource(short);
      await AudioCache.bufferSource(long);
      await AudioCache.bufferSource(long);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);

      await AudioCache.bufferSource(short);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);
    });
  });

  describe('getBlobAsync (via createCacheAsync)', () => {
    it('logs and returns nothing on a bad response', async () => {
      const af = audioFileWith({ url: 'http://example.com/fail.mp3', identifier: 'gb1' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await audioCachePrivate.createCacheAsync(af);
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('throws with neither a url nor bytes', async () => {
      const af = audioFileWith({ identifier: 'gb2' }); // url='', blob=null
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await audioCachePrivate.createCacheAsync(af);
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns the bytes it already has without fetching', async () => {
      const blob = new Blob(['data']);
      const af = audioFileWith({ blob, identifier: 'gb3' });

      const result = await audioCachePrivate.createCacheAsync(af);
      expect(result).not.toBeNull();
      expect(result?.blob).toBe(blob);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns the existing cache for the same identifier', async () => {
      const blob = new Blob(['data']);
      const af = audioFileWith({ blob, identifier: 'gb4' });
      const existingCache = { url: 'blob:existing', blob: new Blob(['existing']) };
      audioCachePrivate.cacheMap.set('gb4', existingCache);

      const result = await audioCachePrivate.createCacheAsync(af);
      expect(result).toBe(existingCache);
    });

    it('registers the cache on success', async () => {
      const blob = new Blob(['data']);
      const af = audioFileWith({ blob, identifier: 'gb5' });

      await audioCachePrivate.createCacheAsync(af);
      expect(audioCachePrivate.cacheMap.has('gb5')).toBe(true);
    });
  });

  describe('forget()', () => {
    it('drops a cache and releases its url', () => {
      const cache = { url: 'blob:test-url', blob: new Blob(['data']) };
      audioCachePrivate.cacheMap.set('remove-test', cache);

      AudioCache.forget('remove-test');

      expect(audioCachePrivate.cacheMap.has('remove-test')).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('survives dropping a cache that is not there', () => {
      expect(() => AudioCache.forget('nonexistent')).not.toThrow();
    });
  });

  describe('forgetAll()', () => {
    it('drops every cache and releases their urls', () => {
      const cache1 = { url: 'blob:url-1', blob: new Blob(['data1']) };
      const cache2 = { url: 'blob:url-2', blob: new Blob(['data2']) };
      audioCachePrivate.cacheMap.set('clear-1', cache1);
      audioCachePrivate.cacheMap.set('clear-2', cache2);

      AudioCache.forgetAll();

      expect(audioCachePrivate.cacheMap.size).toBe(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-2');
    });
  });

  describe('cache eviction', () => {
    it('drops the oldest entries once the cache is full', async () => {
      const maxSize = audioCachePrivate.MAX_CACHE_SIZE;

      // Fill cache to max
      for (let i = 0; i < maxSize + 5; i++) {
        const cache = { url: `blob:url-${i}`, blob: new Blob([`data-${i}`]) };
        audioCachePrivate.cacheMap.set(`evict-${i}`, cache);
      }

      audioCachePrivate.evictCacheIfNeeded();

      expect(audioCachePrivate.cacheMap.size).toBe(maxSize);
      // Oldest entries should be removed
      expect(audioCachePrivate.cacheMap.has('evict-0')).toBe(false);
      // Newest entries should remain
      expect(audioCachePrivate.cacheMap.has(`evict-${maxSize + 4}`)).toBe(true);
    });
  });
});
