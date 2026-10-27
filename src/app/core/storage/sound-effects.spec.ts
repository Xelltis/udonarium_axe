import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioCache } from '@axe/core/storage/audio-cache';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput, VolumeType } from '@axe/core/storage/audio-output';
import { SoundEffects } from '@axe/core/storage/sound-effects';
import {
  type AudioBufferSourceNodeMock,
  type AudioContextMock,
  audioFileWith,
  type GainNodeMock,
  installWebAudioMock,
} from '@axe/testing/web-audio-mock';

const audioCachePrivate = AudioCache as unknown as { cacheMap: Map<string, { url: string; blob: Blob }> };

describe('SoundEffects', () => {
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

  describe('a sound effect', () => {
    it('plays it at the level asked, through the sound-effect channel', async () => {
      const audio = audioFileWith({ identifier: 'se-level', blob: new Blob(['x']) });

      SoundEffects.play(audio, 1.8);

      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(1));
      const source = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;
      const gain = source.connect.mock.calls[0][0] as GainNodeMock;
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(1.8, 0);
      expect(gain.connect).toHaveBeenCalledWith(AudioOutput.channelNode(VolumeType.SE));
    });
  });

  describe('playOnce()', () => {
    async function connectedChannel(): Promise<unknown> {
      let gain: GainNodeMock | undefined;
      await vi.waitFor(() => {
        const source = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(source?.start).toHaveBeenCalled();
        gain = source!.connect.mock.calls[0][0] as GainNodeMock;
      });
      return gain!.connect.mock.calls[0][0];
    }

    it('plays through the sound-effect channel unless given another kind', async () => {
      SoundEffects.playOnce(audioFileWith({ blob: new Blob(['x']), identifier: 'kind-se' }), 0.5);

      expect(await connectedChannel()).toBe(AudioOutput.channelNode(VolumeType.SE));
    });

    it('plays through the channel of the kind it is given', async () => {
      SoundEffects.playOnce(
        audioFileWith({ blob: new Blob(['x']), identifier: 'kind-handling' }),
        0.5,
        VolumeType.HANDLING
      );

      expect(await connectedChannel()).toBe(AudioOutput.channelNode(VolumeType.HANDLING));
    });

    it('starts a buffer source when there are bytes', async () => {
      const blob = new Blob(['audio-data']);
      const af = audioFileWith({ blob, identifier: 'sp1' });

      SoundEffects.playOnce(af, 0.8);
      // playing a buffer is fire and forget, so wait for the promise
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
    });

    it('starts nothing with neither bytes nor a url', async () => {
      const af = audioFileWith({ identifier: 'sp2' });
      SoundEffects.playOnce(af);
      await new Promise((r) => setTimeout(r, 0));
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });

    it('stops, disconnects and drops the buffer when the source ends', async () => {
      const blob = new Blob(['audio-data']);
      const af = audioFileWith({ blob, identifier: 'sp3' });

      SoundEffects.playOnce(af);
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });

      const src = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;
      src.onended?.();
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnect).toHaveBeenCalled();
      expect(src.buffer).toBeNull();
    });

    it('fetches nothing when the cache has it', async () => {
      const blob = new Blob(['cached']);
      const af = audioFileWith({ url: 'http://example.com/c.mp3', identifier: 'sp4' });
      audioCachePrivate.cacheMap.set('sp4', { url: 'blob:cached', blob });

      SoundEffects.playOnce(af);
      await vi.waitFor(() => {
        expect(audioCtxMock.createBufferSource.mock.results[0]?.value).toBeDefined();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('builds a cache when it does not', async () => {
      const af = audioFileWith({ url: 'http://example.com/d.mp3', identifier: 'sp5' });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
      vi.stubGlobal('fetch', mockFetch);

      SoundEffects.playOnce(af);
      await vi.waitFor(() => {
        expect(audioCtxMock.createBufferSource.mock.results[0]?.value).toBeDefined();
      });
      expect(mockFetch).toHaveBeenCalledWith('http://example.com/d.mp3');
    });

    it('starts nothing when the cache cannot be built', async () => {
      const af = audioFileWith({ url: 'http://example.com/e.mp3', identifier: 'sp7' });
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      vi.spyOn(AudioCache as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);

      SoundEffects.playOnce(af);
      await new Promise((r) => setTimeout(r, 10));
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });

    it('returns nothing and starts nothing when decoding fails', async () => {
      const blob = new Blob(['bad-data']);
      const af = audioFileWith({ blob, identifier: 'sp6' });
      audioCtxMock.decodeAudioData.mockImplementation(
        (_buf: ArrayBuffer, _resolve: (b: AudioBuffer) => void, reject: (e: DOMException) => void) => {
          reject(new DOMException('decode error'));
        }
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      SoundEffects.playOnce(af);
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
      // no buffer source is built when decoding fails
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });
  });

  describe('play() / stop() / isPlaying()', () => {
    beforeEach(() => {
      SoundEffects.stopAll();
    });

    it('marks an effect as playing and connects it to the effects node', async () => {
      const af = audioFileWith({ blob: new Blob(['se']), identifier: 'se1' });

      SoundEffects.play(af);
      expect(SoundEffects.isPlaying('se1')).toBe(true);

      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      expect(SoundEffects.isPlaying('se1')).toBe(true);
    });

    it('stops that effect and marks it finished', async () => {
      const af = audioFileWith({ blob: new Blob(['se']), identifier: 'se2' });

      SoundEffects.play(af);
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      const src = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;

      SoundEffects.stop('se2');
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnect).toHaveBeenCalled();
      expect(SoundEffects.isPlaying('se2')).toBe(false);
    });

    it('clears the playing flag when the source ends', async () => {
      const af = audioFileWith({ blob: new Blob(['se']), identifier: 'se3' });

      SoundEffects.play(af);
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      const src = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;

      src.onended?.();
      expect(SoundEffects.isPlaying('se3')).toBe(false);
    });

    it('leaves an effect under another identifier alone', async () => {
      const a = audioFileWith({ blob: new Blob(['a']), identifier: 'seA' });
      const b = audioFileWith({ blob: new Blob(['b']), identifier: 'seB' });

      SoundEffects.play(a);
      SoundEffects.play(b);
      SoundEffects.stop('seA');

      expect(SoundEffects.isPlaying('seA')).toBe(false);
      expect(SoundEffects.isPlaying('seB')).toBe(true);
    });
  });
});
