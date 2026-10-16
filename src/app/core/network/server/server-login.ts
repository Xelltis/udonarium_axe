import { Account, TokenRequest, TokenResponse } from '@axe/core/network/server/server-protocol';
import { apiUrl, refusal, ServerRoomApiError } from '@axe/core/network/server/server-room-api';
import { sha256Base64Url } from '@axe/core/util/crypto-util';

/** Where the login is kept, shared by every tab of the page. */
export const LOGIN_STORAGE_KEY = 'udonarium-axe.server-login';
/** Where the PKCE verifier waits while the login page is open, in the tab that opened it. */
export const LOGIN_VERIFIER_STORAGE_KEY = 'udonarium-axe.server-login-verifier';
/** The id of the login this tab opened, which the landing page hands back with the code. */
export const LOGIN_ATTEMPT_STORAGE_KEY = 'udonarium-axe.server-login-attempt';
/** The channel the login's landing page hands its fragment back on. */
export const LOGIN_CHANNEL = 'udonarium-axe.server-login';
/** The lock every tab takes to refresh, so that no two trade in the same refresh token. */
const REFRESH_LOCK = 'udonarium-axe.server-login-refresh';
/** How long before it runs out an access token is taken as run out already. */
const EXPIRY_MARGIN_MS = 60_000;
const VERIFIER_BYTES = 32;

/** A login as it is kept: the token pair, when the access token runs out, and whose it is. */
export interface StoredLogin {
  accessToken: string;
  /** Unix milliseconds. */
  expiresAt: number;
  refreshToken: string;
  account: Account;
}

/** A login that did not come back with a code: the reason from its fragment, or a missing verifier. */
export class ServerLoginError extends Error {
  constructor(readonly code: string) {
    super(`login failed: ${code}`);
    this.name = 'ServerLoginError';
  }
}

/** What the login needs from the page, replaced in tests. */
export interface LoginEnvironment {
  storage: Storage;
  session: Storage;
  locks?: LockManager;
  now: () => number;
}

