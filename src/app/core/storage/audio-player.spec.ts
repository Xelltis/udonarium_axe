import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer, VolumeType } from '@axe/core/storage/audio-player';

// ─── AudioContext mock ────────────────────────────────────────────────────────

type GainNodeMock = {
  gain: { setValueAtTime: ReturnType<typeof vi.fn>; setTargetAtTime: ReturnType<typeof vi.fn> };
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
};

function makeGainNode(): GainNodeMock {
  return {
    gain: { setValueAtTime: vi.fn(), setTargetAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function makeBufferSource(): AudioBufferSourceNodeMock {
  return {
    buffer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
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
        resolve({ duration: 1 } as AudioBuffer);
      }
    ),
  };
}

// ─── HTMLAudioElement mock ────────────────────────────────────────────────────

type AudioElmMock = {
  volume: number;
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
  _masterGainNode: unknown;
  _auditionGainNode: unknown;
  _seGainNode: unknown;
  _volume: number;
  _auditionVolume: number;
  _seVolume: number;
  cacheMap: Map<string, { url: string; blob: Blob }>;
  MAX_CACHE_SIZE: number;
  evictCacheIfNeeded: () => void;
  createCacheAsync: (audio: AudioFile) => Promise<{ url: string; blob: Blob } | null>;
};

type AudioPlayerPrivateInstance = {
  _audioElm?: unknown;
};

const DEFAULT_VOLUME = 0.5;

const audioPlayerPrivate = AudioPlayer as unknown as AudioPlayerPrivateStatic;
const asAudioPlayerPrivate = (player: AudioPlayer): AudioPlayerPrivateInstance =>
  player as unknown as AudioPlayerPrivateInstance;

function resetStaticState() {
  // reset the static fields so nothing leaks between tests
  audioPlayerPrivate._audioContext = undefined;
  audioPlayerPrivate._masterGainNode = undefined;
  audioPlayerPrivate._auditionGainNode = undefined;
  audioPlayerPrivate._seGainNode = undefined;
  // written to rather than set through the setters, which would build the gain graph a test
  // has yet to ask for. A test that reads a default has to find one whatever ran before it.
  audioPlayerPrivate._volume = DEFAULT_VOLUME;
  audioPlayerPrivate._auditionVolume = DEFAULT_VOLUME;
  audioPlayerPrivate._seVolume = DEFAULT_VOLUME;
  audioPlayerPrivate.cacheMap.clear();
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

  // ─── static rootNode / auditionNode ──────────────────────────────────────

  describe('static rootNode', () => {
    it('returns the master gain', () => {
      const node = AudioPlayer.rootNode;
      expect(audioCtxMock.createGain).toHaveBeenCalledOnce();
      expect(node).toBeDefined();
    });
  });

  describe('static auditionNode', () => {
    it('returns the audition gain', () => {
      const node = AudioPlayer.auditionNode;
      expect(node).toBeDefined();
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

  // ─── static seNode ───────────────────────────────────────────────────────

  describe('static seNode', () => {
    it('returns the effects gain', () => {
      const node = AudioPlayer.seNode;
      expect(node).toBeDefined();
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
      const auditionNodeRef = AudioPlayer.auditionNode;
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(src.connect).toHaveBeenCalledWith(auditionNodeRef);
    });

    it('connects the master volume to the root node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.MASTER;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'mst' });
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      const masterGain = audioCtxMock.createGain.mock.results[0].value as GainNodeMock;
      expect(src.connect).toHaveBeenCalledWith(masterGain);
    });

    it('connects a sound effect to the effects node', () => {
      const player = new AudioPlayer();
      player.volumeType = VolumeType.SE;
      const af = makeAudioFile({ blob: new Blob(['x']), identifier: 'se1' });
      // touch the effects node first so its gain exists
      const seNodeRef = AudioPlayer.seNode;
      player.play(af);
      const src = audioCtxMock.createMediaElementSource.mock.results[0].value;
      expect(src.connect).toHaveBeenCalledWith(seNodeRef);
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

  describe('static play()', () => {
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
    it('resumes the context on the first touch and unhooks itself', () => {
      const listeners: Record<string, EventListenerOrEventListenerObject> = {};
      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
        listeners[type] = listener as EventListenerOrEventListenerObject;
      });
      const removeSpy = vi.spyOn(document, 'removeEventListener').mockImplementation(() => {});

      AudioPlayer.resumeAudioContext();

      const callback = listeners['touchstart'] as EventListener;
      callback(new Event('touchstart'));

      expect(audioCtxMock.resume).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalledWith('touchstart', callback, true);
      expect(removeSpy).toHaveBeenCalledWith('mousedown', callback, true);
    });

    it('does the same on a press', () => {
      const listeners: Record<string, EventListenerOrEventListenerObject> = {};
      vi.spyOn(document, 'addEventListener').mockImplementation((type, listener) => {
        listeners[type] = listener as EventListenerOrEventListenerObject;
      });
      vi.spyOn(document, 'removeEventListener').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      AudioPlayer.resumeAudioContext();

      const callback = listeners['mousedown'] as EventListener;
      callback(new Event('mousedown'));

      expect(audioCtxMock.resume).toHaveBeenCalled();
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
});
