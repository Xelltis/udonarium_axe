import { Logger } from '@axe/core/logging/logger';
import type { AssetAccess } from '@axe/core/network/connection';
import { sha256Hex } from '@axe/core/util/crypto-util';

/** What became of an upload. */
export type AssetUploadResult = 'stored' | 'exists' | 'refused' | 'failed';

const ASSET_ID = /^[0-9a-f]{64}$/;

const UPLOAD_CONCURRENCY = 2;
const DOWNLOAD_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 60_000;
/** How long to wait before each retry of an upload the server turned away as too frequent. */
const RATE_LIMIT_BACKOFF_MS = [10_000, 20_000, 40_000];

/**
 * Statuses meaning the server will never take these bytes from this seat: a bad name, a hash
 * mismatch, a guest's seat, too big, not a picture or a sound, taken down.
 */
const REFUSED_STATUSES = new Set([400, 403, 413, 415, 451]);

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
 * The room server's store for a room's pictures and sounds, kept under the SHA-256 of their bytes,
 * so a table fetches each of them over HTTP once instead of pulling it from every peer.
 *
 * The store keeps each room apart and answers only a seat of the room, with the token the room
 * hands it. Nothing happens without an address, or outside a room; then every image and sound
 * travels between peers as before.
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
  private access: (() => AssetAccess | null) | null = null;
  private readonly uploads = new TaskQueue(UPLOAD_CONCURRENCY);
  private readonly downloads = new TaskQueue(DOWNLOAD_CONCURRENCY);
  /** Waits between retries; replaced in tests so they need not sit through the backoff. */
  delay: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  private constructor() {}

  /** Whether an address is configured and this seat is in a room, so uploads and downloads go to the server at all. */
  get isEnabled(): boolean {
    return this.baseUrl !== null && this.access?.() != null;
  }

  /** Sets the server's address, or turns the store off with an empty or missing one. */
  configure(url: string | null | undefined): void {
    const trimmed = url?.trim() ?? '';
    this.baseUrl = trimmed ? trimmed.replace(/\/+$/, '') : null;
  }

  /** Tells the store which room the seat is in and the token to reach its assets with; null when in none. */
  useAccess(access: (() => AssetAccess | null) | null): void {
    this.access = access;
  }

  /**
   * Puts bytes on the server under their identifier, unless they are there already.
   *
   * A refusal means the server will never take them, so they keep travelling between peers. A
   * failure, after retries for a server that asked for fewer uploads, may pass on a later try.
   */
  upload(identifier: string, blob: Blob): Promise<AssetUploadResult> {
    if (!this.baseUrl || !AssetHttpStore.isAssetId(identifier)) return Promise.resolve('refused');
    return this.uploads.run(async () => {
      try {
        // Asked when its turn comes, so that a queued upload goes to the room the seat is in by then.
        const access = this.access?.();
        if (!access) return 'failed';
        const url = this.urlOf(access, identifier);
        const headers = this.headersOf(access);
        if ((await this.request(url, { method: 'HEAD', headers })).ok) return 'exists';
        for (let attempt = 0; ; attempt++) {
          const res = await this.request(url, { method: 'PUT', body: blob, headers });
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
    return this.downloads.run(async () => {
      try {
        const access = this.access?.();
        if (!access) return null;
        const res = await this.request(this.urlOf(access, identifier), {
          method: 'GET',
          headers: this.headersOf(access),
        });
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

  private urlOf(access: AssetAccess, identifier: string): string {
    return `${this.baseUrl}/v1/rooms/${encodeURIComponent(access.roomKey)}/assets/${identifier}`;
  }

  private headersOf(access: AssetAccess): Record<string, string> {
    return { Authorization: `Bearer ${access.token}` };
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