function browserEnvironment(): LoginEnvironment {
  return {
    storage: localStorage,
    session: sessionStorage,
    locks: typeof navigator !== 'undefined' ? navigator.locks : undefined,
    now: () => Date.now(),
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readAccount(value: unknown): Account | null {
  if (!isRecord(value) || typeof value['userId'] !== 'string' || typeof value['name'] !== 'string') return null;
  const avatarUrl = typeof value['avatarUrl'] === 'string' ? value['avatarUrl'] : null;
  return { userId: value['userId'], name: value['name'], avatarUrl };
}

/** A login read back from storage, or null when there is none or it cannot be read. */
export function readStoredLogin(storage: Storage): StoredLogin | null {
  let value: unknown;
  try {
    value = JSON.parse(storage.getItem(LOGIN_STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const account = readAccount(value['account']);
  const { accessToken, expiresAt, refreshToken } = value;
  if (
    !account ||
    typeof accessToken !== 'string' ||
    typeof refreshToken !== 'string' ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt)
  ) {
    return null;
  }
  return { accessToken, expiresAt, refreshToken, account };
}

function readTokenResponse(value: unknown): TokenResponse | null {
  if (!isRecord(value)) return null;
  const account = readAccount(value['account']);
  const { accessToken, expiresIn, refreshToken } = value;
  if (!account || typeof accessToken !== 'string' || typeof refreshToken !== 'string') return null;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn)) return null;
  return { accessToken, expiresIn, refreshToken, account };
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(VERIFIER_BYTES));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** The providers a backend offers to log in with; none means it has neither login nor rooms. */
export async function fetchLoginProviders(baseUrl: string): Promise<string[]> {
  const response = await fetch(apiUrl(baseUrl, '/v1/auth/config'));
  if (!response.ok) return refusal(response);
  const body = (await response.json().catch(() => null)) as { providers?: unknown } | null;
  const providers = body?.providers;
  if (!Array.isArray(providers)) throw new ServerRoomApiError(response.status, 'bad-response');
  return providers.filter((provider): provider is string => typeof provider === 'string');
}

/**
 * The login with a backend's Worker: Discord through PKCE, then an access token that lasts a
 * quarter of an hour and a refresh token that trades in for the next pair.
 *
 * The pair is kept in localStorage, so every tab of the page shares one login. A refresh token
 * works once, and the server takes a second use as theft and revokes the whole line, so tabs
 * refresh one at a time under a lock and read the pair again inside it.
 */
export class ServerLogin {
  private readonly listeners = new Set<() => void>();

  constructor(
    readonly baseUrl: string,
    private readonly env: LoginEnvironment = browserEnvironment()
  ) {}

  /** The kept login, read afresh, since another tab may have changed it. */
  get current(): StoredLogin | null {
    return readStoredLogin(this.env.storage);
  }

  /** Whoever is logged in, or null. */
  get account(): Account | null {
    return this.current?.account ?? null;
  }

  /** Whether this tab opened a login page whose code has not come back yet. */
  get isAwaitingCode(): boolean {
    return this.env.session.getItem(LOGIN_VERIFIER_STORAGE_KEY) !== null;
  }

  /**
   * Whether a code handed back over the channel is for the login this tab opened. Every tab of the
   * page hears the landing page, and a code works once, so only the tab that opened that login may
   * trade it in.
   */
  isOwnAttempt(attempt: unknown): boolean {
    const own = this.env.session.getItem(LOGIN_ATTEMPT_STORAGE_KEY);
    return own !== null && attempt === own && this.isAwaitingCode;
  }

  /** Calls the listener whenever this tab changes the login; returns how to stop. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * The page to open to log in, returning to the redirect. The verifier it was made from waits in
   * this tab until the code comes back.
   */
  async loginUrl(redirectUri: string): Promise<string> {
    const verifier = randomVerifier();
    this.env.session.setItem(LOGIN_VERIFIER_STORAGE_KEY, verifier);
    const attempt = new URL(redirectUri).searchParams.get('attempt');
    if (attempt) this.env.session.setItem(LOGIN_ATTEMPT_STORAGE_KEY, attempt);
    else this.env.session.removeItem(LOGIN_ATTEMPT_STORAGE_KEY);
    const challenge = await sha256Base64Url(verifier);
    const query = new URLSearchParams({ redirect_uri: redirectUri, code_challenge: challenge });
    return `${apiUrl(this.baseUrl, '/v1/login/discord')}?${query.toString()}`;
  }

  /**
   * Finishes a login from the fragment the login page came back with, trading its code and this
   * tab's verifier for a token pair. Throws the reason when the fragment carries an error instead.
   */
  async finishLogin(fragment: string): Promise<Account> {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    const verifier = this.env.session.getItem(LOGIN_VERIFIER_STORAGE_KEY);
    // The attempt ends here however it goes, so that a stale verifier never answers a later login.
    this.env.session.removeItem(LOGIN_VERIFIER_STORAGE_KEY);
    this.env.session.removeItem(LOGIN_ATTEMPT_STORAGE_KEY);
    const error = params.get('login_error');
    if (error) throw new ServerLoginError(error);
    const code = params.get('login_code');
    if (!code) throw new ServerLoginError('no-code');
    if (!verifier) throw new ServerLoginError('no-verifier');
    const tokens = await this.requestTokens({ grant_type: 'login_code', code, code_verifier: verifier });
    this.store(tokens);
    return tokens.account;
  }

  /**
   * Gives up a login whose page was closed without coming back, so its verifier answers nothing
   * later; a login opened since is left alone.
   */
  abandonLogin(attempt: string): void {
    if (this.env.session.getItem(LOGIN_ATTEMPT_STORAGE_KEY) !== attempt) return;
    this.env.session.removeItem(LOGIN_VERIFIER_STORAGE_KEY);
    this.env.session.removeItem(LOGIN_ATTEMPT_STORAGE_KEY);
  }

  /**
   * An access token that has a while left to run, refreshed when it does not. Null when nobody is
   * logged in, or the server no longer takes the refresh token, which logs out. A failure to
   * reach the server is thrown, since the login still stands.
   */
  async accessToken(): Promise<string | null> {
    const login = this.current;
    if (!login) return null;
    if (this.isFresh(login)) return login.accessToken;
    return this.underLock(async () => {
      const latest = this.current;
      if (!latest) return null;
      if (this.isFresh(latest)) return latest.accessToken;
      return this.refresh(latest);
    });
  }

  /**
   * A new access token after the server turned one down, unless another tab has refreshed since,
   * in which case that tab's token is the answer.
   */
  async replaceRejected(rejected: string): Promise<string | null> {
    return this.underLock(async () => {
      const latest = this.current;
      if (!latest) return null;
      if (latest.accessToken !== rejected && this.isFresh(latest)) return latest.accessToken;
      return this.refresh(latest);
    });
  }

  /**
   * Logs out here and tells the server to revoke the refresh token's line. It waits for any refresh
   * under way in another tab, which would otherwise put the login back once it finished.
   */
  async logout(): Promise<void> {
    const login = await this.underLock(async () => {
      const current = this.current;
      this.clear();
      return current;
    });
    if (!login) return;
    await fetch(apiUrl(this.baseUrl, '/v1/auth/logout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: login.refreshToken }),
    }).catch(() => undefined);
  }

  /**
   * Deletes the account on the server, its name, avatar and tokens, and logs out here. Rejects,
   * keeping the login, when the server could not be told: with no token to tell it by, or one it
   * turns away even once refreshed. An account deleted already, from another device, counts as
   * deleted.
   */
  async deleteAccount(): Promise<void> {
    const token = await this.accessToken();
    if (!token) throw new ServerRoomApiError(401, 'login-required');
    let response = await this.deleteAccountWith(token);
    if (response.status === 401) {
      const fresh = await this.replaceRejected(token);
      if (fresh && fresh !== token) response = await this.deleteAccountWith(fresh);
    }
    if (!response.ok && response.status !== 404) return refusal(response);
    this.clear();
  }

  private deleteAccountWith(token: string): Promise<Response> {
    return fetch(apiUrl(this.baseUrl, '/v1/account'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private isFresh(login: StoredLogin): boolean {
    return login.expiresAt - EXPIRY_MARGIN_MS > this.env.now();
  }

  private async refresh(login: StoredLogin): Promise<string | null> {
    try {
      const tokens = await this.requestTokens({ grant_type: 'refresh_token', refresh_token: login.refreshToken });
      this.store(tokens);
      return tokens.accessToken;
    } catch (reason) {
      if (reason instanceof ServerRoomApiError && reason.code === 'invalid-grant') {
        this.clear();
        return null;
      }
      throw reason;
    }
  }

  private async requestTokens(request: TokenRequest): Promise<TokenResponse> {
    const response = await fetch(apiUrl(this.baseUrl, '/v1/auth/token'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok) return refusal(response);
    const tokens = readTokenResponse(await response.json().catch(() => null));
    if (!tokens) throw new ServerRoomApiError(response.status, 'bad-response');
    return tokens;
  }

  private underLock<T>(task: () => Promise<T>): Promise<T> {
    const locks = this.env.locks;
    return locks ? locks.request(REFRESH_LOCK, task) : task();
  }

  private store(tokens: TokenResponse): void {
    const login: StoredLogin = {
      accessToken: tokens.accessToken,
      expiresAt: this.env.now() + tokens.expiresIn * 1000,
      refreshToken: tokens.refreshToken,
      account: tokens.account,
    };
    this.env.storage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(login));
    this.changed();
  }

  private clear(): void {
    this.env.storage.removeItem(LOGIN_STORAGE_KEY);
    this.changed();
  }

  private changed(): void {
    for (const listener of [...this.listeners]) listener();
  }
}
