import { Logger } from '@axe/core/logging/logger';
import type { AssetAccess } from '@axe/core/network/connection';
import { readOperatorContact } from '@axe/core/network/server/operator-contact';
import {
  ASSET_NAME_HEADER,
  MAX_ASSET_NAME_LENGTH,
  readReportResponse,
  readRoomAssetList,
  readUploadTicket,
  ReportRequest,
  RoomAsset,
} from '@axe/core/network/server/server-protocol';
import { ASSET_PAUSE_RETRY_MS } from '@axe/core/storage/asset-retries';
import { putWithProgress } from '@axe/core/storage/put-with-progress';
import { sha256Hex } from '@axe/core/util/crypto-util';
import { delay } from '@axe/core/util/delay';

/**
 * What became of an upload. `failed`, as on a line gone quiet, may pass on a later try. `paused`
 * means the room server's operator has stopped every upload for a while, and `blocked` that the
 * operator barred these bytes from every room; neither is to travel between peers instead. `full`
 * means the room holds as much as the server lets one room hold, so the bytes stay out of the store
 * and travel between peers as with any refused.
 */
export type AssetUploadResult = 'stored' | 'exists' | 'refused' | 'failed' | 'paused' | 'blocked' | 'full';

/**
 * What became of asking the room server to take bytes out of the room: nothing more to do,
 * `refused` for good, or `failed` for now, which may pass on a later try.
 */
export type AssetRemovalResult = 'removed' | 'refused' | 'failed';

/**
 * What became of a report to the room server's operator: taken, with the id to quote when asking about
 * it, or not: `unsupported` by a server older than reports, `rate-limited` for too many from this
 * reporter, `refused` as not a report the server takes, and `failed` when it could not be sent just then.
 */
export type ReportResult = { id: string } | 'unsupported' | 'rate-limited' | 'refused' | 'failed';

/**
 * Why a download brought no bytes: the store lacks them, or sent bytes that are not them, which
 * asking again will not mend; the request failed, too often or while the server was out of reach,
 * which a later try may; or the room server's operator barred them, so that nobody is to be asked.
 */
export type AssetDownloadMiss = 'missing' | 'failed' | 'blocked';

/** Bytes fetched from the store, with the name they were put up under, or empty for none. */
export interface AssetDownload {
  blob: Blob;
  name: string;
}

const ASSET_ID = /^[0-9a-f]{64}$/;

const UPLOAD_CONCURRENCY = 2;
/**
 * The most bytes an upload may have to go in the lane kept for small ones, which a picture the
 * image editor lets through without asking (2 MB) fits in.
 */
const SMALL_UPLOAD_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 60_000;
/**
 * How long a word that uploads are stopped stays told: a stop the server answers again only after a
 * longer quiet, as when the stop told of ended with nothing that showed it, is told of anew.
 */
const PAUSE_TOLD_FOR_MS = 3 * ASSET_PAUSE_RETRY_MS;
/** How long to wait before each retry of an upload the server turned away as too frequent. */
const RATE_LIMIT_BACKOFF_MS = [10_000, 20_000, 40_000];

/**
 * Statuses meaning the server will never take these bytes from this seat: a bad name, a hash
 * mismatch, a guest's seat, too big, not a picture or a sound. Those the operator barred (451) are
 * told apart, since they are not to be passed between peers either.
 */
const REFUSED_STATUSES = new Set([400, 403, 413, 415]);

/** The error a room server's answer names, or null when it names none. */
async function errorCodeOf(res: Response): Promise<string | null> {
  return (await errorBodyOf(res)).code;
}

/** The code of a refusal's `{"error": …}` body, and the operator's contact it came with, if any. */
async function errorBodyOf(res: Response): Promise<{ code: string | null; contact: string | null }> {
  try {
    const body: unknown = await res.json();
    const held = typeof body === 'object' && body !== null ? (body as { error?: unknown; contact?: unknown }) : {};
    return { code: typeof held.error === 'string' ? held.error : null, contact: readOperatorContact(held.contact) };
  } catch {
    return { code: null, contact: null };
  }
}

