import { ReplayVideoProduction } from '@axe/application/replay/replay-video-production';
import type {
  ReplayVideoWorkerJob,
  ReplayVideoWorkerRequest,
  ReplayVideoWorkerResponse,
} from '@axe/application/replay/replay-video-worker-message';
import { encodeVideo } from '@axe/core/media/video-encoder';
import { loadReplayFonts } from '@axe/infrastructure/replay/video/replay-fonts';

interface WorkerScope {
  addEventListener(type: 'message', listener: (event: MessageEvent<ReplayVideoWorkerRequest>) => void): void;
  postMessage(message: ReplayVideoWorkerResponse, transfer?: Transferable[]): void;
  fonts?: { add(face: FontFace): unknown };
  FontFace?: typeof FontFace;
}

const scope = self as unknown as WorkerScope;
const waiting = new Map<number, (reply: ReplayVideoWorkerRequest) => void>();
let nextId = 1;
let cancelled = false;

scope.addEventListener('message', (event) => {
  const request = event.data;
  switch (request.kind) {
    case 'start':
      void run(request.job);
      return;
    case 'cancel':
      cancelled = true;
      return;
    default:
      waiting.get(request.id)?.(request);
      waiting.delete(request.id);
  }
});

/** Asks the page for something only it has, and waits for the answer. */
function ask(
  request: { kind: 'image-request'; identifier: string } | { kind: 'sound-request'; start: number; count: number }
): Promise<ReplayVideoWorkerRequest> {
  const id = nextId++;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    scope.postMessage({ ...request, id });
  });
}

/**
 * Draws and encodes a video away from the page, so the page stays free and a tab left in the
 * background does not slow the export down. The pictures and the sound are asked of the page as
 * they are wanted.
 *
 * The worker sets the text in the fonts the page laid it out in. Where the page had the bundled
 * fonts, a worker that cannot load them would draw in others that run wider or narrower, so it
 * fails before its first frame and the page makes the video instead. Where the page was left with
 * the device's fonts, the worker keeps to them as well.
 */
async function run(job: ReplayVideoWorkerJob): Promise<void> {
  try {
    if (
      job.shared.bundledFonts &&
      !(await loadReplayFonts({ fonts: scope.fonts, FontFace: scope.FontFace }, job.baseUrl))
    ) {
      throw new Error('the bundled fonts could not be loaded in the worker');
    }
    const production = ReplayVideoProduction.fromShared(job.shared, {
      get: async (identifier) => {
        const reply = await ask({ kind: 'image-request', identifier });
        return reply.kind === 'image' && reply.found ? { blob: reply.blob, url: reply.url } : null;
      },
    });
    const sound = job.sound
      ? {
          ...job.sound,
          read: async (start: number, count: number) => {
            const reply = await ask({ kind: 'sound-request', start, count });
            return reply.kind === 'sound' ? reply.channels : [];
          },
        }
      : null;

    const msPerFrame = 1000 / job.fps;
    try {
      const encoded = await encodeVideo({
        width: job.shared.width,
        height: job.shared.height,
        fps: job.fps,
        frameCount: job.frameCount,
        audio: sound,
        file: job.file,
        isCancelled: () => cancelled,
        onProgress: (done, total) => scope.postMessage({ kind: 'progress', done, total }),
        paint: async (ctx, index) => {
          const atMs = index * msPerFrame;
          if (!production.isReady(atMs)) await production.prepare(atMs);
          production.paint(ctx, atMs);
        },
      });
      if (encoded) scope.postMessage({ kind: 'done', blob: encoded.blob, extension: encoded.extension });
      else scope.postMessage(cancelled ? { kind: 'cancelled' } : { kind: 'failed', message: 'encoding failed' });
    } finally {
      production.dispose();
    }
  } catch (reason) {
    scope.postMessage({ kind: 'failed', message: reason instanceof Error ? reason.message : String(reason) });
  }
}
