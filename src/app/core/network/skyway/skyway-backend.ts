import { Logger } from '@axe/core/logging/logger';

/** How many attempts in all, first and retries, to cover a serverless backend starting cold. */
const TOKEN_FETCH_ATTEMPTS = 3;
/** Timeout per attempt, in ms, so a silent server cannot leave the id unset. */
const TOKEN_FETCH_TIMEOUT_MS = 5000;
/** How long to wait before each retry, in ms, indexed by the attempt about to wait. */
const TOKEN_FETCH_BACKOFF_MS = [500, 1500];

export class SkyWayBackend {
  constructor(readonly url: string) {}

  /** Whether the backend answers its status endpoint; a network error counts as not alive. */
  async alive(): Promise<boolean> {
    return fetchStatus(this.url);
  }

  /**
   * Fetches a SkyWay auth token for the channel and peer, retrying a cold or overloaded backend.
   *
   * An empty string means no token could be had, which callers treat as a server error.
   */
  async createSkyWayAuthToken(channelName: string, peerId: string): Promise<string> {
    return fetchSkyWayAuthToken(this.url, channelName, peerId);
  }
}

function resolveApi(base: string, path: string): URL {
  const normalized = base.endsWith('/') ? base : base + '/';
  return new URL(path, normalized);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Server errors, timeouts and rate limits are treated as passing — a cold start, a load spike, a gateway — and retried.
 * Any other client error is permanent, a wrong url or a misconfigured key, and fails at once.
 */
function isRetriableStatus(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

const UNSUPPORTED_MEDIA_TYPE = 415;

function isAbortError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError';
}

async function fetchWithTimeout(input: URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStatus(url: string): Promise<boolean> {
  try {
    const api = resolveApi(url, 'v1/status');
    const response = await fetch(api);

    return response.ok;
  } catch (err) {
    Logger.error('[SkyWay] ステータス取得エラー', err);
    return false;
  }
}

function postTokenRequest(api: URL, body: string, simpleRequest: boolean): Promise<Response> {
  const init: RequestInit = simpleRequest
    ? { method: 'POST', body }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body };
  return fetchWithTimeout(api, init, TOKEN_FETCH_TIMEOUT_MS);
}

/**
 * Fetches a token from the backend that issues them.
 *
 * Just after a restart or a deploy the backend starts cold, and the first request often meets
 * an error, a timeout or a refused connection. A few timed retries cover that window.
 *
 * The upstream backend does not answer a preflight, so asking with a json content type
 * makes the browser throw before the request leaves.
 * That case falls straight back to a plain request, which needs no preflight.
 * A timeout says nothing about preflights, so the next attempt keeps the same form.
 * A backend that refuses a plain request because it wants json gets the content type
 * back on the retry.
 * Nothing comes back on failure, which the caller reads as a server error.
 */
async function fetchSkyWayAuthToken(url: string, channelName: string, peerId: string): Promise<string> {
  const api = resolveApi(url, 'v1/skyway2023/token');
  const body = JSON.stringify({
    formatVersion: 1,
    channelName,
    peerId,
  });

  let simpleRequest = false;
  for (let attempt = 0; attempt < TOKEN_FETCH_ATTEMPTS; attempt++) {
    try {
      let response: Response;
      try {
        response = await postTokenRequest(api, body, simpleRequest);
      } catch (err) {
        if (simpleRequest || isAbortError(err)) throw err;
        simpleRequest = true;
        Logger.warn('[SkyWay] トークン取得に失敗。単純リクエストへフォールバックします', err);
        response = await postTokenRequest(api, body, simpleRequest);
      }

      if (response.status === 200) {
        const jsonObj = await response.json();
        return jsonObj.token ?? '';
      }

      if (simpleRequest && response.status === UNSUPPORTED_MEDIA_TYPE) {
        simpleRequest = false;
        Logger.warn('[SkyWay] 単純リクエストが拒否されたため Content-Type 付きに戻します');
        continue;
      }

      if (!isRetriableStatus(response.status)) return '';
      Logger.warn(
        `[SkyWay] トークン取得が一時失敗 (status=${response.status}) 試行 ${attempt + 1}/${TOKEN_FETCH_ATTEMPTS}`
      );
    } catch (err) {
      Logger.warn(`[SkyWay] トークン取得に失敗 試行 ${attempt + 1}/${TOKEN_FETCH_ATTEMPTS}`, err);
    }

    if (attempt < TOKEN_FETCH_ATTEMPTS - 1) {
      await delay(TOKEN_FETCH_BACKOFF_MS[attempt] ?? TOKEN_FETCH_BACKOFF_MS[TOKEN_FETCH_BACKOFF_MS.length - 1]);
    }
  }

  Logger.error('[SkyWay] トークン取得に繰り返し失敗しました');
  return '';
}
