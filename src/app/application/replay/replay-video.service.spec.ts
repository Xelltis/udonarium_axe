import { TestBed } from '@angular/core/testing';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplaySoundMixer } from '@axe/application/replay/replay-sound-mixer';
import { type ReplayVideoJob, ReplayVideoService } from '@axe/application/replay/replay-video.service';
import { ReplayVideoAudience } from '@axe/application/replay/replay-video-studio.service';
import { useReplayVideoWorkerFactory } from '@axe/application/replay/replay-video-worker-client';
import type { ReplayVideoWorkerRequest } from '@axe/application/replay/replay-video-worker-message';
import {
  type EncodedVideo,
  type VideoEncodeRequest,
  VideoEncoderGateway,
  type VideoPaintTarget,
} from '@axe/core/media/video-encoder';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
} from '@axe/domain/replay/replay-event';
import { encodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { DEFAULT_REPLAY_SOUND_CHOICE, type ReplaySoundtrack } from '@axe/domain/replay/replay-soundtrack';
import { REPLAY_PAGE_MIN_MS } from '@axe/domain/replay/video/replay-text-layout';
import { ReplayVideoPacing, ReplayVideoStyle } from '@axe/domain/replay/video/replay-video-timeline';
import { recorder } from '@axe/testing/canvas-recorder';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

function say(seq: number, text: string, name = 'アリス'): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text, name, from: 'alice', tabIdentifier: 'main' },
    visibility: PUBLIC_VISIBILITY,
  };
}

function sound(seq: number, identifier: string): ReplayEvent {
  return { ...say(seq, ''), kind: ReplayEventKind.MediaSoundEffect, detail: { identifier } };
}

const board: ReplayObjectSnapshot[] = [
  { identifier: 't1', aliasName: 'game-table', syncData: { attributes: { width: 10, height: 10, gridSize: 50 } } },
  {
    identifier: 'c1',
    aliasName: 'character',
    syncData: { attributes: { location: { name: 'table', x: 0, y: 0 }, posZ: 0 } },
  },
];

function job(events: readonly ReplayEvent[], overrides: Partial<ReplayVideoJob> = {}): ReplayVideoJob {
  return {
    recording: {
      id: 1,
      roomName: '第一夜',
      startedAt: new Date(2026, 0, 2, 20, 5).getTime(),
      manifest: null,
      events,
      userId: 'alice',
    },
    settings: {
      style: ReplayVideoStyle.Novel,
      audience: ReplayVideoAudience.Public,
      lang: 'ja',
      width: 1280,
      height: 720,
      pacing: ReplayVideoPacing.Reading,
      readingSpeed: 1,
      tabs: null,
      withOpening: false,
    },
    fps: 30,
    sound: DEFAULT_REPLAY_SOUND_CHOICE,
    ...overrides,
  };
}

