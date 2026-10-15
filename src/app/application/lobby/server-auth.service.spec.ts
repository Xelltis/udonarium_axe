import { TestBed } from '@angular/core/testing';
import { LOGIN_CALLBACK_PATH, ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { LOGIN_CHANNEL, LOGIN_STORAGE_KEY, ServerLogin } from '@axe/core/network/server/server-login';
import { Account } from '@axe/core/network/server/server-protocol';

const ACCOUNT: Account = { userId: 'acct_1234', name: 'Kai', avatarUrl: null };

/** A login whose answers the test sets, standing in for the one that talks to the Worker. */
class FakeLogin {
  account: Account | null = null;
  isAwaitingCode = false;
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
  });

  afterEach(() => {
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
    expect(login.loginUrl).toHaveBeenCalledWith(new URL(LOGIN_CALLBACK_PATH, document.baseURI).href);
    expect(popup.location.href).toContain('https://rooms.example/v1/login/discord');
  });

  it('takes the code the landing page hands back, only in the tab that opened the login', async () => {
    configure();
    const landing = new BroadcastChannel(LOGIN_CHANNEL);

    landing.postMessage({ type: 'login-callback', fragment: 'login_code=elsewhere' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(login.finishLogin).not.toHaveBeenCalled();

    login.isAwaitingCode = true;
    landing.postMessage({ type: 'login-callback', fragment: 'login_code=mine' });
    await vi.waitFor(() => expect(login.finishLogin).toHaveBeenCalledWith('login_code=mine'));
    landing.close();
  });

  it('follows a login or logout in another tab', () => {
    configure();
    login.account = ACCOUNT;

    window.dispatchEvent(new StorageEvent('storage', { key: LOGIN_STORAGE_KEY }));

    expect(service.account()).toEqual(ACCOUNT);
  });
});
