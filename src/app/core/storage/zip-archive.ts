import { Logger } from '@axe/core/logging/logger';
import * as MimeType from '@axe/core/storage/mime-type';
import type { ZipEntry, ZipWorkerRequest, ZipWorkerResponse } from '@axe/core/storage/zip-archive-message';
import { zipCompressionLevel } from '@axe/core/storage/zip-compression';
import { type AsyncZippable, unzip, type Unzipped, zip } from 'fflate';

const ZIP_MIME_TYPE = 'application/zip';

let isWorkerBroken = false;

/**
 * Packs files into a zip in a worker, or on the main thread when no worker can be used.
 *
 * Images, audio, video and archives are stored as they are rather than compressed again.
 */
export async function createZipBlob(files: readonly File[]): Promise<Blob> {
  const entries: ZipEntry[] = files.map((file) => ({ name: file.name, type: file.type, blob: file }));
  const response = await requestWorker((id) => ({ id, kind: 'zip', entries }));
  if (response?.kind === 'zip') return new Blob([response.buffer], { type: ZIP_MIME_TYPE });
  return createZipBlobOnMainThread(files);
}

/** Unpacks a zip into entries typed by their extensions, in a worker when one can be used. */
export async function readZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const response = await requestWorker((id) => ({ id, kind: 'unzip', blob }));
  if (response?.kind === 'unzip') return response.entries;
  return readZipEntriesOnMainThread(blob);
}

/**
 * Packs files into a zip without a worker, compressing only what is not already compressed;
 * `createZipBlob` falls back to this.
 */
export async function createZipBlobOnMainThread(files: readonly File[]): Promise<Blob> {
  const zipData: AsyncZippable = {};
  for (const file of files) {
    const level = zipCompressionLevel(file.name, file.type);
    zipData[file.name] = [new Uint8Array(await file.arrayBuffer()), { level }];
  }
  return new Promise<Blob>((resolve, reject) => {
    zip(zipData, (err, data) => {
      if (err) reject(err);
      else resolve(new Blob([data.slice()], { type: ZIP_MIME_TYPE }));
    });
  });
}

/**
 * Unpacks a zip without a worker, typing each entry by its extension and leaving unknown ones
 * untyped; `readZipEntries` falls back to this.
 */
export async function readZipEntriesOnMainThread(blob: Blob): Promise<ZipEntry[]> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const unzipped = await new Promise<Unzipped>((resolve, reject) => {
    unzip(bytes, (err, data) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  return Object.entries(unzipped).map(([name, data]) => {
    const type = MimeType.type(name);
    return { name, type, blob: new Blob([data.slice()], type.length > 0 ? { type } : undefined) };
  });
}

const IDLE_TERMINATE_MS = 30_000;

let worker: Worker | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextRequestId = 1;
const pending = new Map<number, (response: ZipWorkerResponse | null) => void>();

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

function settleAll(response: ZipWorkerResponse | null): void {
  const waiting = [...pending.values()];
  pending.clear();
  for (const resolve of waiting) resolve(response);
}

/**
 * How a worker is started, and whether one was ever found wanting.
 *
 * Once a worker cannot be started or handed work, the module stops trying for the rest of
 * the run, which is right in a browser and awkward in a test run, where one spec file hands
 * this module to the next. A test that wants to watch a worker being fed hands its own in
 * here, which forgets the trouble as well.
 *
 * Putting a class on the global `Worker` is no substitute. Which global that is depends on
 * where the module happens to be loaded from, so the class can land somewhere the module
 * cannot see it - rarely, and only under load, which is the worst way for a test to fail.
 * Handing the factory in leaves nothing for the loading order to decide.
 */
export function useZipWorkerFactory(factory: (() => Worker) | null): void {
  makeWorker = factory;
  isWorkerBroken = false;
  disposeWorker();
  settleAll(null);
}

let makeWorker: (() => Worker) | null = null;

function startWorker(): Worker | null {
  if (makeWorker) return makeWorker();
  if (typeof Worker === 'undefined') return null;
  return new Worker(new URL('./zip-archive.worker', import.meta.url), { type: 'module' });
}

function ensureWorker(): Worker | null {
  if (isWorkerBroken) return null;
  if (worker) return worker;
  try {
    worker = startWorker();
    if (!worker) return null;
  } catch (reason) {
    isWorkerBroken = true;
    Logger.warn('[ZipArchive] ワーカーを起動できないためメインスレッドで処理します', reason);
    return null;
  }
  worker.addEventListener('message', (event: MessageEvent<ZipWorkerResponse>) => {
    const resolve = pending.get(event.data.id);
    if (!resolve) return;
    pending.delete(event.data.id);
    if (event.data.ok) {
      resolve(event.data);
    } else {
      Logger.warn('[ZipArchive] ワーカーでの処理に失敗しました', event.data.message);
      resolve(null);
    }
    scheduleIdleTerminate();
  });
  worker.addEventListener('error', (event) => {
    isWorkerBroken = true;
    Logger.warn('[ZipArchive] ワーカーでの処理に失敗しました', event.message);
    disposeWorker();
    settleAll(null);
  });
  return worker;
}

function requestWorker(build: (id: number) => ZipWorkerRequest): Promise<ZipWorkerResponse | null> {
  const active = ensureWorker();
  if (!active) return Promise.resolve(null);

  return new Promise<ZipWorkerResponse | null>((resolve) => {
    const id = nextRequestId++;
    pending.set(id, resolve);
    try {
      active.postMessage(build(id));
    } catch (reason) {
      isWorkerBroken = true;
      Logger.warn('[ZipArchive] ワーカーへ渡せないためメインスレッドで処理します', reason);
      // The worker is stopped, so anything else waiting on it will never hear back either.
      disposeWorker();
      settleAll(null);
    }
  });
}
