import http from '@axe/core/network/server/contract/http.json';
import {
  fetchLoginProviders,
  LOGIN_ATTEMPT_STORAGE_KEY,
  LOGIN_STORAGE_KEY,
  LOGIN_VERIFIER_STORAGE_KEY,
  LoginEnvironment,
  readStoredLogin,
  ServerLogin,
  ServerLoginError,
  StoredLogin,
} from '@axe/core/network/server/server-login';
import { Account } from '@axe/core/network/server/server-protocol';
import { sha256Base64Url } from '@axe/core/util/crypto-util';

class MemoryStorage implements Storage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

/** A lock manager that runs one task at a time, as the browser's does for one name. */
function serialLocks(): LockManager {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: (_name: string, task: () => Promise<unknown>) => {
      const run = tail.then(() => task());
      tail = run.catch(() => undefined);
      return run;
    },
  } as unknown as LockManager;
}

const BASE_URL = 'https://rooms.example/';
const ACCOUNT: Account = { userId: 'acct_1234', name: 'Kai', avatarUrl: 'https://cdn.example/kai.png' };
const NOW = 1_800_000_000_000;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function tokens(serial: number) {
  return { accessToken: `access-${serial}`, expiresIn: 900, refreshToken: `refresh-${serial}`, account: ACCOUNT };
}