/**
 * A picture's or sound's name as the server keeps it: well formed and no longer than it keeps. A half
 * of a character, which encodeURIComponent cannot take, is written as the replacement character.
 */
function keptAssetName(name: string): string {
  let kept = name.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '\uFFFD');
  if (kept.length > MAX_ASSET_NAME_LENGTH) {
    kept = kept.slice(0, MAX_ASSET_NAME_LENGTH);
    if (/[\uD800-\uDBFF]$/.test(kept)) kept = kept.slice(0, -1);
  }
  return kept;
}

/** A picture's or sound's name as the upload's header carries it, percent-encoded. Empty for no name. */
function assetNameHeader(name: string): string {
  const kept = keptAssetName(name);
  return kept ? encodeURIComponent(kept) : '';
}

/** The name a download's header carries, read back from its percent-encoding; empty for none or one unreadable. */
function assetNameOf(header: string | null): string {
  if (!header) return '';
  try {
    return decodeURIComponent(header);
  } catch {
    return '';
  }
}

/**
 * Runs at most `limit` tasks at a time, the rest in the order they were queued, but for one queued
 * to go first or moved to the front since.
 */
class TaskQueue {
  private running = 0;
  private readonly waiting: { key: string; start: () => void }[] = [];

  constructor(private readonly limit: number) {}

  async run<T>(task: () => Promise<T>, key = '', first = false): Promise<T> {
    if (this.limit <= this.running) {
      await new Promise<void>((start) => {
        if (first) this.waiting.unshift({ key, start });
        else this.waiting.push({ key, start });
      });
    }
    this.running++;
    try {
      return await task();
    } finally {
      this.running--;
      this.waiting.shift()?.start();
    }
  }

