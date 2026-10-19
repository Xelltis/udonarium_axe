import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { Account } from '@axe/core/network/server/server-protocol';
import { ServerAccountComponent } from '@axe/features/lobby/server-account/server-account.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ServerAccountComponent', () => {
  const account = signal<Account | null>(null);
  const providers = signal<boolean | null>(true);
  const error = signal<string | null>(null);
  const auth = {
    account,
    isLoggingIn: signal(false),
    offersLogin: computed(() => providers()),
    error,
    startLogin: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    deleteAccount: vi.fn(async () => undefined),
  };

  const render = () => {
    const fixture = TestBed.createComponent(ServerAccountComponent);
    fixture.detectChanges();
    return fixture;
  };
  const find = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    account.set(null);
    providers.set(true);
    error.set(null);
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [ServerAccountComponent],
      providers: [...TEST_PROVIDERS, { provide: ServerAuthService, useValue: auth }],
    });
  });

  it('offers a login to somebody who has not logged in', () => {
    const element = render().nativeElement as HTMLElement;

    find(element, 'server-account-login')!.click();

    expect(auth.startLogin).toHaveBeenCalled();
    expect(find(element, 'server-account-name')).toBeNull();
  });

  it('shows who is logged in, and logs out', () => {
    account.set({ userId: 'acct_1', name: 'Kai', avatarUrl: null });
    const element = render().nativeElement as HTMLElement;

    expect(find(element, 'server-account-name')!.textContent).toContain('Kai');
    find(element, 'server-account-logout')!.click();
    expect(auth.logout).toHaveBeenCalled();
  });

  it('asks again before deleting the account', () => {
    account.set({ userId: 'acct_1', name: 'Kai', avatarUrl: null });
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;

    find(element, 'server-account-delete')!.click();
    fixture.detectChanges();
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    find(element, 'server-account-delete-confirm')!.click();

    expect(auth.deleteAccount).toHaveBeenCalled();
  });

  it('still says the account was not deleted once the attempt has logged it out, until a login comes back', async () => {
    account.set({ userId: 'acct_1', name: 'Kai', avatarUrl: null });
    auth.deleteAccount.mockImplementationOnce(async () => {
      account.set(null);
      throw new Error('login-required');
    });
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;
    find(element, 'server-account-delete')!.click();
    fixture.detectChanges();

    find(element, 'server-account-delete-confirm')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(find(element, 'server-account-delete-failed')!.textContent).toContain('ログインし直して');
    find(element, 'server-account-login')!.click();
    fixture.detectChanges();
    expect(find(element, 'server-account-delete-failed')).not.toBeNull();

    // logged in again, however: here, from the lobby's button or from another tab
    account.set({ userId: 'acct_1', name: 'Kai', avatarUrl: null });
    TestBed.tick();
    fixture.detectChanges();
    expect(find(element, 'server-account-delete-failed')).toBeNull();
    expect(find(element, 'server-account-delete-confirm')).toBeNull();
  });

  it('says why a login failed', () => {
    error.set('denied');
    const element = render().nativeElement as HTMLElement;

    expect(find(element, 'server-account-error')!.textContent).toContain('ログインがキャンセルされました');
  });

  it('says the server keeps no rooms when it offers no login', () => {
    providers.set(false);
    const element = render().nativeElement as HTMLElement;

    expect(find(element, 'server-account-unavailable')).not.toBeNull();
    expect(find(element, 'server-account-login')).toBeNull();
  });
});
