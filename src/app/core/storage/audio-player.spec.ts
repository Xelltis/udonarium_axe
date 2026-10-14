import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, type ChannelInsert, VolumeType } from '@axe/core/storage/audio-player';
import { loopTaggedWavBlob } from '@axe/testing/loop-tagged-audio';

// ─── AudioContext mock ────────────────────────────────────────────────────────

type GainNodeMock = {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    setTargetAtTime: ReturnType<typeof vi.fn>;
    cancelScheduledValues: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

type AudioBufferSourceNodeMock = {
  buffer: AudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
  playbackRate: GainNodeMock['gain'];
};

function makeGainNode(): GainNodeMock {
  return {
    gain: {
      value: 1,
      setValueAtTime: vi.fn(),
      setTargetAtTime: vi.fn(),
      cancelScheduledValues: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

/** Where a source's sound goes once past the player's own fader and trim, which it always meets first. */
function reachedPastTrim(source: { connect: ReturnType<typeof vi.fn> }): unknown {
  const fader = source.connect.mock.calls[0][0] as GainNodeMock;
  const trim = fader.connect.mock.calls[0][0] as GainNodeMock;
  return trim.connect.mock.calls[0][0];
}

function makeBufferSource(): AudioBufferSourceNodeMock {
  return {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
    playbackRate: makeGainNode().gain,
  };
}

function makeAudioContextMock() {
  const destination = {} as AudioDestinationNode;
  return {
    currentTime: 0,
    destination,
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn(() => makeGainNode()),
    createMediaElementSource: vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    })),
    createBufferSource: vi.fn(() => makeBufferSource()),
    decodeAudioData: vi.fn(
      (_buf: ArrayBuffer, resolve: (b: AudioBuffer) => void, _reject: (e: DOMException) => void) => {
        resolve({ duration: 1, length: 48000, numberOfChannels: 2 } as AudioBuffer);
      }
    ),
  };
}

// ─── HTMLAudioElement mock ────────────────────────────────────────────────────

type AudioElmMock = {
  volume: number;
  playbackRate?: number;
  preservesPitch?: boolean;
  loop: boolean;
  paused: boolean;
  currentTime: number;
  src: string;
  onpause: (() => void) | null;
  onended: (() => void) | null;
  load: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
};

function makeAudioElm(): AudioElmMock {
  return {
    volume: 1,
    loop: false,
    paused: true,
    currentTime: 0,
    src: '',
    onpause: null,
    onended: null,
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

type AudioPlayerPrivateStatic = {
  _audioContext: unknown;
  channels: Map<VolumeType, unknown>;
  cacheMap: Map<string, { url: string; blob: Blob }>;
  MAX_CACHE_SIZE: number;
  MAX_DECODED_BYTES: number;
  evictCacheIfNeeded: () => void;
  createCacheAsync: (audio: AudioFile) => Promise<{ url: string; blob: Blob } | null>;
};

type AudioPlayerPrivateInstance = {
  _audioElm?: unknown;
};

const audioPlayerPrivate = AudioPlayer as unknown as AudioPlayerPrivateStatic;
const asAudioPlayerPrivate = (player: AudioPlayer): AudioPlayerPrivateInstance =>
  player as unknown as AudioPlayerPrivateInstance;

function resetStaticState() {
  // reset the static fields so nothing leaks between tests
  audioPlayerPrivate._audioContext = undefined;
  // Emptied rather than set through the setters, which would build the gain graph a test has yet
  // to ask for. A test that reads a default has to find one whatever ran before it.
  audioPlayerPrivate.channels.clear();
  audioPlayerPrivate.cacheMap.clear();
  (AudioPlayer as unknown as { decodedBuffers: Map<string, unknown> }).decodedBuffers.clear();
  AudioPlayer.clearAllCache();
}

function makeAudioFile(opts: { blob?: Blob | null; url?: string; identifier?: string } = {}): AudioFile {
  const identifier = opts.identifier ?? 'test-id';
  const audio = AudioFile.createEmpty(identifier);
  const ctx = (audio as unknown as { context: Record<string, unknown> }).context;
  ctx['blob'] = opts.blob ?? null;
  ctx['url'] = opts.url ?? '';
  return audio;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('AudioPlayer', () => {
  let audioCtxMock: ReturnType<typeof makeAudioContextMock>;
  let audioElmMock: AudioElmMock;

  beforeEach(() => {
    Logger.setLevel(LogLevel.DEBUG);

    audioCtxMock = makeAudioContextMock();
    audioElmMock = makeAudioElm();

    // a constructor handing back the stand-in audio context
    // an arrow cannot be constructed, so this is a plain function
    const capturedCtx = audioCtxMock;
    function AudioContextCtor(this: unknown) {
      return capturedCtx;
    }
    vi.stubGlobal('AudioContext', AudioContextCtor);
    vi.stubGlobal('webkitAudioContext', AudioContextCtor);

    // a constructor handing back the stand-in audio element
    const capturedElm = audioElmMock;
    function AudioCtor(this: unknown) {
      return capturedElm;
    }
    vi.stubGlobal('Audio', AudioCtor);

    vi.stubGlobal('fetch', vi.fn());
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

    resetStaticState();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('decoding a sound effect', () => {
    it('decodes it once however often it plays, overlapping plays included', async () => {
      const audio = makeAudioFile({ identifier: 'se-once', blob: new Blob(['x']) });

      AudioPlayer.playSE(audio);
      AudioPlayer.playSE(audio);
      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(2));
      AudioPlayer.playSE(audio);
      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(3));

      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(1);
    });

    it('plays it at the level asked, through the sound-effect channel', async () => {
      const audio = makeAudioFile({ identifier: 'se-level', blob: new Blob(['x']) });

      AudioPlayer.playSE(audio, 1.8);

      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(1));
      const source = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;
      const gain = source.connect.mock.calls[0][0] as GainNodeMock;
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(1.8, 0);
      expect(gain.connect).toHaveBeenCalledWith(AudioPlayer.channelNode(VolumeType.SE));
    });

    it('decodes it again once the cache is cleared', async () => {
      const audio = makeAudioFile({ identifier: 'se-cleared', blob: new Blob(['x']) });

      AudioPlayer.playSE(audio);
      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(1));
      AudioPlayer.clearAllCache();
      AudioPlayer.playSE(audio);
      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(2));

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

    async function playThrough(audio: AudioFile): Promise<void> {
      const started = audioCtxMock.createBufferSource.mock.calls.length;
      AudioPlayer.play(audio);
      await vi.waitFor(() => expect(audioCtxMock.createBufferSource).toHaveBeenCalledTimes(started + 1));
    }

    it('keeps decoded effects within a byte budget, letting the least recently played go first', async () => {
      decodesInTurn(Math.floor((audioPlayerPrivate.MAX_DECODED_BYTES * 0.4) / BYTES_PER_STEREO_FRAME));
      const a = makeAudioFile({ identifier: 'se-budget-a', blob: new Blob(['a']) });
      const b = makeAudioFile({ identifier: 'se-budget-b', blob: new Blob(['b']) });
      const c = makeAudioFile({ identifier: 'se-budget-c', blob: new Blob(['c']) });

      await playThrough(a);
      await playThrough(b);
      await playThrough(a);
      await playThrough(c);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);

      await playThrough(a);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);
      await playThrough(b);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(4);
    });

    it('plays a clip larger than the whole budget without keeping it or pushing out the rest', async () => {
      const tooLarge = Math.floor(audioPlayerPrivate.MAX_DECODED_BYTES / BYTES_PER_STEREO_FRAME) + 1;
      decodesInTurn(48000, tooLarge);
      const short = makeAudioFile({ identifier: 'se-short', blob: new Blob(['s']) });
      const long = makeAudioFile({ identifier: 'se-long', blob: new Blob(['l']) });

      await playThrough(short);
      await playThrough(long);
      await playThrough(long);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);

      await playThrough(short);
      expect(audioCtxMock.decodeAudioData).toHaveBeenCalledTimes(3);
    });
  });

  // ─── VolumeType enum ─────────────────────────────────────────────────────

  describe('VolumeType', () => {
    it('master is zero', () => {
      expect(VolumeType.MASTER).toBe(0);
    });
    it('audition is one', () => {
      expect(VolumeType.AUDITION).toBe(1);
    });
    it('the sound effects are two', () => {
      expect(VolumeType.SE).toBe(2);
    });
    it('the background sounds are three', () => {
      expect(VolumeType.BACKGROUND).toBe(3);
    });
    it('the kinds split off from the sound effects come after, in a fixed order', () => {
      expect([VolumeType.CUT_IN, VolumeType.NOTIFICATION, VolumeType.HANDLING, VolumeType.EFFECT]).toEqual([
        4, 5, 6, 7,
      ]);
    });
  });

  // ─── static audioContext ─────────────────────────────────────────────────

  describe('static audioContext', () => {
    it('builds the audio context on first use', () => {
      const ctx = AudioPlayer.audioContext;
      expect(ctx).toBe(audioCtxMock);
    });

    it('returns the same one afterwards', () => {
      const a = AudioPlayer.audioContext;
      const b = AudioPlayer.audioContext;
      expect(a).toBe(b);
    });

    it('falls back to the prefixed constructor', () => {
      vi.stubGlobal('AudioContext', undefined);
      const capturedCtx = audioCtxMock;
      let callCount = 0;
      function webkitCtor(this: unknown) {
        callCount++;
        return capturedCtx;
      }
      vi.stubGlobal('webkitAudioContext', webkitCtor);
      const ctx = AudioPlayer.audioContext;
      expect(ctx).toBe(audioCtxMock);
      expect(callCount).toBe(1);
    });
  });

  // ─── static volume ───────────────────────────────────────────────────────

  describe('static volume', () => {
    it('is half by default', () => {
      expect(AudioPlayer.volume).toBe(0.5);
    });

    it('carries a change through to the master gain', () => {
      AudioPlayer.volume = 0.8;
      expect(AudioPlayer.volume).toBe(0.8);
      const gainNode = audioCtxMock.createGain.mock.results[0].value as GainNodeMock;
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, 0, 0.01);
    });
  });

  // ─── static auditionVolume ───────────────────────────────────────────────

  describe('static auditionVolume', () => {
    it('is half by default', () => {
      expect(AudioPlayer.auditionVolume).toBe(0.5);
    });

    it('carries a change through to the audition gain', () => {
      AudioPlayer.auditionVolume = 0.3;
      expect(AudioPlayer.auditionVolume).toBe(0.3);
      // the setter reaches the audition gain directly, so the first gain built is that one
      const gainNode = audioCtxMock.createGain.mock.results[0].value as GainNodeMock;
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.01);
    });
  });

  // ─── static seVolume ─────────────────────────────────────────────────────

  describe('static seVolume', () => {
    it('is half by default', () => {
      expect(AudioPlayer.seVolume).toBe(0.5);
    });

    it('carries a change through to the effects gain', () => {
      AudioPlayer.seVolume = 0.7;
      expect(AudioPlayer.seVolume).toBe(0.7);
      const gainNode = audioCtxMock.createGain.mock.results[0].value as GainNodeMock;
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.7, 0, 0.01);
    });
  });

  // ─── static backgroundVolume / background channel ─────────────────────────

  describe('static backgroundVolume', () => {
    it('is half by default', () => {
      expect(AudioPlayer.backgroundVolume).toBe(0.5);
    });

    it('carries a change through to the background gain', () => {
      AudioPlayer.backgroundVolume = 0.4;
      expect(AudioPlayer.backgroundVolume).toBe(0.4);
      const gainNode = audioCtxMock.createGain.mock.results[0].value as GainNodeMock;
      expect(gainNode.gain.setTargetAtTime).toHaveBeenCalledWith(0.4, 0, 0.01);
    });
  });

  describe('the background channel', () => {
    it('is a channel of its own, apart from the music and the effects', () => {
      const node = AudioPlayer.channelNode(VolumeType.BACKGROUND);
      expect(node).toBe(AudioPlayer.channelNode(VolumeType.BACKGROUND));
      expect(node).not.toBe(AudioPlayer.channelNode(VolumeType.MASTER));
      expect(node).not.toBe(AudioPlayer.channelNode(VolumeType.SE));
    });

    it('is where a player on the background volume type plays through', () => {
      const player = new AudioPlayer(makeAudioFile({ url: 'blob:bg' }));
      player.volumeType = VolumeType.BACKGROUND;
      player.play();
      const source = audioCtxMock.createMediaElementSource.mock.results[0].value as {
        connect: ReturnType<typeof vi.fn>;
      };
      expect(reachedPastTrim(source)).toBe(AudioPlayer.channelNode(VolumeType.BACKGROUND));
    });
  });

  // ─── constructor ─────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('can be built with no audio', () => {
      const player = new AudioPlayer();
      expect(player.audio).toBeUndefined();
    });

    it('can be built with audio', () => {
      const af = makeAudioFile();
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
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'v1' });
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
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'lp1' });
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
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'ps1' });
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
      player.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'gesture-refused' }));
      await settle();
      expect(player.isAwaitingGesture).toBe(true);

      player.play();
      expect(player.isAwaitingGesture).toBe(false);
    });

    it('clears when the player is stopped', async () => {
      const player = new AudioPlayer();
      audioElmMock.play.mockRejectedValueOnce(new DOMException('blocked', 'NotAllowedError'));
      player.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'gesture-stopped' }));
      await settle();

      player.stop();

      expect(player.isAwaitingGesture).toBe(false);
    });

    it('stays false when playing fails for a reason a gesture cannot help', async () => {
      const player = new AudioPlayer();
      audioElmMock.play.mockRejectedValueOnce(new DOMException('gone', 'NotSupportedError'));
      player.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'gesture-unsupported' }));
      await settle();
      expect(player.isAwaitingGesture).toBe(false);
    });

    it('ignores the refusal of a play that a later play has replaced', async () => {
      const player = new AudioPlayer();
      let refuseFirst: (reason: unknown) => void = () => {};
      audioElmMock.play.mockReturnValueOnce(new Promise((_resolve, reject) => (refuseFirst = reject)));
      player.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'gesture-replaced' }));
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
      const af = makeAudioFile({ blob: new Blob(['data']), identifier: 'p1' });
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
      const af = makeAudioFile({ blob: new Blob(['data']), identifier: 'p2' });
      player.play(af); // 1回目で要素生成
      player.play(); // 2回目: stop → play
      expect(audioElmMock.pause).toHaveBeenCalled();
    });

    it('uses the cached url when there is one', () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ url: 'http://example.com/a.mp3', identifier: 'cached' });
      audioPlayerPrivate.cacheMap.set('cached', { url: 'blob:cached-url', blob: new Blob() });
      player.play(af);
      expect(audioElmMock.src).toBe('blob:cached-url');
    });

    it('builds a cache when there is none', () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ url: 'http://example.com/b.mp3', identifier: 'nc' });
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      const spy = vi.spyOn(AudioPlayer as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);
      player.play(af);
      expect(spy).toHaveBeenCalledWith(af);
    });

    it('falls back to the original url past a broken cache entry', () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ url: 'http://example.com/broken.mp3', identifier: 'broken-cache' });
      const brokenCacheMap = audioPlayerPrivate.cacheMap as unknown as Map<
        string,
        { url: string; blob: Blob } | undefined
      >;
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      vi.spyOn(AudioPlayer as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);
      brokenCacheMap.set('broken-cache', undefined);

      expect(() => player.play(af)).not.toThrow();
      expect(audioElmMock.src).toBe('http://example.com/broken.mp3');
    });

    it('connects an audition to the audition node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.AUDITION;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'aud' });
      // touch the audition node first so its gain exists
      const auditionNodeRef = AudioPlayer.channelNode(VolumeType.AUDITION);
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(auditionNodeRef);
    });

    it('connects the master volume to the root node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.MASTER;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'mst' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(AudioPlayer.channelNode(VolumeType.MASTER));
    });

    it('connects a sound effect to the effects node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.SE;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'se1' });
      // touch the effects node first so its gain exists
      const seNodeRef = AudioPlayer.channelNode(VolumeType.SE);
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(seNodeRef);
    });

    it('carries the volume and loop onto a new element', () => {
      const player = new AudioPlayer();
      player.volume = 0.6;
      player.loop = true;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'init' });
      player.play(af);
      expect(audioElmMock.volume).toBe(0.6);
      expect(audioElmMock.loop).toBe(true);
    });

    it('warns when the element refuses to play', async () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'playerr' });
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
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'pa1' });
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
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'st1' });
      player.play(af); // 要素生成
      player.stop();
      expect(audioElmMock.pause).toHaveBeenCalled();
      expect(audioElmMock.currentTime).toBe(0);
      expect(audioElmMock.src).toBe('');
      expect(audioElmMock.load).toHaveBeenCalled();
    });

    it('disconnects the source on pause', () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'st2' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      // fire the pause by hand
      audioElmMock.onpause?.();
      expect(src.disconnect).toHaveBeenCalled();
    });

    it('disconnects the source when it ends', () => {
      const player = new AudioPlayer();
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'st3' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      audioElmMock.onended?.();
      expect(src.disconnect).toHaveBeenCalled();
    });
  });

  // ─── static play (playBufferAsync) ───────────────────────────────────────

  describe('channels', () => {
    const ALL = [
      VolumeType.MASTER,
      VolumeType.AUDITION,
      VolumeType.SE,
      VolumeType.BACKGROUND,
      VolumeType.CUT_IN,
      VolumeType.NOTIFICATION,
      VolumeType.HANDLING,
      VolumeType.EFFECT,
    ];

    it('gives every kind a channel of its own, running to the speakers', () => {
      const nodes = ALL.map((type) => AudioPlayer.channelNode(type));

      expect(new Set(nodes).size).toBe(ALL.length);
      for (const node of nodes) {
        expect((node as unknown as GainNodeMock).connect).toHaveBeenCalledWith(audioCtxMock.destination);
      }
    });

    it('starts every channel at half', () => {
      expect(ALL.map((type) => AudioPlayer.channelVolume(type))).toEqual(ALL.map(() => 0.5));
    });

    it('glides one channel to a new volume and leaves the others alone', () => {
      AudioPlayer.setChannelVolume(VolumeType.HANDLING, 0.3);

      expect(AudioPlayer.channelVolume(VolumeType.HANDLING)).toBe(0.3);
      expect(AudioPlayer.channelVolume(VolumeType.SE)).toBe(0.5);
      const node = AudioPlayer.channelNode(VolumeType.HANDLING) as unknown as GainNodeMock;
      expect(node.gain.setTargetAtTime).toHaveBeenCalledWith(0.3, 0, 0.01);
    });

    it('takes players straight to the volume while nothing is set between them', () => {
      expect(AudioPlayer.channelInput(VolumeType.CUT_IN)).toBe(AudioPlayer.channelNode(VolumeType.CUT_IN));
    });

    it('sets something between a channel’s players and its volume, and leaves the other channels', () => {
      const insert = { input: makeGainNode(), output: makeGainNode() };

      AudioPlayer.setChannelInsert(VolumeType.MASTER, insert as unknown as ChannelInsert);

      expect(AudioPlayer.channelInput(VolumeType.MASTER)).toBe(insert.input);
      expect(insert.output.connect).toHaveBeenCalledWith(AudioPlayer.channelNode(VolumeType.MASTER));
      expect(AudioPlayer.channelInput(VolumeType.SE)).toBe(AudioPlayer.channelNode(VolumeType.SE));
    });

    it('sends a player through what is set between it and the volume', () => {
      const insert = { input: makeGainNode(), output: makeGainNode() };
      AudioPlayer.setChannelInsert(VolumeType.MASTER, insert as unknown as ChannelInsert);
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'through-insert' }));

      player.play();

      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(reachedPastTrim(src)).toBe(insert.input);
    });
  });

  describe('brake()', () => {
    it('slows a streamed track in steps, its pitch falling, then pauses it and puts its rate back', async () => {
      vi.useFakeTimers();
      try {
        const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'brake' }));
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
        const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'brake-again' }));
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
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'brake-silent' }));
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
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'trim-early' }));
      expect(player.trim).toBe(1);

      player.trim = 2.5;
      player.play();

      expect(trimOf().gain.setValueAtTime).toHaveBeenCalledWith(2.5, 0);
    });

    it('glides a trim moved while playing in a straight line', () => {
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'trim-glide' }));
      player.play();

      player.glideTrim(0.5, 1.5);

      expect(player.trim).toBe(0.5);
      expect(trimOf().gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.5, 1.5);
    });

    it('takes the trim off the channel when it stops, and puts it back when it plays again', () => {
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'trim-stop' }));
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
        const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'fade-clock' }));
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
      const player = new AudioPlayer(makeAudioFile({ blob: new Blob(['x']), identifier: 'fade-cut' }));
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

  describe('static play()', () => {
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
      AudioPlayer.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'kind-se' }), 0.5);

      expect(await connectedChannel()).toBe(AudioPlayer.channelNode(VolumeType.SE));
    });

    it('plays through the channel of the kind it is given', async () => {
      AudioPlayer.play(makeAudioFile({ blob: new Blob(['x']), identifier: 'kind-handling' }), 0.5, VolumeType.HANDLING);

      expect(await connectedChannel()).toBe(AudioPlayer.channelNode(VolumeType.HANDLING));
    });

    it('starts a buffer source when there are bytes', async () => {
      const blob = new Blob(['audio-data']);
      const af = makeAudioFile({ blob, identifier: 'sp1' });

      AudioPlayer.play(af, 0.8);
      // playing a buffer is fire and forget, so wait for the promise
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
    });

    it('starts nothing with neither bytes nor a url', async () => {
      const af = makeAudioFile({ identifier: 'sp2' });
      AudioPlayer.play(af);
      await new Promise((r) => setTimeout(r, 0));
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });

    it('stops, disconnects and drops the buffer when the source ends', async () => {
      const blob = new Blob(['audio-data']);
      const af = makeAudioFile({ blob, identifier: 'sp3' });

      AudioPlayer.play(af);
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
      const af = makeAudioFile({ url: 'http://example.com/c.mp3', identifier: 'sp4' });
      audioPlayerPrivate.cacheMap.set('sp4', { url: 'blob:cached', blob });

      AudioPlayer.play(af);
      await vi.waitFor(() => {
        expect(audioCtxMock.createBufferSource.mock.results[0]?.value).toBeDefined();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('builds a cache when it does not', async () => {
      const af = makeAudioFile({ url: 'http://example.com/d.mp3', identifier: 'sp5' });
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(new Blob(['x'])) });
      vi.stubGlobal('fetch', mockFetch);

      AudioPlayer.play(af);
      await vi.waitFor(() => {
        expect(audioCtxMock.createBufferSource.mock.results[0]?.value).toBeDefined();
      });
      expect(mockFetch).toHaveBeenCalledWith('http://example.com/d.mp3');
    });

    it('starts nothing when the cache cannot be built', async () => {
      const af = makeAudioFile({ url: 'http://example.com/e.mp3', identifier: 'sp7' });
      type WithCreateCacheAsync = { createCacheAsync: (audio: AudioFile) => Promise<null> };
      vi.spyOn(AudioPlayer as unknown as WithCreateCacheAsync, 'createCacheAsync').mockResolvedValue(null);

      AudioPlayer.play(af);
      await new Promise((r) => setTimeout(r, 10));
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });

    it('returns nothing and starts nothing when decoding fails', async () => {
      const blob = new Blob(['bad-data']);
      const af = makeAudioFile({ blob, identifier: 'sp6' });
      audioCtxMock.decodeAudioData.mockImplementation(
        (_buf: ArrayBuffer, _resolve: (b: AudioBuffer) => void, reject: (e: DOMException) => void) => {
          reject(new DOMException('decode error'));
        }
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AudioPlayer.play(af);
      await vi.waitFor(() => expect(warnSpy).toHaveBeenCalled());
      // no buffer source is built when decoding fails
      expect(audioCtxMock.createBufferSource).not.toHaveBeenCalled();
    });
  });

  // ─── static SE playback ───────────────────────────────────────────────────

  describe('static playSE() / stopSE() / isSePlaying()', () => {
    beforeEach(() => {
      AudioPlayer.stopAllSE();
    });

    it('marks an effect as playing and connects it to the effects node', async () => {
      const af = makeAudioFile({ blob: new Blob(['se']), identifier: 'se1' });

      AudioPlayer.playSE(af);
      expect(AudioPlayer.isSePlaying('se1')).toBe(true);

      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      expect(AudioPlayer.isSePlaying('se1')).toBe(true);
    });

    it('stops that effect and marks it finished', async () => {
      const af = makeAudioFile({ blob: new Blob(['se']), identifier: 'se2' });

      AudioPlayer.playSE(af);
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      const src = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;

      AudioPlayer.stopSE('se2');
      expect(src.stop).toHaveBeenCalled();
      expect(src.disconnect).toHaveBeenCalled();
      expect(AudioPlayer.isSePlaying('se2')).toBe(false);
    });

    it('clears the playing flag when the source ends', async () => {
      const af = makeAudioFile({ blob: new Blob(['se']), identifier: 'se3' });

      AudioPlayer.playSE(af);
      await vi.waitFor(() => {
        const src = audioCtxMock.createBufferSource.mock.results[0]?.value as AudioBufferSourceNodeMock | undefined;
        expect(src?.start).toHaveBeenCalled();
      });
      const src = audioCtxMock.createBufferSource.mock.results[0].value as AudioBufferSourceNodeMock;

      src.onended?.();
      expect(AudioPlayer.isSePlaying('se3')).toBe(false);
    });

    it('leaves an effect under another identifier alone', async () => {
      const a = makeAudioFile({ blob: new Blob(['a']), identifier: 'seA' });
      const b = makeAudioFile({ blob: new Blob(['b']), identifier: 'seB' });

      AudioPlayer.playSE(a);
      AudioPlayer.playSE(b);
      AudioPlayer.stopSE('seA');

      expect(AudioPlayer.isSePlaying('seA')).toBe(false);
      expect(AudioPlayer.isSePlaying('seB')).toBe(true);
    });
  });

  // ─── static resumeAudioContext ───────────────────────────────────────────

  describe('static resumeAudioContext()', () => {
    type ContextState = { state: string; addEventListener: ReturnType<typeof vi.fn> };

    function listenersOnDocument() {
      const listeners = new Map<string, EventListener>();
      const removed = new Set<string>();
      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
        listeners.set(type, listener as EventListener);
        removed.delete(type);
      });
      vi.spyOn(document, 'removeEventListener').mockImplementation((type) => {
        removed.add(type);
      });
      return { listeners, removed };
    }

    function contextIn(state: string): { context: ContextState; stopped: () => void } {
      const handlers: (() => void)[] = [];
      const context = Object.assign(audioCtxMock, {
        state,
        addEventListener: vi.fn((_type: string, handler: () => void) => handlers.push(handler)),
      }) as unknown as ContextState;
      return { context, stopped: () => handlers.forEach((handler) => handler()) };
    }

    async function settle(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
    }

    it('resumes the context when a finger lifts, not when it lands', () => {
      contextIn('suspended');
      const { listeners } = listenersOnDocument();

      AudioPlayer.resumeAudioContext();

      expect(listeners.has('touchstart')).toBe(false);
      listeners.get('touchend')!(new Event('touchend'));
      expect(audioCtxMock.resume).toHaveBeenCalledTimes(1);
    });

    it('resumes it on a press or a key as well', () => {
      contextIn('suspended');
      const { listeners } = listenersOnDocument();

      AudioPlayer.resumeAudioContext();
      listeners.get('mousedown')!(new Event('mousedown'));
      listeners.get('keydown')!(new Event('keydown'));

      expect(audioCtxMock.resume).toHaveBeenCalledTimes(2);
    });

    it('keeps listening until the context is running', async () => {
      const { context } = contextIn('suspended');
      const { listeners, removed } = listenersOnDocument();

      AudioPlayer.resumeAudioContext();
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect(removed.size).toBe(0);

      context.state = 'running';
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect([...removed].sort()).toEqual(['keydown', 'mousedown', 'touchend']);
    });

    it('listens again once the context is stopped, as iOS does for a call or a hidden page', async () => {
      const { context, stopped } = contextIn('running');
      const { listeners, removed } = listenersOnDocument();

      AudioPlayer.resumeAudioContext();
      listeners.get('touchend')!(new Event('touchend'));
      await settle();
      expect(removed.size).toBe(3);

      context.state = 'interrupted';
      stopped();

      expect(removed.size).toBe(0);
    });
  });

  // --- fetching the bytes, through the cache builder ---

  describe('getBlobAsync (via createCacheAsync)', () => {
    it('logs and returns nothing on a bad response', async () => {
      const af = makeAudioFile({ url: 'http://example.com/fail.mp3', identifier: 'gb1' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await audioPlayerPrivate.createCacheAsync(af);
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('throws with neither a url nor bytes', async () => {
      const af = makeAudioFile({ identifier: 'gb2' }); // url='', blob=null
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await audioPlayerPrivate.createCacheAsync(af);
      expect(result).toBeNull();
      expect(errorSpy).toHaveBeenCalled();
    });

    it('returns the bytes it already has without fetching', async () => {
      const blob = new Blob(['data']);
      const af = makeAudioFile({ blob, identifier: 'gb3' });

      const result = await audioPlayerPrivate.createCacheAsync(af);
      expect(result).not.toBeNull();
      expect(result?.blob).toBe(blob);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns the existing cache for the same identifier', async () => {
      const blob = new Blob(['data']);
      const af = makeAudioFile({ blob, identifier: 'gb4' });
      const existingCache = { url: 'blob:existing', blob: new Blob(['existing']) };
      audioPlayerPrivate.cacheMap.set('gb4', existingCache);

      const result = await audioPlayerPrivate.createCacheAsync(af);
      expect(result).toBe(existingCache);
    });

    it('registers the cache on success', async () => {
      const blob = new Blob(['data']);
      const af = makeAudioFile({ blob, identifier: 'gb5' });

      await audioPlayerPrivate.createCacheAsync(af);
      expect(audioPlayerPrivate.cacheMap.has('gb5')).toBe(true);
    });
  });

  describe('removeCache()', () => {
    it('drops a cache and releases its url', () => {
      const cache = { url: 'blob:test-url', blob: new Blob(['data']) };
      audioPlayerPrivate.cacheMap.set('remove-test', cache);

      AudioPlayer.removeCache('remove-test');

      expect(audioPlayerPrivate.cacheMap.has('remove-test')).toBe(false);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('survives dropping a cache that is not there', () => {
      expect(() => AudioPlayer.removeCache('nonexistent')).not.toThrow();
    });
  });

  describe('clearAllCache()', () => {
    it('drops every cache and releases their urls', () => {
      const cache1 = { url: 'blob:url-1', blob: new Blob(['data1']) };
      const cache2 = { url: 'blob:url-2', blob: new Blob(['data2']) };
      audioPlayerPrivate.cacheMap.set('clear-1', cache1);
      audioPlayerPrivate.cacheMap.set('clear-2', cache2);

      AudioPlayer.clearAllCache();

      expect(audioPlayerPrivate.cacheMap.size).toBe(0);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-2');
    });
  });

  describe('cache eviction', () => {
    it('drops the oldest entries once the cache is full', async () => {
      const maxSize = audioPlayerPrivate.MAX_CACHE_SIZE;

      // Fill cache to max
      for (let i = 0; i < maxSize + 5; i++) {
        const cache = { url: `blob:url-${i}`, blob: new Blob([`data-${i}`]) };
        audioPlayerPrivate.cacheMap.set(`evict-${i}`, cache);
      }

      audioPlayerPrivate.evictCacheIfNeeded();

      expect(audioPlayerPrivate.cacheMap.size).toBe(maxSize);
      // Oldest entries should be removed
      expect(audioPlayerPrivate.cacheMap.has('evict-0')).toBe(false);
      // Newest entries should remain
      expect(audioPlayerPrivate.cacheMap.has(`evict-${maxSize + 4}`)).toBe(true);
    });
  });

  describe('following the loop points a file names', () => {
    type LoopSource = AudioBufferSourceNodeMock & { loop?: boolean; loopStart?: number; loopEnd?: number };
    const sources = () => audioCtxMock.createBufferSource.mock.results.map((result) => result.value as LoopSource);
    // A second long, at 8000 samples a second: the part from a quarter to three quarters goes round.
    const looping = () =>
      makeAudioFile({ blob: loopTaggedWavBlob({ start: 2000, end: 5999 }), identifier: 'looping-bgm' });
    const plain = () => makeAudioFile({ blob: loopTaggedWavBlob(null), identifier: 'plain-bgm' });

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
      const long = makeAudioFile({
        blob: loopTaggedWavBlob({ start: 2000, end: 5999 }, { rate: 8, frames: 8 * 60 * 60 }),
        identifier: 'long-bgm',
      });

      follower().play(long);

      await vi.waitFor(() => expect(audioElmMock.play).toHaveBeenCalledOnce());
      expect(audioCtxMock.decodeAudioData).not.toHaveBeenCalled();
    });
  });
});
