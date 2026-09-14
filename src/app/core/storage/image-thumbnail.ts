import { Logger } from '@axe/core/logging/logger';
import type { ThumbnailWorkerResponse } from '@axe/core/storage/image-thumbnail-message';

const IDLE_TERMINATE_MS = 30_000;

let worker: Worker | null = null;
let isWorkerBroken = false;
let nextRequestId = 1;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<number, (response: ThumbnailWorkerResponse | null) => void>();

function isWorkerSupported(): boolean {
  if (isWorkerBroken) return false;
  if (typeof Worker === 'undefined') return false;
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}

function rejectAllPending(): void {
  for (const resolve of pending.values()) resolve(null);
  pending.clear();
}

function disposeWorker(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
}

function scheduleIdleTerminate(): void {
  if (idleTimer !== null) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (pending.size < 1) disposeWorker();
  }, IDLE_TERMINATE_MS);
}

function ensureWorker(): Worker | null {
  if (!isWorkerSupported()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./image-thumbnail.worker', import.meta.url), { type: 'module' });
  } catch (reason) {
    isWorkerBroken = true;
    Logger.warn('[Thumbnail] ワーカーを起動できないためメインスレッドで生成します', reason);
    return null;
  }
  worker.addEventListener('message', (event: MessageEvent<ThumbnailWorkerResponse>) => {
    const resolve = pending.get(event.data.id);
    if (!resolve) return;
    pending.delete(event.data.id);
    resolve(event.data);
    scheduleIdleTerminate();
  });
  worker.addEventListener('error', (event) => {
    isWorkerBroken = true;
    Logger.warn('[Thumbnail] ワーカーでの生成に失敗しました', event.message);
    disposeWorker();
    rejectAllPending();
  });
  return worker;
}

/**
 * Makes a thumbnail no larger than the given size in a worker, resolving null when it cannot so
 * the caller can make one on the main thread instead.
 *
 * Once the worker fails to start or errors, every later call resolves null for the rest of the
 * session. An idle worker is shut down after thirty seconds and started again when needed.
 */
export function createThumbnailInWorker(blob: Blob, type: string, maxDimension: number): Promise<Blob | null> {
  const active = ensureWorker();
  if (!active) return Promise.resolve(null);

  const id = nextRequestId++;
  return new Promise<Blob | null>((resolve) => {
    pending.set(id, (response) => resolve(response?.ok ? response.blob : null));
    try {
      active.postMessage({ id, blob, type, maxDimension });
    } catch (reason) {
      pending.delete(id);
      isWorkerBroken = true;
      Logger.warn('[Thumbnail] ワーカーへ渡せないためメインスレッドで生成します', reason);
      resolve(null);
    }
  });
}
