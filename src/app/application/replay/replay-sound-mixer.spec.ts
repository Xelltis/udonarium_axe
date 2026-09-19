import {
  isSoundMixingSupported,
  mixReplaySoundtrack,
  REPLAY_LIMIT_DB,
} from '@axe/application/replay/replay-sound-mixer';
import type { ReplaySoundtrack } from '@axe/domain/replay/replay-soundtrack';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

const globals = globalThis as unknown as Record<string, unknown>;

interface StartedSource {
  buffer: string;
  startedAt: number;
  offset: number;
  duration?: number;
  loop: boolean;
  gain: number;
}

let started: StartedSource[];
let limiter: { threshold: number; ratio: number; into: unknown; fed: number } | null;
let decoded: string[];
let decodeFails: string[];
/** Ten seconds at 48 kHz, as every stand-in sound decodes to. */
const DECODED_FRAMES = 480_000;
const ONE_SOUND_BYTES = DECODED_FRAMES * 2 * 4;

class FakeOfflineAudioContext {
  readonly destination = {};
  constructor(readonly options: { numberOfChannels: number; sampleRate: number; length: number }) {}

  async decodeAudioData(
    data: ArrayBuffer
  ): Promise<{ duration: number; name: string; length: number; numberOfChannels: number }> {
    const name = new TextDecoder().decode(data);
    if (decodeFails.includes(name)) throw new Error('壊れている');
    decoded.push(name);
    return { duration: 10, name, length: DECODED_FRAMES, numberOfChannels: 2 };
  }

  createBufferSource() {
    const source = {
      buffer: null as { name: string } | null,
      loop: false,
      connect: (next: unknown) => next,
      start: (startedAt: number, offset: number, duration?: number) => {
        started.push({
          buffer: source.buffer?.name ?? '',
          startedAt,
          offset,
          duration,
          loop: source.loop,
          gain: lastGain,
        });
      },
    };
    return source;
  }

  createDynamicsCompressor() {
    const node = {
      threshold: { value: 0 },
      knee: { value: 0 },
      ratio: { value: 1 },
      attack: { value: 0 },
      release: { value: 0 },
      connect: (next: unknown) => {
        limiter!.into = next;
        return next;
      },
    };
    limiter = { threshold: 0, ratio: 1, into: null, fed: 0 };
    Object.defineProperty(node.threshold, 'value', { set: (value: number) => (limiter!.threshold = value) });
    Object.defineProperty(node.ratio, 'value', { set: (value: number) => (limiter!.ratio = value) });
    compressor = node;
    return node;
  }

  createGain() {
    const node = {
      gain: {
        value: 1,
        setValueAtTime: () => undefined,
        linearRampToValueAtTime: () => undefined,
      },
      connect: (next: unknown) => {
        if (next === compressor && limiter) limiter.fed += 1;
        return next;
      },
    };
    Object.defineProperty(node.gain, 'value', {
      get: () => lastGain,
      set: (value: number) => {
        lastGain = value;
      },
    });
    return node;
  }

  async startRendering() {
    return {
      sampleRate: this.options.sampleRate,
      numberOfChannels: this.options.numberOfChannels,
      getChannelData: () => new Float32Array(this.options.length),
    };
  }
}

let lastGain = 1;
let compressor: unknown = null;

function track(overrides: Partial<ReplaySoundtrack> = {}): ReplaySoundtrack {
  return { effects: [], music: [], totalMs: 10_000, ...overrides };
}

const read = async (identifier: string): Promise<ArrayBuffer | null> => {
  if (identifier === 'missing') return null;
  return new TextEncoder().encode(identifier).buffer as ArrayBuffer;
};

/** Mixes a soundtrack and reads the whole of it, the way a short video does. */
async function mixAll(soundtrack: ReplaySoundtrack) {
  const mixed = await mixReplaySoundtrack(soundtrack, read);
  if (mixed) await mixed.read(0, mixed.length);
  return mixed;
}

