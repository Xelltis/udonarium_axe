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

class FakeOfflineAudioContext {
  readonly destination = {};
  constructor(readonly options: { numberOfChannels: number; sampleRate: number; length: number }) {}

  async decodeAudioData(data: ArrayBuffer): Promise<{ duration: number; name: string }> {
    const name = new TextDecoder().decode(data);
    if (decodeFails.includes(name)) throw new Error('壊れている');
    decoded.push(name);
    return { duration: 10, name };
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
    await mixReplaySoundtrack(track({ effects: [ase(2500)] }), read);

    expect(started).toEqual([
      { buffer: 'se-1', startedAt: 2.5, offset: 0, duration: undefined, loop: false, gain: 0.9 },
    ]);
  });

  it('loops the music for as long as its stretch lasts', async () => {
    await mixReplaySoundtrack(track({ music: [abgm(1000, 6000, 12_000)] }), read);

    expect(started[0]).toMatchObject({ buffer: 'bgm-1', startedAt: 1, duration: 5, loop: true });
  });

  it('wraps a start point past the end of the track', async () => {
    await mixReplaySoundtrack(track({ music: [abgm(0, 5000, 12_000)] }), read);
    expect(started[0].offset).toBe(2);
  });

  it('loads the same sound once', async () => {
    await mixReplaySoundtrack(track({ effects: [ase(0), ase(1000), ase(2000)] }), read);
    expect(decoded).toEqual(['se-1']);
  });

  it('mixes the rest past a sound it cannot read', async () => {
    decodeFails = ['bgm-1'];
    const mixed = await mixReplaySoundtrack(
      track({ effects: [ase(0)], music: [{ ...abgm(0, 5000, 0), audioIdentifier: 'bgm-1' }] }),
      read
    );

    expect(started.map((one) => one.buffer)).toEqual(['se-1']);
    expect(mixed).not.toBeNull();
  });

  it('returns nothing when it can read none of them', async () => {
    expect(await mixReplaySoundtrack(track({ effects: [{ ...ase(0), audioIdentifier: 'missing' }] }), read)).toBeNull();
  });

  it('holds the whole mix under full scale so nothing clips', async () => {
    await mixReplaySoundtrack(
      track({
        effects: [{ audioIdentifier: 'se', startMs: 0, offsetMs: 0, gain: 0.9 }],
        music: [{ audioIdentifier: 'bgm', startMs: 0, offsetMs: 0, gain: 0.45, endMs: 5000, fadeMs: 0 }],
      }),
      read
    );

    expect(limiter).toMatchObject({ threshold: REPLAY_LIMIT_DB, ratio: 20, fed: 2 });
    expect(limiter?.into).toBeDefined();
    expect(REPLAY_LIMIT_DB).toBeLessThan(0);
  });

  it('returns a waveform as long as the video', async () => {
    const mixed = await mixReplaySoundtrack(track({ effects: [ase(0)], totalMs: 2000 }), read);

    expect(mixed?.sampleRate).toBe(48_000);
    expect(mixed?.channels).toHaveLength(2);
    expect(mixed?.channels[0].length).toBe(96_000);
  });
});

function ase(startMs = 0) {
  return { audioIdentifier: 'se-1', startMs, offsetMs: 0, gain: 0.9 };
}

function abgm(startMs: number, endMs: number, offsetMs: number) {
  return { audioIdentifier: 'bgm-1', startMs, endMs, offsetMs, gain: 0.45, fadeMs: 600 };
}