describe('ServerLogin', () => {
  let storage: MemoryStorage;
  let env: LoginEnvironment;
  let now: number;
  let requests: { url: string; method: string; body: unknown; authorization: string | null }[];
  let answer: (url: string, body: Record<string, unknown> | null) => Response | Promise<Response>;

  const login = () => new ServerLogin(BASE_URL, env);
  const store = (stored: StoredLogin) => storage.setItem(LOGIN_STORAGE_KEY, JSON.stringify(stored));
  const kept = (serial: number, expiresAt: number): StoredLogin => ({
    accessToken: `access-${serial}`,
    expiresAt,
    refreshToken: `refresh-${serial}`,
    account: ACCOUNT,
  });

  beforeEach(() => {
    storage = new MemoryStorage();
    now = NOW;
    env = { storage, session: new MemoryStorage(), locks: serialLocks(), now: () => now };
    requests = [];
    answer = () => json(500, { error: 'unexpected' });
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      const headers = new Headers(init?.headers);
      requests.push({ url, method: init?.method ?? 'GET', body, authorization: headers.get('Authorization') });
      return answer(url, body);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the login with a challenge made from a verifier it keeps in this tab', async () => {
    const url = new URL(await login().loginUrl('https://axe.example/assets/login-callback.html'));
    const verifier = env.session.getItem(LOGIN_VERIFIER_STORAGE_KEY)!;

    expect(url.origin + url.pathname).toBe('https://rooms.example/v1/login/discord');
    expect(url.searchParams.get('redirect_uri')).toBe('https://axe.example/assets/login-callback.html');
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('code_challenge')).toBe(await sha256Base64Url(verifier));
  });

  it('trades the code it came back with, and the verifier, for a login every tab shares', async () => {
    env.session.setItem(LOGIN_VERIFIER_STORAGE_KEY, 'v'.repeat(43));
    answer = () => json(200, tokens(1));
    const changes = vi.fn();
    const subject = login();
    subject.onChange(changes);

    const account = await subject.finishLogin('#login_code=the-code');

    expect(account).toEqual(ACCOUNT);
    expect(requests).toEqual([
      {
        url: 'https://rooms.example/v1/auth/token',
        method: 'POST',
        body: { grant_type: 'login_code', code: 'the-code', code_verifier: 'v'.repeat(43) },
        authorization: null,
      },
    ]);
    expect(readStoredLogin(storage)).toEqual(kept(1, NOW + 900_000));
    expect(env.session.getItem(LOGIN_VERIFIER_STORAGE_KEY)).toBeNull();
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('trades a code the way the server’s contract shows, and reads its answer', async () => {
    env.session.setItem(LOGIN_VERIFIER_STORAGE_KEY, 'v'.repeat(43));
    answer = () => json(200, http.tokenResponse);

    const account = await login().finishLogin('#login_code=the-code');

    expect(account).toEqual(http.tokenResponse.account);
    expect(Object.keys(requests[0].body as object).sort()).toEqual(Object.keys(http.tokenRequestLoginCode).sort());
  });

  it('gives the reason a login came back without a code, and asks nothing of the server', async () => {
    env.session.setItem(LOGIN_VERIFIER_STORAGE_KEY, 'v'.repeat(43));

    await expect(login().finishLogin('login_error=denied')).rejects.toEqual(new ServerLoginError('denied'));
    expect(requests).toEqual([]);
  });

  it('ends an attempt that came back without a code, so its verifier answers no later login', async () => {
    env.session.setItem(LOGIN_VERIFIER_STORAGE_KEY, 'v'.repeat(43));

    await expect(login().finishLogin('login_error=denied')).rejects.toBeInstanceOf(ServerLoginError);

    expect(login().isAwaitingCode).toBe(false);
  });

  it('takes a code handed back over the channel only for the attempt this tab opened', async () => {
    const subject = login();
    await subject.loginUrl('https://axe.example/assets/login-callback.html?attempt=mine');

    expect(subject.isOwnAttempt('mine')).toBe(true);
    expect(subject.isOwnAttempt('another-tab')).toBe(false);
    expect(subject.isOwnAttempt(undefined)).toBe(false);
  });

  it('gives up an abandoned attempt, but not one opened since', async () => {
    const subject = login();
    await subject.loginUrl('https://axe.example/assets/login-callback.html?attempt=first');
    await subject.loginUrl('https://axe.example/assets/login-callback.html?attempt=second');

    subject.abandonLogin('first');
    expect(env.session.getItem(LOGIN_ATTEMPT_STORAGE_KEY)).toBe('second');
    subject.abandonLogin('second');
    expect(subject.isAwaitingCode).toBe(false);
  });

  it('cannot finish a login this tab did not start', async () => {
    await expect(login().finishLogin('login_code=the-code')).rejects.toEqual(new ServerLoginError('no-verifier'));
  });

  it('hands out the kept access token while it has a while to run', async () => {
    store(kept(1, NOW + 120_000));

    expect(await login().accessToken()).toBe('access-1');
    expect(requests).toEqual([]);
  });

  it('refreshes an access token about to run out, keeping the new pair', async () => {
    store(kept(1, NOW + 30_000));
    answer = () => json(200, tokens(2));

    expect(await login().accessToken()).toBe('access-2');
    expect(requests.map((request) => request.body)).toEqual([
      { grant_type: 'refresh_token', refresh_token: 'refresh-1' },
    ]);
    expect(readStoredLogin(storage)).toEqual(kept(2, NOW + 900_000));
  });

  it('refreshes once when two tabs need a token at the same moment', async () => {
    store(kept(1, NOW - 1));
    let serial = 1;
    answer = () => json(200, tokens(++serial));

    const [first, second] = await Promise.all([login().accessToken(), login().accessToken()]);

    expect(requests).toHaveLength(1);
    expect(first).toBe('access-2');
    expect(second).toBe('access-2');
  });

  it('logs out when the server no longer takes the refresh token', async () => {
    store(kept(1, NOW - 1));
    answer = () => json(400, { error: 'invalid-grant' });

    expect(await login().accessToken()).toBeNull();
    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('keeps the login when the server cannot be reached to refresh it', async () => {
    store(kept(1, NOW - 1));
    answer = () => Promise.reject(new TypeError('Failed to fetch'));

    await expect(login().accessToken()).rejects.toThrow('Failed to fetch');
    expect(readStoredLogin(storage)).toEqual(kept(1, NOW - 1));
  });

  it('refreshes a token the server turned down, unless another tab has already', async () => {
    store(kept(1, NOW + 600_000));
    answer = () => json(200, tokens(2));

    expect(await login().replaceRejected('access-1')).toBe('access-2');
    expect(await login().replaceRejected('access-1')).toBe('access-2');
    expect(requests).toHaveLength(1);
  });

  it('waits for a refresh under way before logging out, so the refresh cannot bring the login back', async () => {
    store(kept(1, NOW - 1));
    let release!: () => void;
    answer = () => new Promise<Response>((resolve) => (release = () => resolve(json(200, tokens(2)))));

    const refreshing = login().accessToken();
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    const loggingOut = login().logout();
    release();
    await refreshing;
    answer = () => new Response(null, { status: 204 });
    await loggingOut;

    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
    expect(requests.at(-1)?.body).toEqual({ refresh_token: 'refresh-2' });
  });

  it('logs out here at once and asks the server to revoke the refresh token', async () => {
    store(kept(1, NOW + 600_000));
    answer = () => new Response(null, { status: 204 });

    await login().logout();

    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
    expect(requests).toEqual([
      {
        url: 'https://rooms.example/v1/auth/logout',
        method: 'POST',
        body: { refresh_token: 'refresh-1' },
        authorization: null,
      },
    ]);
  });

  it('deletes the account with its access token and logs out', async () => {
    store(kept(1, NOW + 600_000));
    answer = () => new Response(null, { status: 204 });

    await login().deleteAccount();

    expect(requests.map(({ url, method, authorization }) => ({ url, method, authorization }))).toEqual([
      { url: 'https://rooms.example/v1/account', method: 'DELETE', authorization: 'Bearer access-1' },
    ]);
    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('keeps the login and fails when the server turns the token away, the account still being there', async () => {
    store(kept(1, NOW + 600_000));
    answer = () => json(401, { error: 'login-required' });

    await expect(login().deleteAccount()).rejects.toMatchObject({ status: 401 });

    expect(storage.getItem(LOGIN_STORAGE_KEY)).not.toBeNull();
  });

  it('deletes the account with a fresh token when the server turns down one that still looked good', async () => {
    store(kept(1, NOW + 600_000));
    const answers = [
      json(401, { error: 'login-required' }),
      json(200, http.tokenResponse),
      new Response(null, { status: 204 }),
    ];
    answer = () => answers.shift()!;

    await login().deleteAccount();

    expect(requests.map(({ url, authorization }) => [url, authorization])).toEqual([
      ['https://rooms.example/v1/account', 'Bearer access-1'],
      ['https://rooms.example/v1/auth/token', null],
      ['https://rooms.example/v1/account', `Bearer ${http.tokenResponse.accessToken}`],
    ]);
    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('fails without a word to the server when it holds no login to tell it by', async () => {
    await expect(login().deleteAccount()).rejects.toMatchObject({ status: 401 });

    expect(requests).toEqual([]);
  });

  it('takes an account deleted already, from another device, as deleted', async () => {
    store(kept(1, NOW + 600_000));
    answer = () => json(404, { error: 'not-found' });

    await login().deleteAccount();

    expect(storage.getItem(LOGIN_STORAGE_KEY)).toBeNull();
  });

  it('reads no login from a missing, broken or incomplete value', () => {
    expect(readStoredLogin(storage)).toBeNull();
    storage.setItem(LOGIN_STORAGE_KEY, '{not json');
    expect(readStoredLogin(storage)).toBeNull();
    storage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ ...kept(1, NOW), refreshToken: 3 }));
    expect(readStoredLogin(storage)).toBeNull();
    storage.setItem(LOGIN_STORAGE_KEY, JSON.stringify({ ...kept(1, NOW), account: { name: 'Kai' } }));
    expect(readStoredLogin(storage)).toBeNull();
  });

  it('reads the providers the way the server’s contract shows them', async () => {
    answer = () => json(200, http.authConfig);
    expect(await fetchLoginProviders(BASE_URL)).toEqual(http.authConfig.providers);
  });

  it('asks the backend which providers it logs in with', async () => {
    answer = () => json(200, { providers: ['discord'] });
    expect(await fetchLoginProviders(BASE_URL)).toEqual(['discord']);

    answer = () => json(200, { providers: [] });
    expect(await fetchLoginProviders(BASE_URL)).toEqual([]);
    expect(requests[0].url).toBe('https://rooms.example/v1/auth/config');
  });
});
