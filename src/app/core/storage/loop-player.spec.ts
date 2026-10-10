import { Logger, LogLevel } from '@axe/core/logging/logger';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioPlayer } from '@axe/core/storage/audio-player';
import {
  LOOP_FROM_MEMORY_MAX_DECODED_BYTES,
  LOOP_FROM_MEMORY_MAX_FILE_BYTES,
  LoopPlayer,
} from '@axe/core/storage/loop-player';
import { loopTaggedWavBlob } from '@axe/testing/loop-tagged-audio';

type ParamMock = {
  value: number;
  setValueAtTime: ReturnType<typeof vi.fn>;
  setTargetAtTime: ReturnType<typeof vi.fn>;
  linearRampToValueAtTime: ReturnType<typeof vi.fn>;
  cancelScheduledValues: ReturnType<typeof vi.fn>;
};
type GainMock = { gain: ParamMock; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
type SourceMock = {
  buffer: unknown;
  loop: boolean;
  loopStart?: number;
  loopEnd?: number;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};
type ElementMock = {
  loop: boolean;
  src: string;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
};

function makeParam(): ParamMock {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  };
}

function makeContext(decodedLength = 44100) {
  return {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    resume: vi.fn().mockResolvedValue(undefined),
    createGain: vi.fn((): GainMock => ({ gain: makeParam(), connect: vi.fn(), disconnect: vi.fn() })),
    createBufferSource: vi.fn((): SourceMock => ({
      buffer: null,
      loop: false,
      connect: vi.fn(),
      disconnect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    })),
    createMediaElementSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    decodeAudioData: vi.fn((_data: ArrayBuffer, resolve: (buffer: object) => void) =>
      resolve({ duration: 1, length: decodedLength, numberOfChannels: 2 })
    ),
  };
}

function makeAudio(opts: { identifier?: string; blob?: Blob | null; url?: string } = {}): AudioFile {
  const audio = AudioFile.createEmpty(opts.identifier ?? 'rain');
  const context = (audio as unknown as { context: Record<string, unknown> }).context;
  context['blob'] = opts.blob === undefined ? new Blob(['x']) : opts.blob;
  context['url'] = opts.url ?? 'blob:rain';
  return audio;
}

type AudioPlayerStatics = { _audioContext: unknown; channels: Map<unknown, unknown> };