describe('mixReplaySoundtrack()', () => {
  const borrowed = new BorrowedGlobals();

  beforeEach(() => {
    started = [];
    decoded = [];
    decodeFails = [];
    lastGain = 1;
    limiter = null;
    compressor = null;
    borrowed.lend('OfflineAudioContext', FakeOfflineAudioContext);
  });

  afterEach(() => {
    borrowed.giveBack();
  });

  it('returns nothing where mixing is unavailable', async () => {
    delete globals['OfflineAudioContext'];
    expect(isSoundMixingSupported()).toBe(false);
    expect(await mixReplaySoundtrack(track({ effects: [ase()] }), read)).toBeNull();
  });

  it('returns nothing when there is no sound to play', async () => {
    expect(await mixReplaySoundtrack(track(), read)).toBeNull();
  });

  it('places each sound at its own moment', async () => {
    await mixAll(track({ effects: [ase(2500)] }));

    expect(started).toEqual([
      { buffer: 'se-1', startedAt: 2.5, offset: 0, duration: undefined, loop: false, gain: 0.9 },
    ]);
  });

  it('loops the music for as long as its stretch lasts', async () => {
    await mixAll(track({ music: [abgm(1000, 6000, 12_000)] }));

    expect(started[0]).toMatchObject({ buffer: 'bgm-1', startedAt: 1, duration: 5, loop: true });
  });

  it('wraps a start point past the end of the track', async () => {
    await mixAll(track({ music: [abgm(0, 5000, 12_000)] }));
    expect(started[0].offset).toBe(2);
  });

  it('loads the same sound once', async () => {
    await mixAll(track({ effects: [ase(0), ase(1000), ase(2000)] }));
    expect(decoded).toEqual(['se-1']);
  });

  it('mixes the rest past a sound it cannot read', async () => {
    decodeFails = ['bgm-1'];
    const mixed = await mixAll(
      track({ effects: [ase(0)], music: [{ ...abgm(0, 5000, 0), audioIdentifier: 'bgm-1' }] })
    );

    expect(started.map((one) => one.buffer)).toEqual(['se-1']);
    expect(mixed).not.toBeNull();
  });

  it('returns nothing when it can read none of them', async () => {
    expect(await mixReplaySoundtrack(track({ effects: [{ ...ase(0), audioIdentifier: 'missing' }] }), read)).toBeNull();
  });

  it('holds the whole mix under full scale so nothing clips', async () => {
    await mixAll(
      track({
        effects: [{ audioIdentifier: 'se', startMs: 0, offsetMs: 0, gain: 0.9 }],
        music: [{ audioIdentifier: 'bgm', startMs: 0, offsetMs: 0, gain: 0.45, endMs: 5000, fadeMs: 0 }],
      })
    );

    expect(limiter).toMatchObject({ threshold: REPLAY_LIMIT_DB, ratio: 20, fed: 2 });
    expect(limiter?.into).toBeDefined();
    expect(REPLAY_LIMIT_DB).toBeLessThan(0);
  });

  it('hands over a track as long as the video, a stretch at a time', async () => {
    const mixed = await mixReplaySoundtrack(track({ effects: [ase(0)], totalMs: 2000 }), read);

    expect(mixed).toMatchObject({ sampleRate: 48_000, numberOfChannels: 2, length: 96_000 });
    const stretch = await mixed!.read(48_000, 30_000);
    expect(stretch).toHaveLength(2);
    expect(stretch[0].length).toBe(30_000);
    expect((await mixed!.read(90_000, 30_000))[0].length).toBe(6_000);
  });

  it('places a sound within the stretch it falls in', async () => {
    const mixed = await mixReplaySoundtrack(track({ effects: [ase(2500)] }), read);
    await mixed!.read(2 * 48_000, 48_000);

    expect(started).toEqual([
      { buffer: 'se-1', startedAt: 1.5, offset: 0, duration: undefined, loop: false, gain: 0.9 },
    ]);
  });

  it('picks up a sound already playing from where it had got to', async () => {
    const mixed = await mixReplaySoundtrack(track({ effects: [ase(500)] }), read);
    await mixed!.read(3 * 48_000, 48_000);

    expect(started[0]).toMatchObject({ startedAt: 0, offset: 1.5 });
  });

  it('picks the music up mid-loop in a later stretch', async () => {
    const mixed = await mixReplaySoundtrack(track({ music: [abgm(0, 9000, 0)] }), read);
    await mixed!.read(4 * 48_000, 48_000);

    expect(started[0]).toMatchObject({ buffer: 'bgm-1', startedAt: 0, offset: 3, duration: 2, loop: true });
  });

  describe('holding decoded sound', () => {
    const music = (identifier: string, startMs: number, endMs: number) => ({
      ...abgm(startMs, endMs, 0),
      audioIdentifier: identifier,
    });
    const soundtrack = track({
      totalMs: 30_000,
      music: [music('bgm-a', 0, 10_000), music('bgm-b', 10_000, 20_000), music('bgm-a', 20_000, 30_000)],
    });

    async function readInStretches(mixed: Awaited<ReturnType<typeof mixReplaySoundtrack>>): Promise<void> {
      for (let start = 0; start < mixed!.length; start += 5 * 48_000) await mixed!.read(start, 5 * 48_000);
    }

    it('decodes each sound once where there is room for them all', async () => {
      await readInStretches(await mixReplaySoundtrack(soundtrack, read));

      expect(decoded).toEqual(['bgm-a', 'bgm-b']);
    });

    it('lets go of music it has moved past, and decodes it again when it returns', async () => {
      const mixed = await mixReplaySoundtrack(soundtrack, read, ONE_SOUND_BYTES);
      decoded = [];
      await readInStretches(mixed);

      expect(decoded).toEqual(['bgm-a', 'bgm-b', 'bgm-a']);
    });

    it('keeps every sound a stretch needs, whatever the budget', async () => {
      const mixed = await mixReplaySoundtrack(soundtrack, read, 1);
      started = [];
      await mixed!.read(9 * 48_000, 2 * 48_000);

      expect(started.map((one) => one.buffer)).toEqual(['bgm-a', 'bgm-b']);
    });

    it('leaves out a sound it cannot read again, and mixes the rest', async () => {
      let reads = 0;
      const failingSecondTime = async (identifier: string): Promise<ArrayBuffer | null> => {
        if (identifier === 'bgm-a' && ++reads > 1) throw new Error('gone');
        return read(identifier);
      };
      const mixed = await mixReplaySoundtrack(soundtrack, failingSecondTime, ONE_SOUND_BYTES);
      started = [];

      await expect(readInStretches(mixed)).resolves.toBeUndefined();
      expect(started.map((one) => one.buffer)).toEqual(['bgm-b', 'bgm-b', 'bgm-b']);
    });

    it('holds on to what the next stretch still needs rather than decoding it again', async () => {
      const together = track({ totalMs: 20_000, music: [music('bgm-a', 0, 20_000), music('bgm-b', 0, 20_000)] });
      const mixed = await mixReplaySoundtrack(together, read, 1);
      decoded = [];
      await readInStretches(mixed);

      expect(decoded).toEqual(['bgm-a']);
    });
  });

  it('leaves out of a stretch the sounds that have finished before it', async () => {
    const mixed = await mixReplaySoundtrack(track({ effects: [ase(0)], totalMs: 60_000 }), read);
    await mixed!.read(30 * 48_000, 48_000);

    expect(started).toEqual([]);
  });
});

function ase(startMs = 0) {
  return { audioIdentifier: 'se-1', startMs, offsetMs: 0, gain: 0.9 };
}

function abgm(startMs: number, endMs: number, offsetMs: number) {
  return { audioIdentifier: 'bgm-1', startMs, endMs, offsetMs, gain: 0.45, fadeMs: 600 };
}
