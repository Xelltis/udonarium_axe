import {
  AUDIO_FRAME_SAMPLES,
  avcCodecFor,
  defaultVideoBitrate,
  encodeVideo,
  isVideoEncodingSupported,
  keyframeIntervalFor,
  SOUND_READ_FRAMES,
  soundOfChannels,
} from '@axe/core/media/video-encoder';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

interface FakeEncoderCall {
  timestamp: number;
  keyFrame: boolean;
}

const globals = globalThis as unknown as Record<string, unknown>;

class FakeOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
  getContext(): { canvas: FakeOffscreenCanvas } | null {
    return hasContext ? { canvas: this } : null;
  }
}

let hasContext = true;
let calls: FakeEncoderCall[];
let configured: Record<string, unknown> | null;
let closed = false;
let flushed = false;
let failOn: number | null = null;
let audioFrames: number[];
let audioConfigured: Record<string, unknown> | null;

class FakeEncodedVideoChunk {
  readonly type: string;
  readonly timestamp: number;
  readonly duration: number;
  readonly byteLength: number;
  private readonly payload = new Uint8Array([0, 0, 0, 1, 0x65]);

  constructor(init: { type: string; timestamp: number; duration: number }) {
    this.type = init.type;
    this.timestamp = init.timestamp;
    this.duration = init.duration;
    this.byteLength = this.payload.byteLength;
  }
  copyTo(destination: Uint8Array): void {
    destination.set(this.payload);
  }
}

class FakeEncodedAudioChunk {
  readonly type = 'key';
  readonly byteLength = 4;
  readonly duration = 21_333;
  private readonly payload = new Uint8Array([1, 2, 3, 4]);
  constructor(readonly timestamp: number) {}
  copyTo(destination: Uint8Array): void {
    destination.set(this.payload);
  }
}

class FakeAudioData {
  constructor(readonly init: { timestamp: number; numberOfFrames: number }) {}
  close(): void {}
}

class FakeAudioEncoder {
  state = 'unconfigured';
  encodeQueueSize = 0;
  private readonly output: (chunk: unknown, meta: unknown) => void;

  constructor(init: { output: (chunk: unknown, meta: unknown) => void; error: (reason: unknown) => void }) {
    this.output = init.output;
  }
  configure(config: Record<string, unknown>): void {
    audioConfigured = config;
    this.state = 'configured';
  }
  encode(data: FakeAudioData): void {
    audioFrames.push(data.init.numberOfFrames);
    this.output(new FakeEncodedAudioChunk(data.init.timestamp), {
      decoderConfig: { codec: 'mp4a.40.2', description: new Uint8Array([18, 16]) },
    });
  }
  async flush(): Promise<void> {}
  close(): void {
    this.state = 'closed';
  }
}

class FakeVideoFrame {
  readonly timestamp: number;
  constructor(_source: unknown, init: { timestamp: number }) {
    this.timestamp = init.timestamp;
  }
  close(): void {}
}

class FakeVideoEncoder {
  state = 'unconfigured';
  encodeQueueSize = 0;
  private readonly error: (reason: unknown) => void;
  private readonly output: (chunk: unknown, meta: unknown) => void;

  constructor(init: { output: (chunk: unknown, meta: unknown) => void; error: (reason: unknown) => void }) {
    this.error = init.error;
    this.output = init.output;
  }
  configure(config: Record<string, unknown>): void {
    configured = config;
    this.state = 'configured';
  }
  encode(frame: FakeVideoFrame, options: { keyFrame: boolean }): void {
    if (failOn !== null && calls.length === failOn) this.error(new Error('encoder gave up'));
    calls.push({ timestamp: frame.timestamp, keyFrame: options.keyFrame });

    this.output(
      new FakeEncodedVideoChunk({
        type: options.keyFrame ? 'key' : 'delta',
        timestamp: frame.timestamp,
        duration: 33333,
      }),
      calls.length === 1
        ? { decoderConfig: { codec: 'avc1.64001f', description: new Uint8Array([1, 100, 0, 31, 255, 225, 0, 0, 0]) } }
        : undefined
    );
  }
  async flush(): Promise<void> {
    flushed = true;
  }
  close(): void {
    closed = true;
    this.state = 'closed';
  }
}

