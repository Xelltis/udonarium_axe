import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { ServerCredentials, ServerCredentialSource } from '@axe/core/network/connection';
import { Network } from '@axe/core/network/network';
import {
  fetchLoginProviders,
  LOGIN_CHANNEL,
  LOGIN_STORAGE_KEY,
  ServerLogin,
} from '@axe/core/network/server/server-login';
import { Account } from '@axe/core/network/server/server-protocol';

/** The landing page the login popup comes back to, next to the app. */
export const LOGIN_CALLBACK_PATH = 'assets/login-callback.html';

const POPUP_FEATURES = 'popup,width=520,height=760';
/** How often an open login popup is checked for having been closed without logging in. */
const POPUP_WATCH_MS = 1000;
/** Where an invitation waiting for a login is kept while the page itself goes to log in. */
export const PENDING_INVITE_STORAGE_KEY = 'udonarium-axe.pending-invite';

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
export class ServerAuthService implements ServerCredentialSource {
  private readonly destroyRef = inject(DestroyRef);
  private login: ServerLogin | null = null;
  private channel: BroadcastChannel | null = null;
  private readonly _account = signal<Account | null>(null);
  private readonly _pending = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _providers = signal<string[] | null>(null);
  /** Every account logged in while the page has been open, which a guest may never go by. */
  private readonly accountUserIds = new Set<string>();

  /** Whoever is logged in, or null. */
  readonly account = this._account.asReadonly();
  readonly isLoggedIn = computed(() => this._account() !== null);
  /** Whether a login page is open and its answer not yet back. */
  readonly isLoggingIn = this._pending.asReadonly();
  /** Why the last login failed, as a code; null after one that worked. */
  readonly error = this._error.asReadonly();
  /**
   * Whether the backend offers a login, without which it keeps neither logins nor rooms; null until
   * it has answered.
   */
  readonly offersLogin = computed(() => {
    const providers = this._providers();
    return providers === null ? null : providers.length > 0;
  });

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
    this.takeAccount(login.account);
    this.takeBackPendingInvite();
    void this.refreshProviders();
    const stop = login.onChange(() => this.takeAccount(login.account));
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
      const attempt = crypto.randomUUID();
      const landing = new URL(LOGIN_CALLBACK_PATH, document.baseURI);
      landing.searchParams.set('attempt', attempt);
      popup.location.href = await login.loginUrl(landing.href);
      this.watchPopup(popup, attempt);
      return;
    }
    const url = await login.loginUrl(location.origin + location.pathname);
    this.keepPendingInvite();
    location.href = url;
  }

  /** Asks the backend again whether it offers a login; an unreachable one leaves the answer as it was. */
  async refreshProviders(): Promise<void> {
    const login = this.login;
    if (!login) return;
    try {
      this._providers.set(await fetchLoginProviders(login.baseUrl));
    } catch {
      // unknown until the backend answers
    }
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

  /** Whether a user id is that of an account logged in while the page has been open, logged out or not. */
  isAccountUserId(userId: string): boolean {
    return this.accountUserIds.has(userId);
  }

  private takeAccount(account: Account | null): void {
    if (account) this.accountUserIds.add(account.userId);
    this._account.set(account);
  }

  /**
   * Keeps the invitation a guest was let in with, which waits for a login to take effect, while the
   * page itself goes to log in and starts afresh on coming back.
   */
  private keepPendingInvite(): void {
    const pending = Network.pendingServerInvite;
    if (!pending) return;
    try {
      sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, JSON.stringify(pending));
    } catch {
      // without storage the invitation goes with the page, and the seat comes back in its own role
    }
  }

  /** Takes back an invitation kept while the page went to log in, for the room the page goes back into. */
  private takeBackPendingInvite(): void {
    let kept: unknown;
    try {
      kept = JSON.parse(sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY) ?? 'null');
      sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    } catch {
      return;
    }
    const pending = kept as { invite?: unknown; roomKey?: unknown } | null;
    if (typeof pending?.invite === 'string' && typeof pending.roomKey === 'string') {
      Network.setServerInvite(pending.invite, pending.roomKey);
    }
  }

  /**
   * Follows a login or logout in another tab as it is stored, and once more as this page comes back
   * from the back-forward cache, where no word of a change made meanwhile reached it.
   */
  private listenToOtherTabs(): void {
    if (this.channel) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key === LOGIN_STORAGE_KEY || event.key === null) this.takeAccount(this.login?.account ?? null);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) this.takeAccount(this.login?.account ?? null);
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
    });
    if (typeof BroadcastChannel === 'undefined') return;
    this.channel = new BroadcastChannel(LOGIN_CHANNEL);
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; fragment?: unknown; attempt?: unknown } | null;
      if (data?.type !== 'login-callback' || typeof data.fragment !== 'string') return;
      if (this.login?.isOwnAttempt(data.attempt)) void this.finish(data.fragment);
    };
  }

  /**
   * Stops waiting once the popup is closed. A code it handed back as it closed is taken in the
   * moment that follows; past that, the attempt is given up so its verifier answers no later login.
   */
  private watchPopup(popup: Window, attempt: string): void {
    const watch = setInterval(() => {
      if (!popup.closed && this._pending()) return;
      clearInterval(watch);
      if (!this._pending()) return;
      this._pending.set(false);
      setTimeout(() => this.login?.abandonLogin(attempt), POPUP_WATCH_MS);
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