  /** Moves a task still waiting to the front, to run next. */
  putFirst(key: string): void {
    const at = this.waiting.findIndex((entry) => entry.key === key);
    if (0 < at) this.waiting.unshift(...this.waiting.splice(at, 1));
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
  private refresh: (() => Promise<AssetAccess | null>) | null = null;
  private readonly uploads = new TaskQueue(UPLOAD_CONCURRENCY);
  /** A lane of its own for small uploads, so a picture never waits behind big sounds on a slow line. */
  private readonly smallUploads = new TaskQueue(UPLOAD_CONCURRENCY);
  private readonly downloads = new TaskQueue(DOWNLOAD_CONCURRENCY);
  /** Waits between retries; replaced in tests so they need not sit through the backoff. */
  delay: (ms: number) => Promise<void> = delay;
  /**
   * Sends an upload's bytes, given up on once a minute passes with nothing getting through, however
   * long it takes in all, or at the `deadline` given, in this page's milliseconds; replaced in tests
   * with one through fetch.
   */
  sendBytes: (url: string, body: Blob, headers: Record<string, string>, deadline?: number) => Promise<Response> = (
    url,
    body,
    headers,
    deadline
  ) => putWithProgress(url, body, headers, { idleMs: REQUEST_TIMEOUT_MS, deadline });
  /**
   * Told, by the app, when an upload first meets the operator's stop on uploads (true), and when one
   * goes up again after it (false).
   */
  onUploadsPaused: (paused: boolean) => void = () => {};
  /** Told, by the app, of bytes the operator barred from every room, the first time the server says so. */
  onUploadBlocked: (identifier: string) => void = () => {};
  /**
   * Told, by the app, when the room's store turns bytes away for being full, once until bytes are kept
   * again.
   */
  onRoomStorageFull: () => void = () => {};
  /** Whether the last word on uploads was the operator's stop. */
  private uploadsPaused = false;
  /** When, in epoch milliseconds, the server last said uploads are stopped. */
  private lastPausedAt = 0;
  /** Whether the room's store being full was told of since bytes were last kept. */
  private fullTold = false;
  private _operatorContact: string | null = null;
  /**
   * Until when, in epoch milliseconds, an upload sends no bytes for the operator's stop: a while after
   * the server last said so, after which the next upload tries whether it is over.
   */
  private stopHeldUntil = 0;
  /** The bytes already told of as barred, so each is told of once. */
  private readonly blockedTold = new Set<string>();

  private constructor() {}

  /** The contact the operator's stop on uploads last came with, for the reader to ask of it; null for none. */
  get operatorContact(): string | null {
    return this._operatorContact;
  }

  /** Whether an address is configured, in a room or not. */
  get isConfigured(): boolean {
    return this.baseUrl !== null;
  }

  /** Whether an address is configured and this seat is in a room, so uploads and downloads go to the server at all. */
  get isEnabled(): boolean {
    return this.baseUrl !== null && this.access?.() != null;
  }

  /** Sets the server's address, or turns the store off with an empty or missing one. */
  configure(url: string | null | undefined): void {
    const trimmed = url?.trim() ?? '';
    this.baseUrl = trimmed ? trimmed.replace(/\/+$/, '') : null;
    this.uploadsPaused = false;
    this.lastPausedAt = 0;
    this.fullTold = false;
    this._operatorContact = null;
    this.stopHeldUntil = 0;
    this.blockedTold.clear();
  }

  /**
   * Tells the store which room the seat is in and the token to reach its assets with; null when in
   * none. `refresh` asks for a fresh token, for a request the server turned down with the one held.
   */
  useAccess(
    access: (() => AssetAccess | null) | null,
    refresh: (() => Promise<AssetAccess | null>) | null = null
  ): void {
    this.access = access;
    this.refresh = refresh;
  }

  /**
   * Puts bytes on the server under their identifier, unless they are there already.
   *
   * A refusal means the server will never take them, so they keep travelling between peers. A
   * failure, after retries for a server that asked for fewer uploads, may pass on a later try. The
   * operator's stop on uploads, and bytes the operator barred, are told apart from both, and told
   * to the app.
   *
   * Uploads wait their turn; one asked for `first`, such as a picture just added here, goes ahead
   * of those already waiting. Small ones wait in a lane of their own, apart from the big ones.
   *
   * For a while after the server said the operator stopped uploads, an upload sends no bytes and is
   * answered `paused` at once, but for a `probe`, which tries whether the stop is over.
   */
  async upload(
    identifier: string,
    blob: Blob,
    name = '',
    options: { first?: boolean; probe?: boolean } = {}
  ): Promise<AssetUploadResult> {
    if (!this.baseUrl || !AssetHttpStore.isAssetId(identifier)) return 'refused';
    const lane = blob.size <= SMALL_UPLOAD_BYTES ? this.smallUploads : this.uploads;
    let heldForStop = false;
    const result = await lane.run(
      async () => {
        try {
          // Asked when its turn comes, so that a queued upload goes to the room the seat is in by then.
          const head = await this.authorized((access) =>
            this.request(this.urlOf(access, identifier), { method: 'HEAD', headers: this.headersOf(access) })
          );
          // A token turned down even after a fresh one was asked for will be turned down for the PUT too.
          if (!head || head.status === 401) return 'failed';
          if (head.ok) return 'exists';
          if (head.status === 451) return 'blocked';
          // Only a store that lacks the bytes is sent them; one that asked for fewer requests, or failed,
          // is asked again later rather than sent the whole of them now.
          if (head.status !== 404) return 'failed';
          if (!options.probe && Date.now() < this.stopHeldUntil) {
            heldForStop = true;
            return 'paused';
          }
          // A room server whose requests carry only so much takes bigger bytes straight to its store.
          const policy = this.access?.()?.upload;
          if (policy && policy.maxPutBytes < blob.size) {
            return policy.directUpload ? await this.uploadDirect(identifier, blob, name) : 'refused';
          }
          // The name goes along so that the room's list can name a picture or sound nobody else describes.
          const header = assetNameHeader(name);
          const named: Record<string, string> = header ? { [ASSET_NAME_HEADER]: header } : {};
          return await this.answerOf(
            await this.withBackoff(() =>
              this.authorized((access) =>
                this.sendBytes(this.urlOf(access, identifier), blob, { ...this.headersOf(access), ...named })
              )
            )
          );
        } catch (reason) {
          Logger.warn('[AssetHttpStore] アップロードに失敗しました', identifier, reason);
          return 'failed';
        }
      },
      identifier,
      options.first
    );
    if (result === 'paused' && !heldForStop) this.stopHeldUntil = Date.now() + ASSET_PAUSE_RETRY_MS;
    if (result === 'stored') this.stopHeldUntil = 0;
    this.tell(identifier, result);
    return result;
  }

  /**
   * Tells the app when uploads meet the operator's stop and when they go up again after it, and of
   * bytes barred, each once. Only bytes kept anew show the stop is over: bytes already there were
   * never sent. So a stop met again after a long quiet is told of again, as a new stop may be. A full
   * room store is told of once until bytes are kept again.
   */
  private tell(identifier: string, result: AssetUploadResult): void {
    if (result === 'stored') this.fullTold = false;
    if (result === 'paused') {
      const told = this.uploadsPaused && Date.now() - this.lastPausedAt < PAUSE_TOLD_FOR_MS;
      this.lastPausedAt = Date.now();
      this.uploadsPaused = true;
      if (!told) this.onUploadsPaused(true);
    } else if (result === 'full' && !this.fullTold) {
      this.fullTold = true;
      this.onRoomStorageFull();
    } else if (result === 'stored' && this.uploadsPaused) {
      this.uploadsPaused = false;
      this.onUploadsPaused(false);
    } else if (result === 'blocked' && !this.blockedTold.has(identifier)) {
      this.blockedTold.add(identifier);
      this.onUploadBlocked(identifier);
    }
  }

  /** Moves an upload still waiting its turn to the front, to go next. */
  uploadFirst(identifier: string): void {
    this.uploads.putFirst(identifier);
    this.smallUploads.putFirst(identifier);
  }

  /**
   * Puts bytes too big for one request straight to the room server's store: asks where with a ticket,
   * sends them there without the asset token, then hands the ticket back for the server to check what
   * came and keep it.
   */
  private async uploadDirect(identifier: string, blob: Blob, name: string): Promise<AssetUploadResult> {
    const asked = await this.withBackoff(() =>
      this.authorized((access) =>
        this.post(`${this.urlOf(access, identifier)}/uploads`, access, { size: blob.size, name: keptAssetName(name) })
      )
    );
    // Anything but a ticket says what became of the upload already: kept before, or never to be.
    if (asked?.status !== 201) return await this.answerOf(asked);
    const ticket = readUploadTicket(await asked.json());
    if (!ticket) return 'failed';
    // The place to put them is held only until the time on the ticket, by the server's clock;
    // bytes that would come later are given up on, to be tried again with a fresh ticket.
    const deadline = ticket.upload.expiresAt - (this.access?.()?.clockOffset ?? 0);
    const put = await this.sendBytes(ticket.upload.url, blob, ticket.upload.headers, deadline);
    if (!put.ok) return 'failed';
    return await this.answerOf(
      await this.authorized((access) =>
        this.post(`${this.urlOf(access, identifier)}/uploads/complete`, access, { ticket: ticket.ticket })
      )
    );
  }

  /**
   * Sends a request that may be turned away as too frequent, again after each wait in the backoff,
   * and gives the last answer.
   */
  private async withBackoff(send: () => Promise<Response | null>): Promise<Response | null> {
    for (let attempt = 0; ; attempt++) {
      const res = await send();
      if (res?.status !== 429 || RATE_LIMIT_BACKOFF_MS.length <= attempt) return res;
      await this.delay(RATE_LIMIT_BACKOFF_MS[attempt]);
    }
  }

  /**
   * What became of an upload by the server's answer to it: kept now, kept already, never, not yet,
   * not while the operator's stop lasts, or barred by the operator.
   * A seat the room server does not count among the players is one it has not taken back in yet,
   * as for a moment after another instance took the room over on Vercel, so that is not yet.
   */
  private async answerOf(res: Response | null): Promise<AssetUploadResult> {
    if (!res) return 'failed';
    if (res.status === 201) return 'stored';
    if (res.ok) return 'exists';
    if (res.status === 451) return 'blocked';
    if (res.status === 503) {
      const { code, contact } = await errorBodyOf(res);
      if (code !== 'paused') return 'failed';
      this._operatorContact = contact ?? this._operatorContact;
      return 'paused';
    }
    if (res.status === 403 && (await errorCodeOf(res)) === 'not-a-player') return 'failed';
    if (res.status === 413 && (await errorCodeOf(res)) === 'room-storage-full') return 'full';
    return REFUSED_STATUSES.has(res.status) ? 'refused' : 'failed';
  }

  private post(url: string, access: AssetAccess, body: unknown): Promise<Response> {
    return this.request(url, {
      method: 'POST',
      headers: { ...this.headersOf(access), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  /**
   * Fetches the bytes stored under an identifier, with the name they were put up under. Without them
   * it says why: `missing` when the server lacks them or sends bytes whose hash is not the
   * identifier, `blocked` when the operator barred them, `failed` when the request failed, as when
   * the server asks for fewer requests or cannot be reached, or there is no room.
   *
   * Pictures and sounds wait their turn together; one asked for `first`, such as the music the room
   * is playing, goes ahead of those already waiting.
   */
  download(identifier: string, options: { first?: boolean } = {}): Promise<AssetDownload | AssetDownloadMiss> {
    if (!AssetHttpStore.isAssetId(identifier)) return Promise.resolve('missing');
    if (!this.baseUrl) return Promise.resolve('failed');
    return this.downloads.run(
      async (): Promise<AssetDownload | AssetDownloadMiss> => {
        try {
          const res = await this.authorized((access) =>
            this.request(this.urlOf(access, identifier), { method: 'GET', headers: this.headersOf(access) })
          );
          if (!res) return 'failed';
          if (res.status === 451) return 'blocked';
          if (!res.ok) return res.status === 404 ? 'missing' : 'failed';
          const bytes = await res.arrayBuffer();
          if ((await sha256Hex(bytes)) !== identifier) {
            Logger.warn('[AssetHttpStore] 受け取ったデータのハッシュが名前と一致しません', identifier);
            return 'missing';
          }
          const blob = new Blob([bytes], { type: res.headers.get('Content-Type') ?? '' });
          return { blob, name: assetNameOf(res.headers.get(ASSET_NAME_HEADER)) };
        } catch (reason) {
          Logger.warn('[AssetHttpStore] ダウンロードに失敗しました', identifier, reason);
          return 'failed';
        }
      },
      identifier,
      options.first
    );
  }

  /** Moves a download still waiting its turn to the front, to go next. */
  downloadFirst(identifier: string): void {
    this.downloads.putFirst(identifier);
  }

  /**
   * Takes bytes out of the room's store, as only the room's GM and the player who added them may.
   *
   * `removed` once there is nothing more to do: they are gone now, were never there, or the server is
   * one older than the way to take them out, which answers 404 too. `refused` when the seat may not,
   * `failed` when the server could not be asked just then, as when it asks for fewer requests or
   * cannot be reached, or there is no room. It asks once: waiting to ask again is the caller's, who
   * knows whether they are still to go by then.
   */
  async remove(identifier: string): Promise<AssetRemovalResult> {
    if (!this.baseUrl || !AssetHttpStore.isAssetId(identifier)) return 'refused';
    try {
      const res = await this.authorized((access) =>
        this.request(this.urlOf(access, identifier), { method: 'DELETE', headers: this.headersOf(access) })
      );
      if (!res) return 'failed';
      if (res.ok || res.status === 404) return 'removed';
      return res.status === 400 || res.status === 403 ? 'refused' : 'failed';
    } catch (reason) {
      Logger.warn('[AssetHttpStore] 削除に失敗しました', identifier, reason);
      return 'failed';
    }
  }

  /**
   * Reports something in the room to the room server's operator, as a seat of the room of any role may,
   * with the room's asset token. Asked once.
   */
  async report(request: ReportRequest): Promise<ReportResult> {
    if (!this.baseUrl) return 'failed';
    try {
      const res = await this.authorized((access) =>
        this.post(`${this.baseUrl}/v1/rooms/${encodeURIComponent(access.roomKey)}/reports`, access, request)
      );
      if (!res) return 'failed';
      if (res.ok) return readReportResponse(await res.json().catch(() => null)) ?? 'failed';
      if (res.status === 404 || res.status === 405) {
        return (await errorCodeOf(res)) === 'room-not-found' ? 'failed' : 'unsupported';
      }
      if (res.status === 429) return 'rate-limited';
      return res.status === 400 || res.status === 403 ? 'refused' : 'failed';
    } catch (reason) {
      Logger.warn('[AssetHttpStore] 通報を送れませんでした', reason);
      return 'failed';
    }
  }

  /**
   * Everything the room holds, for pictures and sounds that no member's catalog names, such as those
   * left in a room everybody had gone from. Null when not in a room or the server cannot say.
   */
  async listRoomAssets(): Promise<RoomAsset[] | null> {
    if (!this.baseUrl) return null;
    try {
      const res = await this.authorized((access) =>
        this.request(`${this.baseUrl}/v1/rooms/${encodeURIComponent(access.roomKey)}/assets`, {
          method: 'GET',
          headers: this.headersOf(access),
        })
      );
      if (!res?.ok) return null;
      return readRoomAssetList(await res.json());
    } catch (reason) {
      Logger.warn('[AssetHttpStore] 部屋のアセットの一覧を受け取れませんでした', reason);
      return null;
    }
  }

  /**
   * Sends a request with the access the seat holds, and once more with a fresh token when the server
   * turned the one held down (it ran out, or the seat's role changed). Null outside a room.
   */
  private async authorized(send: (access: AssetAccess) => Promise<Response>): Promise<Response | null> {
    const access = this.access?.();
    if (!access) return null;
    const first = await send(access);
    if (first.status !== 401 || !this.refresh) return first;
    const fresh = await this.refresh();
    return fresh ? send(fresh) : first;
  }

  private urlOf(access: AssetAccess, identifier: string): string {
    return `${this.baseUrl}/v1/rooms/${encodeURIComponent(access.roomKey)}/assets/${identifier}`;
  }

  private headersOf(access: AssetAccess): Record<string, string> {
    return { Authorization: `Bearer ${access.token}` };
  }

  /**
   * Sends a request, given up on once a minute passes with nothing coming back. The body of a GET is
   * read here too, the minute starting afresh with each part of it that comes, so a download whose
   * bytes stop coming is given up on rather than holding its turn for good, while one that comes
   * slowly is still waited for.
   */
  private async request(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    let timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const stillComing = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    };
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      if (init.method !== 'GET') return res;
      const body = await readBody(res, stillComing);
      return new Response(0 < body.byteLength ? body : null, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Reads a response's body whole, telling `onPart` as each part of it comes. */
async function readBody(res: Response, onPart: () => void): Promise<Uint8Array<ArrayBuffer>> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    length += value.byteLength;
    onPart();
  }
  const body = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    body.set(part, at);
    at += part.byteLength;
  }
  return body;
}
