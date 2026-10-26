import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioCache } from '@axe/core/storage/audio-cache';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioOutput, type ChannelInsert, VolumeType } from '@axe/core/storage/audio-output';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import { loopTaggedWavBlob } from '@axe/testing/loop-tagged-audio';
import {
  type AudioBufferSourceNodeMock,
  type AudioContextMock,
  type AudioElmMock,
  audioFileWith,
  type GainNodeMock,
  installWebAudioMock,
  makeGainNode,
  reachedPastTrim,
} from '@axe/testing/web-audio-mock';

type AudioCachePrivateStatic = {
  cacheMap: Map<string, { url: string; blob: Blob }>;
  MAX_DECODED_BYTES: number;
};

type AudioPlayerPrivateInstance = {
  _audioElm?: unknown;
};

const audioCachePrivate = AudioCache as unknown as AudioCachePrivateStatic;
const asAudioPlayerPrivate = (player: AudioPlayer): AudioPlayerPrivateInstance =>
  player as unknown as AudioPlayerPrivateInstance;

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AudioPlayer', () => {
  let audioCtxMock: AudioContextMock;
  let audioElmMock: AudioElmMock;

  beforeEach(() => {
    Logger.setLevel(LogLevel.DEBUG);
    ({ context: audioCtxMock, element: audioElmMock } = installWebAudioMock());
    audioCachePrivate.cacheMap.clear();
    AudioCache.forgetAll();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // ─── constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('can be built with no audio', () => {
      const player = new AudioPlayer();
      expect(player.audio).toBeUndefined();
    });

    it('can be built with audio', () => {
      const af = audioFileWith();
      const player = new AudioPlayer(af);
      expect(player.audio).toBe(af);
    });
  });

  // ─── instance volume / loop / paused ─────────────────────────────────────

  describe('instance volume', () => {
    it('returns the stored value before the element exists', () => {
      const player = new AudioPlayer();
      expect(player.volume).toBe(1);
    });

    it('changes the stored value', () => {
      const player = new AudioPlayer();
      player.volume = 0.5;
      expect(player.volume).toBe(0.5);
      // the element does not exist yet
      expect(asAudioPlayerPrivate(player)._audioElm).toBeUndefined();
    });

    it('carries a change through to the element once it exists', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'v1' });
      player.play(af);
      player.volume = 0.3;
      expect(audioElmMock.volume).toBe(0.3);
      expect(player.volume).toBe(0.3);
    });
  });

  describe('instance loop', () => {
    it('returns the stored value, false, before the element exists', () => {
      const player = new AudioPlayer();
      expect(player.loop).toBe(false);
    });

    it('changes the stored value', () => {
      const player = new AudioPlayer();
      player.loop = true;
      expect(player.loop).toBe(true);
      // the element does not exist yet
      expect(asAudioPlayerPrivate(player)._audioElm).toBeUndefined();
    });

    it('carries a change through to the element once it exists', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'lp1' });
      player.play(af);
      player.loop = true;
      expect(audioElmMock.loop).toBe(true);
    });
  });

  describe('instance paused', () => {
    it('returns true before the element exists', () => {
      const player = new AudioPlayer();
      expect(player.paused).toBe(true);
    });

    it('reads the element once it exists', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'ps1' });
      audioElmMock.paused = false;
      player.play(af);
      expect(player.paused).toBe(false);
    });
  });

  describe('instance isAwaitingGesture', () => {
    const settle = () => new Promise((resolve) => setTimeout(resolve));

    beforeEach(() => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('is false before anything has played', () => {
      expect(new AudioPlayer().isAwaitingGesture).toBe(false);
    });

    it('is true once the browser refuses to play for want of a gesture, and clears as the next play starts', async () => {
      const player = new AudioPlayer();
      audioElmMock.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
      player.play(audioFileWith({ blob: new Blob(['x']), identifier: 'gesture-refused' }));
      await settle();
      expect(player.isAwaitingGesture).toBe(true);

      player.play();
      expect(player.isAwaitingGesture).toBe(false);
    });

    it('clears when the player is stopped', async () => {
      const player = new AudioPlayer();
      audioElmMock.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
      player.play(audioFileWith({ blob: new Blob(['x']), identifier: 'gesture-stopped' }));
      await settle();

      player.stop();

      expect(player.isAwaitingGesture).toBe(false);
    });

    it('stays false when playing fails for a reason a gesture cannot help', async () => {
      const player = new AudioPlayer();
      audioElmMock.play.mockRejectedValueOnce(new DOMException('gone', 'NotSupportedError'));
      player.play(audioFileWith({ blob: new Blob(['x']), identifier: 'gesture-unsupported' }));
      await settle();
      expect(player.isAwaitingGesture).toBe(false);
    });

    it('ignores the refusal of a play that a later play has replaced', async () => {
      const player = new AudioPlayer();
      let refuseFirst: (reason: unknown) => void = () => {};
      audioElmMock.play.mockReturnValueOnce(new Promise((_resolve, reject) => (refuseFirst = reject)));
      player.play(audioFileWith({ blob: new Blob(['x']), identifier: 'gesture-replaced' }));
      player.play();

      refuseFirst(new DOMException('blocked', 'NotAllowedError'));
      await settle();

      expect(player.isAwaitingGesture).toBe(false);
    });
  });

  // ─── play / pause / stop ─────────────────────────────────────────────────

  describe('play()', () => {
    it('plays what it is handed even with nothing set', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['data']), identifier: 'p1' });
      player.play(af);
      expect(audioElmMock.play).toHaveBeenCalledOnce();
    });

    it('does nothing with neither', () => {
      const player = new AudioPlayer();
      player.play();
      expect(audioElmMock.play).not.toHaveBeenCalled();
    });

    it('stop before playing', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['data']), identifier: 'p2' });
      player.play(af); // the first call creates the element
      player.play(); // the second: stop → play
      expect(audioElmMock.pause).toHaveBeenCalled();
    });

    it('uses the cached url when there is one', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ url: 'http://example.com/a.mp3', identifier: 'cached' });
      audioCachePrivate.cacheMap.set('cached', { url: 'blob:cached-url', blob: new Blob() });
      player.play(af);
      expect(audioElmMock.src).toBe('blob:cached-url');
    });

    it('builds a cache when there is none', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ url: 'http://example.com/b.mp3', identifier: 'nc' });
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      const spy = vi.spyOn(AudioCache as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);
      player.play(af);
      expect(spy).toHaveBeenCalledWith(af);
    });

    it('falls back to the original url past a broken cache entry', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ url: 'http://example.com/broken.mp3', identifier: 'broken-cache' });
      const brokenCacheMap = audioCachePrivate.cacheMap as unknown as Map<
        string,
        { url: string; blob: Blob } | undefined
      >;
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      vi.spyOn(AudioCache as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);
      brokenCacheMap.set('broken-cache', undefined);

      expect(() => player.play(af)).not.toThrow();
      expect(audioElmMock.src).toBe('http://example.com/broken.mp3');
    });

    it('connects an audition to the audition node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.AUDITION;
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'aud' });
      // touch the audition node first so its gain exists
      const auditionNodeRef = AudioOutput.channelNode(VolumeType.AUDITION);
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(auditionNodeRef);
    });

    it('connects the master volume to the root node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.MASTER;
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'mst' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(AudioOutput.channelNode(VolumeType.MASTER));
    });

    it('connects a sound effect to the effects node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.SE;
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'se1' });
      // touch the effects node first so its gain exists
      const seNodeRef = AudioOutput.channelNode(VolumeType.SE);
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(seNodeRef);
    });

    it('carries the volume and loop onto a new element', () => {
      const player = new AudioPlayer();
      player.volume = 0.6;
      player.loop = true;
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'init' });
      player.play(af);
      expect(audioElmMock.volume).toBe(0.6);
      expect(audioElmMock.loop).toBe(true);
    });

    it('warns when the element refuses to play', async () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'playerr' });
      audioElmMock.play = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      player.play(af);
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[AudioPlayer]'), expect.any(Error));
    });
  });

  describe('pause()', () => {
    it('does nothing before the element exists', () => {
      const player = new AudioPlayer();
      expect(() => player.pause()).not.toThrow();
      // the element does not exist yet
      expect(asAudioPlayerPrivate(player)._audioElm).toBeUndefined();
    });

    it('pauses the element once it exists', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'pa1' });
      player.play(af);
      player.pause();
      expect(audioElmMock.pause).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('does nothing before the element exists', () => {
      const player = new AudioPlayer();
      expect(() => player.stop()).not.toThrow();
    });

    it('pauses, rewinds, empties the source, reloads and disconnects', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'st1' });
      player.play(af); // creates the element
      player.stop();
      expect(audioElmMock.pause).toHaveBeenCalled();
      expect(audioElmMock.currentTime).toBe(0);
      expect(audioElmMock.src).toBe('');
      expect(audioElmMock.load).toHaveBeenCalled();
    });

    it('disconnects the source on pause', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'st2' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      // fire the pause by hand
      audioElmMock.onpause?.();
      expect(src.disconnect).toHaveBeenCalled();
    });

    it('disconnects the source when it ends', () => {
      const player = new AudioPlayer();
      const af = audioFileWith({ blob: new Blob(['x']), identifier: 'st3' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      audioElmMock.onended?.();
      expect(src.disconnect).toHaveBeenCalled();
    });
  });

  describe('the channel it plays through', () => {
    it('is where a player on the background volume type plays through', () => {
      const player = new AudioPlayer(audioFileWith({ url: 'blob:bg' }));
      player.volumeType = VolumeType.BACKGROUND;
      player.play();
      const source = audioCtxMock.createMediaElementSource.mock.results[0].value as {
        connect: ReturnType<typeof vi.fn>;
      };
      expect(reachedPastTrim(source)).toBe(AudioOutput.channelNode(VolumeType.BACKGROUND));
    });

    it('sends a player through what is set between it and the volume', () => {
      const insert = { input: makeGainNode(), output: makeGainNode() };
      AudioOutput.setChannelInsert(VolumeType.MASTER, insert as unknown as ChannelInsert);
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'through-insert' }));

      player.play();

      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(insert.input);
    });
  });

  describe('brake()', () => {
    it('slows a streamed track in steps, its pitch falling, then pauses it and puts its rate back', async () => {
      vi.useFakeTimers();
      try {
        const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'brake' }));
        player.play();
        audioElmMock.paused = false;
        audioElmMock.playbackRate = 1;

        const braked = player.brake(1000);
        await vi.advanceTimersByTimeAsync(510);
        expect(audioElmMock.preservesPitch).toBe(false);
        expect(audioElmMock.playbackRate).toBeGreaterThan(0.4);
        expect(audioElmMock.playbackRate).toBeLessThan(0.6);

        await vi.advanceTimersByTimeAsync(600);
        await braked;
        expect(audioElmMock.pause).toHaveBeenCalled();
        expect(audioElmMock.playbackRate).toBe(1);
        expect(audioElmMock.preservesPitch).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('leaves a track played again while braking at its own speed, and does not pause it', async () => {
      vi.useFakeTimers();
      try {
        const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'brake-again' }));
        player.play();
        audioElmMock.paused = false;
        audioElmMock.playbackRate = 1;
        const braked = player.brake(1000);
        await vi.advanceTimersByTimeAsync(300);

        player.play();
        audioElmMock.paused = false;
        audioElmMock.pause.mockClear();
        await vi.advanceTimersByTimeAsync(100);
        expect(audioElmMock.playbackRate).toBe(1);

        await vi.advanceTimersByTimeAsync(1000);
        await braked;
        expect(audioElmMock.pause).not.toHaveBeenCalled();
        expect(audioElmMock.preservesPitch).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('only pauses a track that is not sounding', async () => {
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'brake-silent' }));
      player.play();

      await player.brake(1000);

      expect(audioElmMock.pause).toHaveBeenCalled();
    });
  });

  describe('trim and fader', () => {
    function faderOf(): GainNodeMock {
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value as { connect: ReturnType<typeof vi.fn> };
      return src.connect.mock.calls[0][0] as GainNodeMock;
    }

    function trimOf(): GainNodeMock {
      return faderOf().connect.mock.calls[0][0] as GainNodeMock;
    }

    it('is 1 until set, and carries a value set before playing onto the trim it plays through', () => {
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'trim-early' }));
      expect(player.trim).toBe(1);

      player.trim = 2.5;
      player.play();

      expect(trimOf().gain.setValueAtTime).toHaveBeenCalledWith(2.5, 0);
    });

    it('glides a trim moved while playing in a straight line', () => {
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'trim-glide' }));
      player.play();

      player.glideTrim(0.5, 1.5);

      expect(player.trim).toBe(0.5);
      expect(trimOf().gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
    });

    it('takes the trim off the channel when it stops, and puts it back when it plays again', () => {
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'trim-stop' }));
      player.play();
      const trim = trimOf();

      player.stop();
      expect(trim.disconnect).toHaveBeenCalled();

      player.play();
      expect(trim.connect).toHaveBeenCalledTimes(2);
    });

    it('fades on the audio clock, leaving the volume as it was set', async () => {
      vi.useFakeTimers();
      try {
        const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'fade-clock' }));
        player.volume = 0.7;
        player.fader = 0;
        player.play();

        const done = player.fadeVolumeTo(1, 2000);
        vi.advanceTimersByTime(2000);
        await done;

        expect(faderOf().gain.linearRampToValueAtTime).toHaveBeenCalledWith(1, 2);
        expect(player.fader).toBe(1);
        expect(player.volume).toBe(0.7);
      } finally {
        vi.useRealTimers();
      }
    });

    it('resolves a fade cut short by another, or by a stop', async () => {
      const player = new AudioPlayer(audioFileWith({ blob: new Blob(['x']), identifier: 'fade-cut' }));
      player.play();

      const first = player.fadeVolumeTo(0, 60_000);
      const second = player.fadeVolumeTo(1, 60_000);
      await first;
      player.stop();
      await second;

      expect(player.fader).toBe(1);
    });

    it('sets the fader at once before anything has played', async () => {
      const player = new AudioPlayer();

      await player.fadeVolumeTo(0.25, 1000);

      expect(player.fader).toBe(0.25);
      expect(audioCtxMock.createGain).not.toHaveBeenCalled();
    });
  });

  describe('following the loop points a file names', () => {
    type LoopSource = AudioBufferSourceNodeMock & { loop?: boolean; loopStart?: number; loopEnd?: number };
    const sources = () => audioCtxMock.createBufferSource.mock.results.map((result) => result.value as LoopSource);
    // A second long, at 8000 samples a second: the part from a quarter to three quarters goes round.
    const looping = () =>
      audioFileWith({ blob: loopTaggedWavBlob({ start: 2000, end: 5999 }), identifier: 'looping-bgm' });
    const plain = () => audioFileWith({ blob: loopTaggedWavBlob(null), identifier: 'plain-bgm' });

    function follower(loop = true): AudioPlayer {
      const player = new AudioPlayer();
      player.followsLoopPoints = true;
      player.loop = loop;
      return player;
    }

    beforeEach(() => {
      Object.assign(audioCtxMock, { sampleRate: 48000 });
      audioCtxMock.createGain.mockImplementation(() => ({
        ...makeGainNode(),
        gain: {
          value: 1,
          setValueAtTime: vi.fn(),
          setTargetAtTime: vi.fn(),
          cancelScheduledValues: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      }));
    });

    it('plays a track that names a loop from memory, going round between its points', async () => {
      follower().play(looping());

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(sources()[0]).toMatchObject({ loop: true, loopStart: 0.25, loopEnd: 0.75 });
      expect(sources()[0].start).toHaveBeenCalledWith(0, 0);
      expect(audioElmMock.play).not.toHaveBeenCalled();
    });

    it('streams a track that names no loop, and does not read it again the next time', async () => {
      const player = follower();
      const track = plain();

      player.play(track);
      await vi.waitFor(() => expect(audioElmMock.play).toHaveBeenCalledTimes(1));
      player.play(track);

      expect(audioElmMock.play).toHaveBeenCalledTimes(2);
      expect(audioCtxMock.decodeAudioData).not.toHaveBeenCalled();
    });

    it('streams every track while it does not follow loop points', () => {
      const player = new AudioPlayer();
      player.loop = true;

      player.play(looping());

      expect(audioElmMock.play).toHaveBeenCalledOnce();
    });

    it('fades a track in while it is still being read, so it comes in partway through the fade', async () => {
      const gains = () => audioCtxMock.createGain.mock.results.map((result) => result.value as GainNodeMock);
      const player = follower();
      player.fader = 0;
      player.play(looping());
      expect(player.isLoading).toBe(true);

      void player.fadeVolumeTo(1, 2000);

      const fader = gains().find((gain) =>
        gain.gain.linearRampToValueAtTime.mock.calls.some(([value, at]) => value === 1 && at === 2)
      );
      expect(fader).toBeDefined();
      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(player.isLoading).toBe(false);
      expect(gains().some((gain) => gain.connect.mock.calls.some(([to]) => to === fader))).toBe(true);
    });

    it('lets a track played again while the one before was braking play on', async () => {
      const player = follower(false);
      player.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      const braked = player.brake(20);

      player.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(2));
      await braked;

      expect(player.paused).toBe(false);
    });

    it('starts from where it was moved to while the track was being read, and reports that place meanwhile', async () => {
      const player = follower();
      player.play(looping());

      player.seekTo(0.5);
      expect(player.currentTime).toBe(0.5);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(sources()[0].start).toHaveBeenCalledWith(0, 0.5);
    });

    it('does not start a track paused or stopped while it was being read', async () => {
      const paused = follower();
      paused.play(looping());
      paused.pause();
      const stopped = follower();
      stopped.play(looping());
      stopped.stop();

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(sources().every((source) => source.start.mock.calls.length === 0)).toBe(true);
      expect(paused.paused).toBe(true);
    });

    it('plays a track that names a loop on to its end while not looping, and says when it gets there', async () => {
      const player = follower(false);
      const ended = vi.fn();
      player.onEnded = ended;
      player.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      expect(sources()[0].loop).toBe(false);
      sources()[0].onended!();
      expect(ended).toHaveBeenCalledOnce();
    });

    it('turns going round on and off while the track plays', async () => {
      const player = follower(false);
      player.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      player.loop = true;

      expect(sources()[0].loop).toBe(true);
    });

    it('decodes a track once for plays that follow one another', async () => {
      const first = follower();
      first.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      const second = follower();
      second.play(looping());
      await vi.waitFor(() => expect(sources()).toHaveLength(2));

      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledOnce();
    });

    it('streams a track too long to hold in memory, whatever loop it names', async () => {
      const long = audioFileWith({
        blob: loopTaggedWavBlob({ start: 2000, end: 5999 }, { rate: 8, frames: 8 * 60 * 60 }),
        identifier: 'long-bgm',
      });

      follower().play(long);

      await vi.waitFor(() => expect(audioElmMock.play).toHaveBeenCalledOnce());
      expect(audioCtxMock.decodeAudioData).not.toHaveBeenCalled();
    });
  });
});
