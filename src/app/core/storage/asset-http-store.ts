import { Logger } from '@axe/core/logging/logger';
import { sha256Hex } from '@axe/core/util/crypto-util';

/** What became of an upload. */
export type AssetUploadResult = 'stored' | 'exists' | 'refused' | 'failed';

const ASSET_ID = /^[0-9a-f]{64}$/;

const UPLOAD_CONCURRENCY = 2;
const DOWNLOAD_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 60_000;
/** How long to wait before each retry of an upload the server turned away as too frequent. */
const RATE_LIMIT_BACKOFF_MS = [10_000, 20_000, 40_000];

/** Statuses meaning the server will never take these bytes: a bad name, a hash mismatch, too big, not a picture or a sound. */
const REFUSED_STATUSES = new Set([400, 413, 415]);

/** Runs at most `limit` tasks at a time, the rest in the order they were queued. */
class TaskQueue {
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.limit <= this.running) await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }
}

/**
 * The asset server, which keeps pictures and sounds under the SHA-256 of their bytes, so a table
 * fetches each of them over HTTP once instead of pulling it from every peer.
 *
 * Nothing happens until an address is configured; without one, every image and sound travels
 * between peers as before.
 */
export class AssetHttpStore {
  private static _instance: AssetHttpStore;
  /** The one asset store for the page, created on first use. */
  static get instance(): AssetHttpStore {
    if (!AssetHttpStore._instance) AssetHttpStore._instance = new AssetHttpStore();
    return AssetHttpStore._instance;
  }

  /** Whether an identifier names bytes by their hash, the only kind the server keeps. */
  static isAssetId(identifier: string): boolean {
    return ASSET_ID.test(identifier);
  }

  private baseUrl: string | null = null;
  private readonly uploads = new TaskQueue(UPLOAD_CONCURRENCY);
  private readonly downloads = new TaskQueue(DOWNLOAD_CONCURRENCY);
  /** Waits between retries; replaced in tests so they need not sit through the backoff. */
  delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  private constructor() {}

  /** Whether an address is configured, so uploads and downloads go to the server at all. */
  get isEnabled(): boolean {
    return this.baseUrl !== null;
  }

  /** Sets the server's address, or turns the store off with an empty or missing one. */
  configure(url: string | null | undefined): void {
    const trimmed = url?.trim() ?? '';
    this.baseUrl = trimmed ? trimmed.replace(/\/+$/, '') : null;
  }

  /**
   * Puts bytes on the server under their identifier, unless they are there already.
   *
   * A refusal means the server will never take them, so they keep travelling between peers. A
   * failure, after retries for a server that asked for fewer uploads, may pass on a later try.
   */
  upload(identifier: string, blob: Blob): Promise<AssetUploadResult> {
    if (!this.baseUrl || !AssetHttpStore.isAssetId(identifier)) return Promise.resolve('refused');
    const url = `${this.baseUrl}/v1/assets/${identifier}`;
    return this.uploads.run(async () => {
      try {
        if ((await this.request(url, { method: 'HEAD' })).ok) return 'exists';
        for (let attempt = 0; ; attempt++) {
          const res = await this.request(url, { method: 'PUT', body: blob });
          if (res.status === 201) return 'stored';
          if (res.ok) return 'exists';
          if (REFUSED_STATUSES.has(res.status)) return 'refused';
          if (res.status !== 429 || RATE_LIMIT_BACKOFF_MS.length <= attempt) return 'failed';
          await this.delay(RATE_LIMIT_BACKOFF_MS[attempt]);
        }
      } catch (reason) {
        Logger.warn('[AssetHttpStore] アップロードに失敗しました', identifier, reason);
        return 'failed';
      }
    });
  }

  /**
   * Fetches the bytes stored under an identifier, or null when the server lacks them, cannot be
   * reached, or sends bytes whose hash is not the identifier.
   */
  download(identifier: string): Promise<Blob | null> {
    if (!this.baseUrl || !AssetHttpStore.isAssetId(identifier)) return Promise.resolve(null);
    const url = `${this.baseUrl}/v1/assets/${identifier}`;
    return this.downloads.run(async () => {
      try {
        const res = await this.request(url, { method: 'GET' });
        if (!res.ok) return null;
        const bytes = await res.arrayBuffer();
        if ((await sha256Hex(bytes)) !== identifier) {
          Logger.warn('[AssetHttpStore] 受け取ったデータのハッシュが名前と一致しません', identifier);
          return null;
        }
        return new Blob([bytes], { type: res.headers.get('Content-Type') ?? '' });
      } catch (reason) {
        Logger.warn('[AssetHttpStore] ダウンロードに失敗しました', identifier, reason);
        return null;
      }
    });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }
}
