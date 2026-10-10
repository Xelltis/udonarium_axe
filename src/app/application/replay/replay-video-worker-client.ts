import type {
  ReplayVideoWorkerJob,
  ReplayVideoWorkerRequest,
  ReplayVideoWorkerResponse,
} from '@axe/application/replay/replay-video-worker-message';
import { Logger } from '@axe/core/logging/logger';
import type { EncodedVideo, VideoSoundSource } from '@axe/core/media/video-encoder';

/** What the page lends a video being made in a worker: its pictures and sound, and a way to follow and stop it. */
export interface ReplayVideoWorkerHost {
  imageOf(identifier: string): { blob: Blob | null; url: string } | null;
  sound: VideoSoundSource | null;
  isCancelled(): boolean;
  onProgress(done: number, total: number): void;
}

/**
 * How a video made in a worker ended: the video, null when it was cancelled or failed partway, or
 * `unavailable` when no worker could take it on and the page should make it itself.
 */
export type ReplayVideoWorkerOutcome = EncodedVideo | null | 'unavailable';

const CANCEL_CHECK_MS = 200;
/**
 * How long a worker is given to stop once told to, in milliseconds. One held up waiting on a
 * picture, a font or the sound would never look at the word, so it is let go instead.
 */
export const REPLAY_WORKER_CANCEL_GRACE_MS = 3_000;

let makeWorker: (() => Worker | null) | null = null;

/**
 * Hands in how the worker is made, or null to go back to the real one. A test hands in a stand-in,
 * or one that makes none so the page does the work.
 */
export function useReplayVideoWorkerFactory(factory: (() => Worker | null) | null): void {
  makeWorker = factory;
}

function startWorker(): Worker | null {
  if (makeWorker) return makeWorker();
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./replay-video.worker', import.meta.url), { type: 'module' });
}

/**
 * Has a worker draw and encode a video, answering its asks for pictures and sound from the page
 * and passing its progress on. The worker is let go when it is done, or when it has not stopped
 * soon after the export was cancelled. Answers `unavailable` when a
 * worker cannot be started, cannot be handed the video, or fails before drawing a frame, so the
 * page can make the video itself, and null when the page cannot give the worker a picture or the
 * sound it asks for, which the page would fail at as well.
 */
export function encodeReplayVideoInWorker(
  job: ReplayVideoWorkerJob,
  host: ReplayVideoWorkerHost
): Promise<ReplayVideoWorkerOutcome> {
  let worker: Worker | null;
  try {
    worker = startWorker();
  } catch (reason) {
    Logger.warn('[ReplayVideo] ワーカーを起動できないためページで書き出します', reason);
    worker = null;
  }
  if (!worker) return Promise.resolve('unavailable');
  const running = worker;

  return new Promise((resolve) => {
    let drawing = false;
    let settled = false;
    let grace: ReturnType<typeof setTimeout> | null = null;
    const watch = setInterval(() => {
      if (!host.isCancelled() || grace !== null) return;
      running.postMessage({ kind: 'cancel' } satisfies ReplayVideoWorkerRequest);
      grace = setTimeout(() => finish(null), REPLAY_WORKER_CANCEL_GRACE_MS);
    }, CANCEL_CHECK_MS);
    const finish = (outcome: ReplayVideoWorkerOutcome) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      if (grace !== null) clearTimeout(grace);
      running.terminate();
      resolve(outcome);
    };

    running.addEventListener('error', (event) => {
      Logger.warn('[ReplayVideo] ワーカーが止まりました', event.message);
      finish(drawing ? null : 'unavailable');
    });
    running.addEventListener('message', (event: MessageEvent<ReplayVideoWorkerResponse>) => {
      answer(event.data).catch((reason: unknown) => {
        Logger.warn('[ReplayVideo] ワーカーの求めに応えられませんでした', reason);
        finish(null);
      });
    });

    const answer = async (message: ReplayVideoWorkerResponse): Promise<void> => {
      switch (message.kind) {
        case 'progress':
          drawing = true;
          host.onProgress(message.done, message.total);
          return;
        case 'image-request': {
          const found = host.imageOf(message.identifier);
          running.postMessage({
            kind: 'image',
            id: message.id,
            blob: found?.blob ?? null,
            url: found?.url ?? '',
            found: found !== null,
          } satisfies ReplayVideoWorkerRequest);
          return;
        }
        case 'sound-request': {
          const channels = host.sound ? (await host.sound.read(message.start, message.count)).map(ownCopy) : [];
          running.postMessage(
            { kind: 'sound', id: message.id, channels } satisfies ReplayVideoWorkerRequest,
            channels.map((samples) => samples.buffer)
          );
          return;
        }
        case 'done':
          finish({ blob: message.blob, extension: message.extension });
          return;
        case 'cancelled':
          finish(null);
          return;
        case 'failed':
          Logger.warn('[ReplayVideo] ワーカーで書き出せませんでした', message.message);
          finish(drawing ? null : 'unavailable');
      }
    };

    try {
      running.postMessage({ kind: 'start', job } satisfies ReplayVideoWorkerRequest);
    } catch (reason) {
      Logger.warn('[ReplayVideo] ワーカーに書き出しを渡せないためページで書き出します', reason);
      finish('unavailable');
    }
  });
}

/** Samples in a buffer of their own, so handing the buffer over takes nothing else with it. */
function ownCopy(samples: Float32Array): Float32Array {
  return samples.byteOffset === 0 && samples.byteLength === samples.buffer.byteLength ? samples : samples.slice();
}