describe('video encoding', () => {
  const borrowed = new BorrowedGlobals();

  beforeEach(() => {
    calls = [];
    configured = null;
    closed = false;
    flushed = false;
    failOn = null;
    hasContext = true;
    borrowed.lend('OffscreenCanvas', FakeOffscreenCanvas);
    borrowed.lend('VideoEncoder', FakeVideoEncoder);
    borrowed.lend('VideoFrame', FakeVideoFrame);
    borrowed.lend('EncodedVideoChunk', FakeEncodedVideoChunk);
    audioFrames = [];
    audioConfigured = null;
    borrowed.lend('AudioEncoder', FakeAudioEncoder);
    borrowed.lend('AudioData', FakeAudioData);
    borrowed.lend('EncodedAudioChunk', FakeEncodedAudioChunk);
  });

  afterEach(() => {
    borrowed.giveBack();
  });

  function request(overrides: Record<string, unknown> = {}) {
    return {
      width: 1280,
      height: 720,
      fps: 30,
      frameCount: 3,
      paint: vi.fn(),
      ...overrides,
    };
  }

  it('checks whether the browser can do it', () => {
    expect(isVideoEncodingSupported()).toBe(true);

    delete globals['VideoEncoder'];
    expect(isVideoEncodingSupported()).toBe(false);
  });

  it('returns nothing where exporting is unavailable', async () => {
    delete globals['VideoFrame'];
    expect(await encodeVideo(request())).toBeNull();
  });

  it('draws frame by frame into an mp4', async () => {
    const paint = vi.fn();
    const result = await encodeVideo(request({ paint }));

    expect(paint).toHaveBeenCalledTimes(3);
    expect(paint.mock.calls.map((call) => call[1])).toEqual([0, 1, 2]);
    expect(calls.map((call) => call.timestamp)).toEqual([0, 33333, 66667]);
    expect(flushed).toBe(true);
    expect(result?.extension).toBe('mp4');
    expect(result?.blob?.type).toBe('video/mp4');
  });

  it('makes the first frame a keyframe, and one every two seconds after', async () => {
    await encodeVideo(request({ fps: 60, frameCount: 122 }));

    expect(keyframeIntervalFor(60)).toBe(120);
    expect(calls[0].keyFrame).toBe(true);
    expect(calls[1].keyFrame).toBe(false);
    expect(calls[120].keyFrame).toBe(true);
  });

  it('reports its progress', async () => {
    const onProgress = vi.fn();
    await encodeVideo(request({ onProgress }));

    expect(onProgress.mock.calls).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('stops where it is when cancelled', async () => {
    const paint = vi.fn();
    const result = await encodeVideo(request({ paint, frameCount: 10, isCancelled: () => calls.length >= 2 }));

    expect(result).toBeNull();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(closed).toBe(true);
  });

  it('lets go of the file it was writing when cancelled, leaving it unfinished', async () => {
    class FakeWritable {
      write = vi.fn().mockResolvedValue(undefined);
      seek = vi.fn().mockResolvedValue(undefined);
      truncate = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      abort = vi.fn().mockResolvedValue(undefined);
    }
    borrowed.lend('FileSystemWritableFileStream', FakeWritable);
    const writable = new FakeWritable();
    const file = { createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;

    const result = await encodeVideo(request({ file, frameCount: 10, isCancelled: () => calls.length >= 2 }));

    expect(result).toBeNull();
    expect(writable.abort).toHaveBeenCalledTimes(1);
    expect(writable.close).not.toHaveBeenCalled();
  });

  it('saves nothing when cancelled while the last frames are being finished', async () => {
    let finishing = false;
    const flush = FakeVideoEncoder.prototype.flush;
    vi.spyOn(FakeVideoEncoder.prototype, 'flush').mockImplementation(async function (this: FakeVideoEncoder) {
      finishing = true;
      return flush.call(this);
    });

    const result = await encodeVideo(request({ frameCount: 3, isCancelled: () => finishing }));

    expect(result).toBeNull();
  });

  describe('when setting up fails partway', () => {
    class FakeWritable {
      write = vi.fn().mockResolvedValue(undefined);
      seek = vi.fn().mockResolvedValue(undefined);
      truncate = vi.fn().mockResolvedValue(undefined);
      close = vi.fn().mockResolvedValue(undefined);
      abort = vi.fn().mockResolvedValue(undefined);
    }

    it('lets go of the file it opened and answers nothing rather than throwing', async () => {
      borrowed.lend('FileSystemWritableFileStream', FakeWritable);
      borrowed.lend(
        'VideoEncoder',
        class {
          constructor() {
            throw new Error('no encoder here');
          }
        }
      );
      const writable = new FakeWritable();
      const file = { createWritable: vi.fn().mockResolvedValue(writable) } as unknown as FileSystemFileHandle;

      await expect(encodeVideo(request({ file }))).resolves.toBeNull();
      expect(writable.abort).toHaveBeenCalledTimes(1);
      expect(writable.close).not.toHaveBeenCalled();
    });

    it('closes the picture encoder when the sound encoder cannot be made', async () => {
      borrowed.lend(
        'AudioEncoder',
        class {
          constructor() {
            throw new Error('no sound encoder here');
          }
        }
      );

      const result = await encodeVideo(request({ audio: soundOfChannels(48_000, [new Float32Array(4800)]) }));

      expect(result).toBeNull();
      expect(closed).toBe(true);
    });
  });

  it('finishes without throwing when the encoder falls over', async () => {
    failOn = 1;
    expect(await encodeVideo(request({ frameCount: 5 }))).toBeNull();
    expect(closed).toBe(true);
  });

  it('gives up when it cannot get a surface to draw on', async () => {
    hasContext = false;
    expect(await encodeVideo(request())).toBeNull();
  });

  it('picks a codec and a bitrate to match the size', async () => {
    await encodeVideo(request({ width: 1920, height: 1080 }));
    expect(configured?.['codec']).toBe(avcCodecFor(1920, 1080));
    expect(configured?.['bitrate']).toBe(defaultVideoBitrate(1920, 1080, 30));

    expect(avcCodecFor(1280, 720)).toBe('avc1.64001f');
    expect(avcCodecFor(1920, 1080)).toBe('avc1.640028');
    expect(avcCodecFor(3840, 2160)).toBe('avc1.640033');
  });

  it('claims a level high enough for sixty frames a second', () => {
    expect(avcCodecFor(1920, 1080, 60)).toBe('avc1.64002a');
    expect(avcCodecFor(2560, 1440, 60)).toBe('avc1.640033');
    expect(avcCodecFor(3840, 2160, 60)).toBe('avc1.640034');
  });

  it('gives a bitrate fit for an upload, and more for sixty frames', () => {
    expect(defaultVideoBitrate(1920, 1080, 30)).toBe(10_000_000);
    expect(defaultVideoBitrate(1920, 1080, 60)).toBe(15_000_000);
    expect(defaultVideoBitrate(3840, 2160, 60)).toBeGreaterThanOrEqual(53_000_000);
  });

  it('asks for a variable bitrate tuned for quality', async () => {
    await encodeVideo(request());

    expect(configured).toMatchObject({ bitrateMode: 'variable', latencyMode: 'quality' });
  });

  it('falls back to plainer settings the browser will take', async () => {
    borrowed.lend(
      'VideoEncoder',
      class extends FakeVideoEncoder {
        static async isConfigSupported(config: Record<string, unknown>) {
          return { supported: !('latencyMode' in config), config };
        }
      }
    );
    await encodeVideo(request());

    expect(configured).toMatchObject({ bitrateMode: 'variable' });
    expect(configured?.['latencyMode']).toBeUndefined();
  });

  it('gives up when the browser takes no settings at all', async () => {
    borrowed.lend(
      'VideoEncoder',
      class extends FakeVideoEncoder {
        static async isConfigSupported(config: Record<string, unknown>) {
          return { supported: false, config };
        }
      }
    );

    expect(await encodeVideo(request())).toBeNull();
  });

  it('reads the sound from its source a few seconds at a time', async () => {
    const reads: [number, number][] = [];
    const length = SOUND_READ_FRAMES * 2 + 5000;
    const source = {
      sampleRate: 48_000,
      numberOfChannels: 1,
      length,
      read: async (start: number, count: number) => {
        reads.push([start, count]);
        return [new Float32Array(Math.min(count, length - start))];
      },
    };
    await encodeVideo(request({ frameCount: 3, audio: source }));

    expect(reads.length).toBeGreaterThanOrEqual(3);
    expect(reads.every(([, count]) => count <= SOUND_READ_FRAMES + 1024)).toBe(true);
    expect(audioFrames.reduce((sum, frames) => sum + frames, 0)).toBe(length);
  });

  it('encodes the sound alongside the picture rather than after it', async () => {
    const order: string[] = [];
    const paint = vi.fn(() => {
      order.push(`frame ${audioFrames.length}`);
    });
    const channels = [new Float32Array(48_000)];
    await encodeVideo(request({ paint, frameCount: 30, audio: soundOfChannels(48_000, channels) }));

    expect(order[order.length - 1]).not.toBe('frame 0');
  });

  it('takes the aac path when given sound as well', async () => {
    const channels = [new Float32Array(2048), new Float32Array(2048)];
    const result = await encodeVideo(request({ audio: soundOfChannels(48_000, channels) }));

    expect(audioConfigured).toMatchObject({ codec: 'mp4a.40.2', numberOfChannels: 2, sampleRate: 48_000 });
    expect(audioFrames).toEqual([AUDIO_FRAME_SAMPLES, AUDIO_FRAME_SAMPLES]);
    expect(result?.extension).toBe('mp4');
  });

  it('loses no frame at the end', async () => {
    await encodeVideo(request({ audio: soundOfChannels(48_000, [new Float32Array(1500)]) }));
    expect(audioFrames).toEqual([AUDIO_FRAME_SAMPLES, 1500 - AUDIO_FRAME_SAMPLES]);
  });

  it('exports the picture alone without the audio encoder', async () => {
    delete globals['AudioEncoder'];
    const result = await encodeVideo(request({ audio: soundOfChannels(48_000, [new Float32Array(2048)]) }));

    expect(audioFrames).toEqual([]);
    expect(result?.extension).toBe('mp4');
  });

  it('leaves the audio encoder alone when given no sound', async () => {
    await encodeVideo(request());
    expect(audioConfigured).toBeNull();
  });

  it('uses the bitrate it is given', async () => {
    await encodeVideo(request({ bitrate: 123_456 }));
    expect(configured?.['bitrate']).toBe(123_456);
  });
});