describe('LoopPlayer', () => {
  let context: ReturnType<typeof makeContext>;
  let elements: ElementMock[];
  let playResult: () => Promise<void>;

  const installContext = (decodedLength?: number) => {
    context = makeContext(decodedLength);
    const captured = context;
    function AudioContextCtor() {
      return captured;
    }
    vi.stubGlobal('AudioContext', AudioContextCtor);
    vi.stubGlobal('webkitAudioContext', AudioContextCtor);
    const statics = AudioPlayer as unknown as AudioPlayerStatics;
    statics._audioContext = undefined;
    statics.channels.clear();
  };

  /** The gain node the player made for itself, which comes after the background channel's own. */
  const playerGain = (): GainMock => {
    const gains = context.createGain.mock.results.map((result) => result.value as GainMock);
    return gains.find((gain) => gain.connect.mock.calls.some(([to]) => to === AudioPlayer.backgroundNode))!;
  };
  const sources = (): SourceMock[] => context.createBufferSource.mock.results.map((r) => r.value as SourceMock);

  beforeEach(() => {
    Logger.setLevel(LogLevel.ERROR);
    installContext();
    elements = [];
    playResult = () => Promise.resolve();
    function AudioCtor() {
      const element: ElementMock = {
        loop: false,
        src: '',
        play: vi.fn(() => playResult()),
        pause: vi.fn(),
        load: vi.fn(),
      };
      elements.push(element);
      return element;
    }
    vi.stubGlobal('Audio', AudioCtor);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    const statics = AudioPlayer as unknown as AudioPlayerStatics;
    statics._audioContext = undefined;
    statics.channels.clear();
  });

  describe('a small file', () => {
    it('is looped from memory through the background channel', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 1500);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      const [source] = sources();
      expect(source.loop).toBe(true);
      expect(source.start).toHaveBeenCalledOnce();
      expect(source.connect).toHaveBeenCalledWith(playerGain());
      expect(elements).toHaveLength(0);
    });

    it('rises from silence to its volume over the fade', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 1500);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      const param = playerGain().gain;
      expect(param.setValueAtTime).toHaveBeenLastCalledWith(0, 0);
      expect(param.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.8, 1.5);
    });

    it('is streamed instead when it decodes into more than the memory allowed', async () => {
      const length = LOOP_FROM_MEMORY_MAX_DECODED_BYTES / 8 + 1;
      installContext(length);
      const player = new LoopPlayer();
      player.start(makeAudio(), 1, 0);

      await vi.waitFor(() => expect(elements).toHaveLength(1));
      expect(sources()).toHaveLength(0);
    });
  });

  describe('a large file', () => {
    it('is streamed through an element that loops, without being decoded', async () => {
      const big = new Blob([new Uint8Array(LOOP_FROM_MEMORY_MAX_FILE_BYTES + 1)]);
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: big, url: 'blob:big' }), 1, 0);

      await vi.waitFor(() => expect(elements).toHaveLength(1));
      expect(elements[0].loop).toBe(true);
      expect(elements[0].src).toBe('blob:big');
      expect(elements[0].play).toHaveBeenCalledOnce();
      expect(context.decodeAudioData).not.toHaveBeenCalled();
    });
  });

  describe('a file that names where it loops', () => {
    // A second long at 8000 samples a second, with the part from a quarter to three quarters going round.
    const loop = { start: 2000, end: 5999 };

    it('goes round between the points it names', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: loopTaggedWavBlob(loop) }), 1, 0);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(sources()[0]).toMatchObject({ loop: true, loopStart: 0.25, loopEnd: 0.75 });
    });

    it('is decoded to go round between them even when it is large', async () => {
      const large = loopTaggedWavBlob(loop, { frames: 600_000 });
      expect(large.size).toBeGreaterThan(LOOP_FROM_MEMORY_MAX_FILE_BYTES);
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: large }), 1, 0);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(sources()[0]).toMatchObject({ loopStart: 0.25, loopEnd: 0.75 });
      expect(elements).toHaveLength(0);
    });

    it('goes round whole when it names none', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: loopTaggedWavBlob(null) }), 1, 0);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(sources()[0].loop).toBe(true);
      expect(sources()[0].loopStart).toBeUndefined();
    });
  });

  describe('a sound only linked to', () => {
    it('is streamed from its link', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: null, url: 'https://example.com/rain.mp3' }), 1, 0);

      await vi.waitFor(() => expect(elements).toHaveLength(1));
      expect(elements[0].src).toBe('https://example.com/rain.mp3');
    });
  });

  describe('stop()', () => {
    it('fades out and lets the sound go only once the fade is over', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      vi.useFakeTimers();

      player.stop(1500);
      expect(player.isActive).toBe(false);
      expect(playerGain().gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.5);
      expect(sources()[0].stop).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1500);
      expect(sources()[0].stop).toHaveBeenCalledOnce();
      expect(sources()[0].disconnect).toHaveBeenCalled();
    });

    it('lets the sound go at once without a fade', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      player.stop(0);
      expect(sources()[0].stop).toHaveBeenCalledOnce();
    });

    it('keeps a sound still being decoded from ever starting', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 0);
      player.stop(1500);

      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(context.decodeAudioData).toHaveBeenCalled();
      expect(sources()).toHaveLength(0);
    });

    it('lets the fading sound go at once when the player is disposed', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      player.stop(1500);
      player.dispose();
      expect(sources()[0].stop).toHaveBeenCalledOnce();
      expect(playerGain().disconnect).toHaveBeenCalled();
    });
  });

  describe('start() again', () => {
    it('brings the same sound back up while it is fading out, rather than starting it over', async () => {
      const audio = makeAudio();
      const player = new LoopPlayer();
      player.start(audio, 0.8, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      vi.useFakeTimers();

      player.stop(1500);
      vi.advanceTimersByTime(500);
      player.start(audio, 0.6, 1500);
      vi.advanceTimersByTime(2000);

      expect(player.isActive).toBe(true);
      expect(sources()).toHaveLength(1);
      expect(sources()[0].stop).not.toHaveBeenCalled();
      expect(playerGain().gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.6, 1.5);
    });

    it('lets one sound go for another', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio({ identifier: 'rain' }), 1, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      player.start(makeAudio({ identifier: 'fire' }), 1, 0);
      expect(sources()[0].stop).toHaveBeenCalledOnce();
      await vi.waitFor(() => expect(sources()).toHaveLength(2));
    });
  });

  describe('setVolume()', () => {
    it('glides a sounding loop to the new volume', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 0);
      await vi.waitFor(() => expect(sources()).toHaveLength(1));

      player.setVolume(0.3);
      expect(playerGain().gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.3, 0.08);
    });

    it('is kept for a sound still loading, which then fades in to it', async () => {
      const player = new LoopPlayer();
      player.start(makeAudio(), 0.8, 1000);
      player.setVolume(0.3);

      await vi.waitFor(() => expect(sources()).toHaveLength(1));
      expect(playerGain().gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0.3, 1);
    });
  });

  describe('isAwaitingGesture', () => {
    it('is set when the browser refuses a streamed sound for want of a gesture', async () => {
      playResult = () => Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: null }), 1, 0);

      await vi.waitFor(() => expect(player.isAwaitingGesture).toBe(true));
    });

    it('is not set when a streamed sound fails for another reason', async () => {
      playResult = () => Promise.reject(Object.assign(new Error('gone'), { name: 'NotSupportedError' }));
      const player = new LoopPlayer();
      player.start(makeAudio({ blob: null }), 1, 0);

      await vi.waitFor(() => expect(elements[0]?.play).toHaveBeenCalled());
      await Promise.resolve();
      expect(player.isAwaitingGesture).toBe(false);
    });
  });
});