describe('ReplayVideoService', () => {
  let service: ReplayVideoService;
  let encode: ReturnType<typeof vi.fn<(request: VideoEncodeRequest) => Promise<EncodedVideo | null>>>;
  let saved: { blob: Blob | null; name: string }[];
  let isSupported = true;
  let isRealtimeOnly = false;
  let mix: ReturnType<typeof vi.fn<(soundtrack: ReplaySoundtrack, read: unknown) => Promise<unknown>>>;
  let keyframe: { seq: number; blob: Blob } | null;
  let drawnTexts: string[];

  beforeEach(() => {
    useReplayVideoWorkerFactory(() => null);
    saved = [];
    isSupported = true;
    isRealtimeOnly = false;
    drawnTexts = [];
    keyframe = { seq: 0, blob: new Blob([encodeReplayKeyframe(board) as BlobPart]) };
    mix = vi.fn<(soundtrack: ReplaySoundtrack, read: unknown) => Promise<unknown>>().mockResolvedValue(null);
    encode = vi.fn<(request: VideoEncodeRequest) => Promise<EncodedVideo | null>>(async (request) => {
      const canvas = recorder();
      const middle = Math.floor(request.frameCount / 2);
      for (const index of [0, middle]) {
        if (request.isCancelled?.()) return null;
        await request.paint(canvas.ctx as unknown as VideoPaintTarget, index);
        request.onProgress?.(index + 1, request.frameCount);
      }
      drawnTexts = canvas.texts.map((text) => text.text);
      return { blob: new Blob(['mp4'], { type: 'video/mp4' }), extension: 'mp4' };
    });

    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: ReplaySoundMixer,
          useValue: { isSupported: true, mix: (soundtrack: ReplaySoundtrack, read: unknown) => mix(soundtrack, read) },
        },
        {
          provide: VideoEncoderGateway,
          useValue: {
            get isSupported() {
              return isSupported;
            },
            get isRealtimeOnly() {
              return isRealtimeOnly;
            },
            encode: (request: VideoEncodeRequest) => encode(request),
            save: (blob: Blob | null, name: string) => saved.push({ blob, name }),
          },
        },
        {
          provide: ReplayLibraryService,
          useValue: { keyframeBefore: vi.fn().mockImplementation(async () => keyframe) },
        },
      ],
    });
    service = TestBed.inject(ReplayVideoService);
  });

  afterEach(() => {
    useReplayVideoWorkerFactory(null);
    vi.restoreAllMocks();
  });

  it('saves a recording as an mp4 named after the room', async () => {
    expect(await service.render(job([say(1, 'やあ'), say(2, 'こんばんは')]))).toBe(true);

    expect(saved).toHaveLength(1);
    expect(saved[0].name.endsWith('.mp4')).toBe(true);
    expect(saved[0].name.startsWith('第一夜_')).toBe(true);
  });

  it('asks for the chosen size and frame rate', async () => {
    const wanted = job([say(1, 'やあ')], { fps: 60 });
    await service.render({ ...wanted, settings: { ...wanted.settings, width: 1920, height: 1080 } });

    expect(encode.mock.calls[0][0]).toMatchObject({ width: 1920, height: 1080, fps: 60 });
  });

  it('counts out one frame per moment of the running time', async () => {
    await service.render(job([say(1, 'やあ')]));

    expect(encode.mock.calls[0][0].frameCount).toBe(Math.round((REPLAY_PAGE_MIN_MS / 1000) * 30));
  });

  it('draws each frame with the renderer the preview uses', async () => {
    await service.render(job([say(1, 'やあ')]));

    expect(drawnTexts).toContain('アリス');
    expect(drawnTexts.some((text) => text.startsWith('や'))).toBe(true);
  });

  it('exports the lines alone when the board cannot be read', async () => {
    keyframe = null;
    expect(await service.render(job([say(1, 'やあ')]))).toBe(true);
    expect(saved).toHaveLength(1);
  });

  it('shows the public nothing kept to the game master', async () => {
    const secret = { ...say(1, '黒幕は執事'), visibility: GM_ONLY_VISIBILITY };

    expect(await service.render(job([secret]))).toBe(false);
    expect(service.failure()).toBe('empty');

    const forGameMaster = job([secret]);
    forGameMaster.settings = { ...forGameMaster.settings, audience: ReplayVideoAudience.GameMaster };
    expect(await service.render(forGameMaster)).toBe(true);
  });

  it('mixes the sound and hands it to the encoder', async () => {
    vi.spyOn(TestBed.inject(AudioStorage), 'get').mockReturnValue({ blob: new Blob(['se']) } as never);
    const mixed = { sampleRate: 48_000, channels: [new Float32Array(8)] };
    mix.mockResolvedValue(mixed);

    await service.render(job([say(1, 'やあ'), sound(2, 'se-1'), say(3, 'こんばんは')]));

    expect(mix).toHaveBeenCalledTimes(1);
    expect(mix.mock.calls[0][0].effects.map((cue) => cue.audioIdentifier)).toEqual(['se-1']);
    expect(encode.mock.calls[0][0].audio).toBe(mixed);
  });

  it('mixes nothing when asked for silence', async () => {
    const events = [say(1, 'やあ'), sound(2, 'se-1'), say(3, 'こんばんは')];
    await service.render(job(events, { sound: { withEffects: false, withMusic: false } }));

    expect(mix).not.toHaveBeenCalled();
    expect(encode.mock.calls[0][0].audio).toBeNull();
  });

  it('keeps to sound effects only when asked', async () => {
    mix.mockResolvedValue({ sampleRate: 48_000, channels: [new Float32Array(8)] });
    const music: ReplayEvent = {
      ...say(3, ''),
      kind: ReplayEventKind.MediaBgm,
      targetId: 'bgm-1',
      detail: { isPlaying: true },
    };
    await service.render(
      job([say(1, 'やあ'), sound(2, 'se-1'), music, say(4, 'こんばんは')], {
        sound: { withEffects: true, withMusic: false },
      })
    );

    expect(mix.mock.calls[0][0].effects).toHaveLength(1);
    expect(mix.mock.calls[0][0].music).toHaveLength(0);
  });

  it('mixes nothing when there is no sound', async () => {
    await service.render(job([say(1, 'やあ')]));

    expect(mix).not.toHaveBeenCalled();
  });

  it('stops and says so when the sound cannot be mixed, rather than going silent', async () => {
    mix.mockRejectedValue(new Error('鳴らせない'));

    expect(await service.render(job([say(1, 'やあ'), sound(2, 'se-1'), say(3, 'こんばんは')]))).toBe(false);
    expect(service.failure()).toBe('sound');
    expect(encode).not.toHaveBeenCalled();
  });

  it('says when the browser paused it with its tab in the background, and forgets it next time', async () => {
    encode.mockImplementation(async () => {
      document.dispatchEvent(new Event('freeze'));
      return { blob: new Blob(['mp4']), extension: 'mp4' };
    });
    await service.render(job([say(1, 'やあ')]));
    expect(service.wasPaused()).toBe(true);

    encode.mockResolvedValue({ blob: new Blob(['mp4']), extension: 'mp4' });
    await service.render(job([say(1, 'やあ')]));
    expect(service.wasPaused()).toBe(false);

    document.dispatchEvent(new Event('freeze'));
    expect(service.wasPaused()).toBe(false);
  });

  it('reports its progress', async () => {
    let seen = 0;
    encode.mockImplementation(async (request) => {
      request.onProgress?.(5, 10);
      seen = service.progress();
      return { blob: new Blob(['mp4']), extension: 'mp4' };
    });

    await service.render(job([say(1, 'やあ')]));
    expect(seen).toBe(0.5);
    expect(service.isRendering()).toBe(false);
  });

  it('saves nothing when cancelled, and calls it no failure', async () => {
    encode.mockImplementation(async (request) => {
      service.cancel();
      return request.isCancelled?.() ? null : { blob: new Blob(['mp4']), extension: 'mp4' };
    });

    expect(await service.render(job([say(1, 'やあ')]))).toBe(false);
    expect(saved).toHaveLength(0);
    expect(service.failure()).toBeNull();
  });

  it('exports nothing when nothing can be shown', async () => {
    const still: ReplayEvent = { ...say(1, ''), kind: ReplayEventKind.ObjectMove, targetId: 'c1', detail: {} };

    expect(await service.render(job([still]))).toBe(false);
    expect(encode).not.toHaveBeenCalled();
  });

  it('saves nothing when cancelled once the frames are all drawn, and calls it no failure', async () => {
    encode.mockImplementation(async () => {
      service.cancel();
      return { blob: new Blob(['mp4']), extension: 'mp4' };
    });

    expect(await service.render(job([say(1, 'やあ')]))).toBe(false);
    expect(saved).toHaveLength(0);
    expect(service.failure()).toBeNull();
  });

  it('says the encoding failed when the encoder gives up', async () => {
    encode.mockResolvedValue(null);

    expect(await service.render(job([say(1, 'やあ')]))).toBe(false);
    expect(service.failure()).toBe('encode');
  });

  it('does nothing with an empty recording', async () => {
    expect(await service.render(job([]))).toBe(false);
  });

  it('declines where exporting is unavailable', async () => {
    isSupported = false;
    expect(service.isSupported).toBe(false);
    expect(await service.render(job([say(1, 'やあ')]))).toBe(false);
  });

  it('refuses to run twice at once', async () => {
    let release: (() => void) | null = null;
    encode.mockImplementation(
      () =>
        new Promise<EncodedVideo | null>((resolve) => {
          release = () => resolve({ blob: new Blob(['mp4']), extension: 'mp4' });
        })
    );

    const first = service.render(job([say(1, 'やあ')]));
    expect(service.isRendering()).toBe(true);
    await vi.waitFor(() => expect(release).not.toBeNull());
    expect(await service.render(job([say(1, 'やあ')]))).toBe(false);

    release!();
    await first;
    expect(encode).toHaveBeenCalledTimes(1);
  });
  describe('in a worker', () => {
    class ExportingWorker {
      readonly started: ReplayVideoWorkerRequest[] = [];
      private listener: ((event: { data: unknown }) => void) | null = null;

      constructor(private readonly answer: 'done' | 'failed') {}

      addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
        if (type === 'message') this.listener = listener;
      }

      postMessage(message: ReplayVideoWorkerRequest): void {
        this.started.push(message);
        if (message.kind !== 'start') return;
        queueMicrotask(() =>
          this.listener?.({
            data:
              this.answer === 'done'
                ? { kind: 'done', blob: new Blob(['from the worker']), extension: 'mp4' }
                : { kind: 'failed', message: 'no encoder here' },
          })
        );
      }

      terminate(): void {}
    }

    it('has the worker draw and encode the video, and saves what it made', async () => {
      const worker = new ExportingWorker('done');
      useReplayVideoWorkerFactory(() => worker as unknown as Worker);

      expect(await service.render(job([say(1, 'やあ'), say(2, 'こんばんは')]))).toBe(true);

      const start = worker.started[0];
      expect(start.kind === 'start' && start.job).toMatchObject({ fps: 30, sound: null, file: null });
      expect(start.kind === 'start' && start.job.shared.timeline.segments.length).toBeGreaterThan(0);
      expect(encode).not.toHaveBeenCalled();
      expect(await saved[0].blob?.text()).toBe('from the worker');
    });

    it('makes the video on the page when the worker cannot', async () => {
      useReplayVideoWorkerFactory(() => new ExportingWorker('failed') as unknown as Worker);

      expect(await service.render(job([say(1, 'やあ')]))).toBe(true);
      expect(encode).toHaveBeenCalledTimes(1);
    });

    it('does not start over on the page once the export was cancelled', async () => {
      useReplayVideoWorkerFactory(() => {
        service.cancel();
        return new ExportingWorker('failed') as unknown as Worker;
      });

      expect(await service.render(job([say(1, 'やあ')]))).toBe(false);
      expect(encode).not.toHaveBeenCalled();
      expect(service.failure()).toBeNull();
    });

    it('keeps to the page where the video can only be recorded as it plays', async () => {
      isRealtimeOnly = true;
      const worker = new ExportingWorker('done');
      useReplayVideoWorkerFactory(() => worker as unknown as Worker);

      await service.render(job([say(1, 'やあ')]));

      expect(worker.started).toHaveLength(0);
      expect(encode).toHaveBeenCalledTimes(1);
    });
  });
});
