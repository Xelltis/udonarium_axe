import {
  encodeReplayVideoInWorker,
  REPLAY_WORKER_CANCEL_GRACE_MS,
  type ReplayVideoWorkerHost,
  useReplayVideoWorkerFactory,
} from '@axe/application/replay/replay-video-worker-client';
import type {
  ReplayVideoWorkerJob,
  ReplayVideoWorkerRequest,
  ReplayVideoWorkerResponse,
} from '@axe/application/replay/replay-video-worker-message';

class FakeWorker {
  readonly posted: { message: ReplayVideoWorkerRequest; transfer: Transferable[] }[] = [];
  terminated = false;
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  constructor(private readonly onPost: (worker: FakeWorker, message: ReplayVideoWorkerRequest) => void = () => {}) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: ReplayVideoWorkerRequest, transfer: Transferable[] = []): void {
    this.posted.push({ message, transfer });
    this.onPost(this, message);
  }

  terminate(): void {
    this.terminated = true;
  }

  reply(message: ReplayVideoWorkerResponse): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data: message });
  }

  crash(): void {
    for (const listener of this.listeners.get('error') ?? []) listener({ message: 'boom' });
  }

  sent<K extends ReplayVideoWorkerRequest['kind']>(kind: K): Extract<ReplayVideoWorkerRequest, { kind: K }>[] {
    return this.posted
      .map((post) => post.message)
      .filter((message): message is Extract<ReplayVideoWorkerRequest, { kind: K }> => message.kind === kind);
  }
}

const job = { fps: 30, frameCount: 10, sound: null, file: null, baseUrl: '' } as unknown as ReplayVideoWorkerJob;

function host(overrides: Partial<ReplayVideoWorkerHost> = {}): ReplayVideoWorkerHost {
  return {
    imageOf: () => null,
    sound: null,
    isCancelled: () => false,
    onProgress: () => {},
    ...overrides,
  };
}

function using(worker: FakeWorker | null): void {
  useReplayVideoWorkerFactory(() => worker as unknown as Worker | null);
}

