import type { AudioAnalysisResponse, AudioAnalysisResult } from '@axe/core/audio/audio-analysis';
import { Logger } from '@axe/core/logging/logger';

/** The rate sounds are decoded at to be read, which keeps what loudness and beats are heard by at half the memory of CD rate. */
export const ANALYSIS_SAMPLE_RATE = 22050;

/** The largest file read for analysis. A longer one would take hundreds of megabytes to hold decoded. */
export const ANALYZABLE_MAX_BYTES = 30 * 1024 * 1024;

const IDLE_TERMINATE_MS = 30_000;

let worker: Worker | null = null;
let isWorkerBroken = false;
let nextRequestId = 1;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
const pending = new Map<number, (result: AudioAnalysisResult | null | undefined) => void>();

type OfflineContextConstructor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineContextConstructor(): OfflineContextConstructor | null {
  const scope = globalThis as unknown as {
    OfflineAudioContext?: OfflineContextConstructor;
    webkitOfflineAudioContext?: OfflineContextConstructor;
  };
  return scope.OfflineAudioContext ?? scope.webkitOfflineAudioContext ?? null;
}

/**
 * Decodes a sound's file to be read: at most two channels, at the analysis rate where the browser
 * can decode to it and at CD rate where it cannot. Null when the browser cannot decode it.
 */
async function decodeForAnalysisAsync(blob: Blob): Promise<{ channels: Float32Array[]; sampleRate: number } | null> {
  const Context = offlineContextConstructor();
  if (!Context) return null;
  let context: OfflineAudioContext;
  try {
    context = new Context(1, 1, ANALYSIS_SAMPLE_RATE);
  } catch {
    context = new Context(1, 1, 44100);
  }
  const data = await blob.arrayBuffer();
  const buffer = await new Promise<AudioBuffer>((resolve, reject) => context.decodeAudioData(data, resolve, reject));
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < Math.min(2, buffer.numberOfChannels); channel++) {
    channels.push(buffer.getChannelData(channel).slice());
  }
  return { channels, sampleRate: buffer.sampleRate };
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
  if (isWorkerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./audio-analysis.worker', import.meta.url), { type: 'module' });
  } catch (reason) {
    isWorkerBroken = true;
    Logger.warn('[AudioAnalysis] ワーカーを起動できないためメインスレッドで解析します', reason);
    return null;
  }
  worker.addEventListener('message', (event: MessageEvent<AudioAnalysisResponse>) => {
    const resolve = pending.get(event.data.id);
    if (!resolve) return;
    pending.delete(event.data.id);
    resolve(event.data.result);
    scheduleIdleTerminate();
  });
  worker.addEventListener('error', (event) => {
    isWorkerBroken = true;
    Logger.warn('[AudioAnalysis] ワーカーでの解析に失敗しました', event.message);
    disposeWorker();
    for (const resolve of pending.values()) resolve(null);
    pending.clear();
  });
  return worker;
}

/**
 * Reads decoded channels in the worker; undefined when there is no worker to hand them to, so the
 * caller reads them itself. Once handed over the channels are the worker's, so a worker that fails
 * while reading gives null rather than handing back channels that are no longer there.
 */
function analyzeInWorker(
  channels: Float32Array[],
  sampleRate: number
): Promise<AudioAnalysisResult | null | undefined> {
  const active = ensureWorker();
  if (!active) return Promise.resolve(undefined);
  const id = nextRequestId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    try {
      active.postMessage(
        { id, channels, sampleRate },
        channels.map((channel) => channel.buffer)
      );
    } catch (reason) {
      pending.delete(id);
      isWorkerBroken = true;
      Logger.warn('[AudioAnalysis] ワーカーへ渡せないためメインスレッドで解析します', reason);
      resolve(undefined);
    }
  });
}

/**
 * Reads a sound's file whole: its loudness, peak, the silence around it and its beat.
 *
 * The file is decoded on the page and read in a worker, or on the page where no worker can be
 * started. Null for an empty file, one over `ANALYZABLE_MAX_BYTES`, or one the browser cannot
 * decode.
 */
export async function analyzeAudioBlobAsync(blob: Blob): Promise<AudioAnalysisResult | null> {
  if (blob.size === 0 || blob.size > ANALYZABLE_MAX_BYTES) return null;
  let decoded: { channels: Float32Array[]; sampleRate: number } | null;
  try {
    decoded = await decodeForAnalysisAsync(blob);
  } catch (reason) {
    Logger.warn('[AudioAnalysis] 復号に失敗しました', reason);
    return null;
  }
  if (!decoded || decoded.channels.length === 0) return null;
  const fromWorker = await analyzeInWorker(decoded.channels, decoded.sampleRate);
  if (fromWorker !== undefined) return fromWorker;
  try {
    const { analyzeChannels } = await import('@axe/core/audio/audio-analysis');
    return analyzeChannels(decoded.channels, decoded.sampleRate);
  } catch (reason) {
    Logger.warn('[AudioAnalysis] 解析に失敗しました', reason);
    return null;
  }
}
