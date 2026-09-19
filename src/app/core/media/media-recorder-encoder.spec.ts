import {
  extensionOfMediaType,
  isMediaRecordingSupported,
  mediaRecordingType,
  recordVideo,
  SOUND_START_LEAD_SECONDS,
  SOUND_STRETCH_SECONDS,
  soundTrackOf,
} from '@axe/core/media/media-recorder-encoder';
import type { VideoEncodeRequest, VideoSoundSource } from '@axe/core/media/video-encoder';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

class FakeMediaRecorder {
  static supported: string[] = [];
  static isTypeSupported(type: string): boolean {
    return FakeMediaRecorder.supported.includes(type);
  }

  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  state = 'inactive';

  constructor(
    readonly stream: MediaStream,
    readonly options: { mimeType: string }
  ) {}

  start(): void {
    this.state = 'recording';
  }

  stop(): void {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['frame'], { type: this.options.mimeType }) });
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  const tracks: MediaStreamTrack[] = [];
  return {
    addTrack: (track: MediaStreamTrack) => tracks.push(track),
    getTracks: () => tracks,
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

describe('exporting through the media recorder', () => {
  let captured: MediaStream;

  function request(overrides: Partial<VideoEncodeRequest> = {}): VideoEncodeRequest {
    return {
      width: 16,
      height: 16,
      fps: 60,
      frameCount: 3,
      paint: () => undefined,
      ...overrides,
    };
  }

  const borrowed = new BorrowedGlobals();

  beforeEach(() => {
    captured = fakeStream();
    FakeMediaRecorder.supported = ['video/webm;codecs=vp9,opus'];
    borrowed.lend('MediaRecorder', FakeMediaRecorder);
    borrowed.lendOn(HTMLCanvasElement.prototype, 'captureStream', () => captured);
    borrowed.lendOn(HTMLCanvasElement.prototype, 'getContext', () => ({}));
  });

  afterEach(() => {
    borrowed.giveBack();
  });

  it('picks a container this browser can take', () => {
    expect(isMediaRecordingSupported()).toBe(true);
    expect(mediaRecordingType()).toBe('video/webm;codecs=vp9,opus');

    // MP4 comes first where it is accepted, since it can be handed round without converting.
    FakeMediaRecorder.supported = ['video/mp4', 'video/webm;codecs=vp9,opus'];
    expect(mediaRecordingType()).toBe('video/mp4');
  });

  it('exports nothing when it can take none of them', async () => {
    FakeMediaRecorder.supported = [];

    expect(mediaRecordingType()).toBeNull();
    expect(await recordVideo(request())).toBeNull();
  });

  it('returns the extension that matches the container', () => {
    expect(extensionOfMediaType('video/mp4;codecs=avc1.640028')).toBe('mp4');
    expect(extensionOfMediaType('video/webm;codecs=vp9,opus')).toBe('webm');
  });

  it('draws in real time into a single video', async () => {
    const painted: number[] = [];
    const result = await recordVideo(request({ paint: (_ctx, index) => void painted.push(index) }));

    // The frame number comes from the elapsed time, so it may skip under load but never goes back.
    expect(painted.length).toBeGreaterThan(0);
    expect([...painted].sort((left, right) => left - right)).toEqual(painted);
    expect(painted[0]).toBe(0);
    expect(result?.extension).toBe('webm');
    expect(result?.blob?.size).toBeGreaterThan(0);
  });

  it('returns nothing when stopped', async () => {
    expect(await recordVideo(request({ isCancelled: () => true }))).toBeNull();
  });

  it('reports its progress', async () => {
    const progress: number[] = [];
    await recordVideo(request({ onProgress: (done) => void progress.push(done) }));

    expect(progress.at(-1)).toBe(3);
  });
});

describe('the sound of a recording made in real time', () => {
  const borrowed = new BorrowedGlobals();
  const RATE = 1000;
  let started: { when: number; offset: number | undefined; frames: number }[];

  class FakeAudioContext {
    static latest: FakeAudioContext | null = null;
    currentTime = 0;
    constructor() {
      FakeAudioContext.latest = this;
    }
    createMediaStreamDestination() {
      return { stream: fakeStream() };
    }
    createBuffer(_channels: number, frames: number, rate: number) {
      return { length: frames, duration: frames / rate, copyToChannel: () => undefined };
    }
    createBufferSource() {
      const source = {
        buffer: null as { length: number } | null,
        connect: () => undefined,
        start: (when: number, offset?: number) => started.push({ when, offset, frames: source.buffer?.length ?? 0 }),
        stop: () => undefined,
      };
      return source;
    }
    close() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    started = [];
    borrowed.lend('AudioContext', FakeAudioContext);
  });

  afterEach(() => borrowed.giveBack());

  function slowSound(seconds: number, readMs: number): VideoSoundSource {
    return {
      sampleRate: RATE,
      numberOfChannels: 1,
      length: seconds * RATE,
      read: (start, count) =>
        new Promise((resolve) =>
          setTimeout(() => resolve([new Float32Array(Math.min(count, seconds * RATE - start))]), readMs)
        ),
    };
  }

  it('reads the first seconds before its clock starts, so the start is on time however long mixing takes', async () => {
    vi.useFakeTimers();
    try {
      const track = soundTrackOf(slowSound(20, 500))!;
      const primed = track.prime();
      await vi.advanceTimersByTimeAsync(2000);
      await primed;
      FakeAudioContext.latest!.currentTime = 4;

      track.start();

      expect(started[0]).toEqual({
        when: 4 + SOUND_START_LEAD_SECONDS,
        offset: undefined,
        frames: SOUND_STRETCH_SECONDS * RATE,
      });
      expect(started[1].when).toBeCloseTo(4 + SOUND_START_LEAD_SECONDS + SOUND_STRETCH_SECONDS);
      track.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds the picture back as long as the sound waits to start, so the two stay together', async () => {
    let recordingFrom = 0;
    const paintedAt: number[] = [];
    borrowed.lend(
      'MediaRecorder',
      class extends FakeMediaRecorder {
        override start(): void {
          recordingFrom = performance.now();
          super.start();
        }
      }
    );
    FakeMediaRecorder.supported = ['video/webm;codecs=vp9,opus'];
    borrowed.lendOn(HTMLCanvasElement.prototype, 'captureStream', () => fakeStream());
    borrowed.lendOn(HTMLCanvasElement.prototype, 'getContext', () => ({}));
    const fps = 60;

    await recordVideo({
      width: 16,
      height: 16,
      fps,
      frameCount: 3,
      audio: slowSound(1, 0),
      paint: (_ctx, index) => void (paintedAt[index] = performance.now() - recordingFrom),
    });

    expect(paintedAt[1]).toBeGreaterThanOrEqual(SOUND_START_LEAD_SECONDS * 1000 + 1000 / fps - 1);
  });

  it('starts a stretch that comes late part way in, rather than late and over the next', async () => {
    vi.useFakeTimers();
    try {
      const track = soundTrackOf(slowSound(20, 10))!;
      const primed = track.prime();
      await vi.advanceTimersByTimeAsync(100);
      await primed;
      track.start();
      const scheduled = started.length;
      const due = SOUND_START_LEAD_SECONDS + scheduled * SOUND_STRETCH_SECONDS;
      FakeAudioContext.latest!.currentTime = due + 1;

      await vi.advanceTimersByTimeAsync(1100);

      const late = started[scheduled];
      expect(late.when).toBe(due + 1);
      expect(late.offset).toBeCloseTo(1);
      track.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