describe('making a replay video in a worker', () => {
  afterEach(() => {
    useReplayVideoWorkerFactory(null);
    vi.useRealTimers();
  });

  it('hands the worker the video and answers with what it made', async () => {
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') self.reply({ kind: 'done', blob: new Blob(['mp4']), extension: 'mp4' });
    });
    using(worker);

    const made = await encodeReplayVideoInWorker(job, host());

    expect(worker.sent('start')[0].job).toBe(job);
    expect(made).toMatchObject({ extension: 'mp4' });
    expect(worker.terminated).toBe(true);
  });

  it('passes the progress on', async () => {
    const seen: [number, number][] = [];
    const worker = new FakeWorker((self, message) => {
      if (message.kind !== 'start') return;
      self.reply({ kind: 'progress', done: 4, total: 10 });
      self.reply({ kind: 'done', blob: null, extension: 'mp4' });
    });
    using(worker);

    await encodeReplayVideoInWorker(job, host({ onProgress: (done, total) => seen.push([done, total]) }));

    expect(seen).toEqual([[4, 10]]);
  });

  it('answers the asks for pictures from the page', async () => {
    const picture = new Blob(['png']);
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') {
        self.reply({ kind: 'image-request', id: 1, identifier: 'face' });
        self.reply({ kind: 'image-request', id: 2, identifier: 'missing' });
      }
      if (message.kind === 'image' && message.id === 2) self.reply({ kind: 'done', blob: null, extension: 'mp4' });
    });
    using(worker);

    await encodeReplayVideoInWorker(
      job,
      host({ imageOf: (identifier) => (identifier === 'face' ? { blob: picture, url: 'blob:face' } : null) })
    );

    expect(worker.sent('image')).toEqual([
      { kind: 'image', id: 1, blob: picture, url: 'blob:face', found: true },
      { kind: 'image', id: 2, blob: null, url: '', found: false },
    ]);
  });

  it('reads the sound for the worker a stretch at a time, handing the samples over', async () => {
    const whole = new Float32Array([0, 1, 2, 3, 4, 5]);
    const read = vi.fn(async (start: number, count: number) => [whole.subarray(start, start + count)]);
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') self.reply({ kind: 'sound-request', id: 7, start: 2, count: 3 });
      if (message.kind === 'sound') self.reply({ kind: 'done', blob: null, extension: 'mp4' });
    });
    using(worker);

    await encodeReplayVideoInWorker(job, host({ sound: { sampleRate: 48_000, numberOfChannels: 1, length: 6, read } }));

    const answer = worker.posted.find((post) => post.message.kind === 'sound')!;
    expect(read).toHaveBeenCalledWith(2, 3);
    expect(answer.message).toEqual({ kind: 'sound', id: 7, channels: [new Float32Array([2, 3, 4])] });
    expect(answer.transfer).toHaveLength(1);
    expect(answer.transfer[0]).not.toBe(whole.buffer);
  });

  it('gives up rather than leave the worker waiting when the sound cannot be read', async () => {
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') self.reply({ kind: 'sound-request', id: 1, start: 0, count: 3 });
    });
    using(worker);
    const read = vi.fn(async () => {
      throw new Error('cannot render');
    });

    const made = await encodeReplayVideoInWorker(
      job,
      host({ sound: { sampleRate: 48_000, numberOfChannels: 1, length: 6, read } })
    );

    expect(made).toBeNull();
    expect(worker.terminated).toBe(true);
  });

  it('tells the worker to stop once the export is cancelled', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'cancel') self.reply({ kind: 'cancelled' });
    });
    using(worker);

    const made = encodeReplayVideoInWorker(job, host({ isCancelled: () => cancelled }));
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.sent('cancel')).toHaveLength(0);

    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);

    expect(await made).toBeNull();
    expect(worker.terminated).toBe(true);
  });

  it('lets go of a worker that does not stop soon after the export is cancelled', async () => {
    vi.useFakeTimers();
    let cancelled = false;
    const worker = new FakeWorker();
    using(worker);

    const made = encodeReplayVideoInWorker(job, host({ isCancelled: () => cancelled }));
    cancelled = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(worker.sent('cancel')).toHaveLength(1);
    expect(worker.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(REPLAY_WORKER_CANCEL_GRACE_MS);

    expect(await made).toBeNull();
    expect(worker.terminated).toBe(true);
    expect(worker.sent('cancel')).toHaveLength(1);
  });

  it('leaves the video to the page when there is no worker', async () => {
    using(null);

    expect(await encodeReplayVideoInWorker(job, host())).toBe('unavailable');
  });

  it('leaves the video to the page when the worker cannot be started', async () => {
    useReplayVideoWorkerFactory(() => {
      throw new Error('blocked');
    });

    expect(await encodeReplayVideoInWorker(job, host())).toBe('unavailable');
  });

  it('leaves the video to the page when the worker cannot be handed it', async () => {
    const worker = new FakeWorker(() => {
      throw new Error('could not be cloned');
    });
    using(worker);

    expect(await encodeReplayVideoInWorker(job, host())).toBe('unavailable');
    expect(worker.terminated).toBe(true);
  });

  it('leaves the video to the page when the worker fails before drawing a frame', async () => {
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') self.reply({ kind: 'failed', message: 'no encoder here' });
    });
    using(worker);

    expect(await encodeReplayVideoInWorker(job, host())).toBe('unavailable');
  });

  it('leaves the video to the page when the worker crashes before drawing a frame', async () => {
    const worker = new FakeWorker((self, message) => {
      if (message.kind === 'start') self.crash();
    });
    using(worker);

    expect(await encodeReplayVideoInWorker(job, host())).toBe('unavailable');
  });

  it('gives up without starting over once frames have been drawn', async () => {
    const worker = new FakeWorker((self, message) => {
      if (message.kind !== 'start') return;
      self.reply({ kind: 'progress', done: 1, total: 10 });
      self.reply({ kind: 'failed', message: 'the encoder broke' });
    });
    using(worker);

    expect(await encodeReplayVideoInWorker(job, host())).toBeNull();
    expect(worker.terminated).toBe(true);
  });
});
