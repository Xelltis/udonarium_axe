import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { LOGIN_CHANNEL, LOGIN_STORAGE_KEY, ServerLogin } from '@axe/core/network/server/server-login';
import { Account } from '@axe/core/network/server/server-protocol';

/** Who a hello says is connecting, when somebody is logged in. */
export interface ServerCredentials {
  userId: string;
  accessToken: string;
}

/** The landing page the login popup comes back to, next to the app. */
export const LOGIN_CALLBACK_PATH = 'assets/login-callback.html';

const POPUP_FEATURES = 'popup,width=520,height=760';
/** How often an open login popup is checked for having been closed without logging in. */
const POPUP_WATCH_MS = 1000;

/** Whether a fragment is one the login came back with rather than an invite or nothing. */
function isLoginFragment(hash: string): boolean {
  return /^#?(login_code|login_error)=/.test(hash);
}

/**
 * The login with the room server's Worker, for this page.
 *
 * It opens Discord's login in a popup, so the table stays as it is, and takes the code back from
 * the landing page over a BroadcastChannel; where a popup cannot open, the page itself goes and
 * comes back, and the code is taken from its fragment when it starts again. The account follows
 * logins and logouts in other tabs, which share it.
 */
@Injectable({ providedIn: 'root' })
export class ServerAuthService {
  private readonly destroyRef = inject(DestroyRef);
  private login: ServerLogin | null = null;
  private channel: BroadcastChannel | null = null;
  private readonly _account = signal<Account | null>(null);
  private readonly _pending = signal(false);
  private readonly _error = signal<string | null>(null);

  /** Whoever is logged in, or null. */
  readonly account = this._account.asReadonly();
  readonly isLoggedIn = computed(() => this._account() !== null);
  /** Whether a login page is open and its answer not yet back. */
  readonly isLoggingIn = this._pending.asReadonly();
  /** Why the last login failed, as a code; null after one that worked. */
  readonly error = this._error.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.channel?.close());
  }

  /** Whether a backend to log in with is configured. */
  get isConfigured(): boolean {
    return this.login !== null;
  }

  /**
   * Points the login at a backend and picks up where the page left it: the account kept from
   * before, and the code of a login the page itself went to.
   */
  configure(baseUrl: string, login: ServerLogin = new ServerLogin(baseUrl)): void {
    this.login = login;
    this._account.set(login.account);
    const stop = login.onChange(() => this._account.set(login.account));
    this.destroyRef.onDestroy(stop);
    this.listenToOtherTabs();
    if (isLoginFragment(location.hash)) {
      const fragment = location.hash;
      history.replaceState(null, '', location.pathname + location.search);
      void this.finish(fragment);
    }
  }

  /**
   * Opens the login. The popup is opened at once, while the click still counts, and pointed at the
   * login once its challenge is made; without one the page goes to the login itself.
   */
  async startLogin(): Promise<void> {
    const login = this.login;
    if (!login) return;
    this._error.set(null);
    const popup = window.open('', 'udonarium-axe-login', POPUP_FEATURES);
    if (popup) {
      this._pending.set(true);
      popup.location.href = await login.loginUrl(new URL(LOGIN_CALLBACK_PATH, document.baseURI).href);
      this.watchPopup(popup);
      return;
    }
    location.href = await login.loginUrl(location.origin + location.pathname);
  }

  /** Logs out in every tab. */
  async logout(): Promise<void> {
    await this.login?.logout();
  }

  /** Deletes the account on the server and logs out. */
  async deleteAccount(): Promise<void> {
    await this.login?.deleteAccount();
  }

  /**
   * The credentials for a hello: the account's user id and an access token with a while to run.
   * Null when nobody is logged in; a server that cannot be reached to refresh the token throws.
   */
  async credentials(): Promise<ServerCredentials | null> {
    const login = this.login;
    if (!login?.account) return null;
    const accessToken = await login.accessToken();
    const account = login.account;
    return accessToken && account ? { userId: account.userId, accessToken } : null;
  }

  /** An access token for a request, or null when nobody is logged in. */
  async accessToken(): Promise<string | null> {
    return (await this.login?.accessToken()) ?? null;
  }

  /** A new access token after the server turned one down; null when the login is gone. */
  async replaceRejected(rejected: string): Promise<string | null> {
    return (await this.login?.replaceRejected(rejected)) ?? null;
  }

  private listenToOtherTabs(): void {
    if (this.channel) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGIN_STORAGE_KEY || event.key === null) this._account.set(this.login?.account ?? null);
    };
    window.addEventListener('storage', onStorage);
    this.destroyRef.onDestroy(() => window.removeEventListener('storage', onStorage));
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(LOGIN_CHANNEL);
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; fragment?: unknown } | null;
      if (data?.type !== 'login-callback' || typeof data.fragment !== 'string') return;
      if (this.login?.isAwaitingCode) void this.finish(data.fragment);
    };
  }

  /** Stops waiting once the popup is closed; the code, when it came, is taken all the same. */
  private watchPopup(popup: Window): void {
    const watch = setInterval(() => {
      if (!popup.closed && this._pending()) return;
      clearInterval(watch);
      this._pending.set(false);
    }, POPUP_WATCH_MS);
    this.destroyRef.onDestroy(() => clearInterval(watch));
  }

  private async finish(fragment: string): Promise<void> {
    const login = this.login;
    if (!login) return;
    this._pending.set(false);
    try {
      await login.finishLogin(fragment);
      this._error.set(null);
      window.focus();
    } catch (reason) {
      const code = (reason as { code?: unknown } | null)?.code;
      this._error.set(typeof code === 'string' ? code : 'network');
    }
  }
}
