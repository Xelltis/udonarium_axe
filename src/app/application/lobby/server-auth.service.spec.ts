import { TestBed } from '@angular/core/testing';
import { LOGIN_CALLBACK_PATH, ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { Network } from '@axe/core/network/network';
import { LOGIN_CHANNEL, LOGIN_STORAGE_KEY, ServerLogin } from '@axe/core/network/server/server-login';
import { Account } from '@axe/core/network/server/server-protocol';

const ACCOUNT: Account = { userId: 'acct_1234', name: 'Kai', avatarUrl: null };

/** A login whose answers the test sets, standing in for the one that talks to the Worker. */
class FakeLogin {
  readonly baseUrl = 'https://rooms.example';
  account: Account | null = null;
  isAwaitingCode = false;
  attempt: string | null = null;
  readonly abandonLogin = vi.fn();
  isOwnAttempt(attempt: unknown): boolean {
    return this.isAwaitingCode && attempt === this.attempt;
  }
  token: string | null = 'access-1';
  private listener: (() => void) | null = null;
  readonly finishLogin = vi.fn(async (_fragment: string) => {
    this.account = ACCOUNT;
    this.listener?.();
    return ACCOUNT;
  });
  readonly loginUrl = vi.fn(async (redirect: string) => `https://rooms.example/v1/login/discord?r=${redirect}`);
  onChange(listener: () => void): () => void {
    this.listener = listener;
    return () => (this.listener = null);
  }
  async accessToken(): Promise<string | null> {
    return this.token;
  }
}

describe('ServerAuthService', () => {
  let service: ServerAuthService;
  let login: FakeLogin;

  const configure = () => service.configure('https://rooms.example', login as unknown as ServerLogin);

  beforeEach(() => {
    login = new FakeLogin();
    service = TestBed.inject(ServerAuthService);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ providers: ['discord'] }), { status: 200 })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    history.replaceState(null, '', location.pathname);
    vi.restoreAllMocks();
  });

  it('picks up the account kept from before, and gives it with a token for a hello', async () => {
    login.account = ACCOUNT;
    configure();

    expect(service.account()).toEqual(ACCOUNT);
    expect(await service.credentials()).toEqual({ userId: 'acct_1234', accessToken: 'access-1' });
  });

  it('gives no credentials while nobody is logged in', async () => {
    configure();

    expect(service.isLoggedIn()).toBe(false);
    expect(await service.credentials()).toBeNull();
  });

  it('finishes a login the page itself went to, and takes its code out of the address', async () => {
    history.replaceState(null, '', `${location.pathname}#login_code=the-code`);
    configure();

    await vi.waitFor(() => expect(service.account()).toEqual(ACCOUNT));
    expect(login.finishLogin).toHaveBeenCalledWith('#login_code=the-code');
    expect(location.hash).toBe('');
  });

  it('leaves an invite in the address alone', () => {
    history.replaceState(null, '', `${location.pathname}#join?r=Ab3`);
    configure();

    expect(login.finishLogin).not.toHaveBeenCalled();
    expect(location.hash).toBe('#join?r=Ab3');
  });

  it('says why a login failed', async () => {
    login.finishLogin.mockRejectedValueOnce({ code: 'denied' });
    history.replaceState(null, '', `${location.pathname}#login_error=denied`);
    configure();

    await vi.waitFor(() => expect(service.error()).toBe('denied'));
    expect(service.isLoggedIn()).toBe(false);
  });

  it('opens the login in a popup that comes back to the landing page', async () => {
    const popup = { location: { href: '' }, closed: false };
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    configure();

    await service.startLogin();

    expect(service.isLoggingIn()).toBe(true);
    const landing = new URL(login.loginUrl.mock.calls[0][0]);
    expect(landing.origin + landing.pathname).toBe(new URL(LOGIN_CALLBACK_PATH, document.baseURI).href);
    expect(landing.searchParams.get('attempt')).toMatch(/^[0-9a-f-]{36}$/);
    expect(popup.location.href).toContain('https://rooms.example/v1/login/discord');
  });

  it('keeps a guest’s invitation while the page itself goes to log in, and takes it back on return', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const page = { origin: 'https://axe.example', pathname: '/', hash: '', href: 'https://axe.example/' };
    vi.stubGlobal('location', page);
    configure();
    Network.setServerInvite('signed-gm', 'room-key');

    await service.startLogin();
    Network.setServerInvite('', '');

    expect(page.href).toContain('https://rooms.example/v1/login/discord');
    vi.unstubAllGlobals();
    configure();
    expect(Network.pendingServerInvite).toEqual({ invite: 'signed-gm', roomKey: 'room-key' });
    Network.setServerInvite('', '');
    configure();
    expect(Network.pendingServerInvite).toBeNull();
  });

  it('takes the code the landing page hands back, only in the tab that opened the login', async () => {
    configure();
    const landing = new BroadcastChannel(LOGIN_CHANNEL);

    login.isAwaitingCode = true;
    login.attempt = 'mine';
    landing.postMessage({ type: 'login-callback', fragment: 'login_code=elsewhere', attempt: 'another-tab' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(login.finishLogin).not.toHaveBeenCalled();

    landing.postMessage({ type: 'login-callback', fragment: 'login_code=mine', attempt: 'mine' });
    await vi.waitFor(() => expect(login.finishLogin).toHaveBeenCalledWith('login_code=mine'));
    landing.close();
  });

  it('learns whether the backend offers a login, which rooms on it need', async () => {
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockResolvedValue(new Response(JSON.stringify({ providers: [] }), { status: 200 }));
    expect(service.offersLogin()).toBeNull();

    configure();

    await vi.waitFor(() => expect(service.offersLogin()).toBe(false));
    expect(String(fetch.mock.calls[0][0])).toBe('https://rooms.example/v1/auth/config');
  });

  it('follows a login or logout in another tab', () => {
    configure();
    login.account = ACCOUNT;

    window.dispatchEvent(new StorageEvent('storage', { key: LOGIN_STORAGE_KEY }));

    expect(service.account()).toEqual(ACCOUNT);
  });

  it('reads the login again as the page comes back from the back-forward cache', () => {
    configure();
    login.account = ACCOUNT;

    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(service.account()).toBeNull();
    window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(service.account()).toEqual(ACCOUNT);
  });

  it('knows an account logged in here as one after it has logged out, whatever its user id looks like', () => {
    const unprefixed: Account = { ...ACCOUNT, userId: 'e0100553-8866-4924-8a4a-d4900ac59de5' };
    login.account = unprefixed;
    configure();
    login.account = null;
    window.dispatchEvent(new StorageEvent('storage', { key: LOGIN_STORAGE_KEY }));

    expect(service.account()).toBeNull();
    expect(service.isAccountUserId(unprefixed.userId)).toBe(true);
    expect(service.isAccountUserId('tab-own')).toBe(false);
  });
});
