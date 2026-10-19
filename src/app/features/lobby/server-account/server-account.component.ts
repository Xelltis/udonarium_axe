import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ServerAuthService } from '@axe/application/lobby/server-auth.service';
import { TranslocoModule } from '@jsverse/transloco';

/** The translation key for each reason a login can fail with; anything else asks to try again. */
const LOGIN_ERROR_KEYS: Readonly<Record<string, string>> = {
  denied: 'feature.lobby.account.errors.denied',
  'provider-failed': 'feature.lobby.account.errors.providerFailed',
  'rate-limited': 'feature.lobby.account.errors.rateLimited',
  network: 'feature.lobby.account.errors.network',
};

/**
 * The login with the room server, at the top of the lobby: a button to log in with Discord, or
 * who is logged in with a way out and a way to delete the account, asked twice.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'server-account',
  templateUrl: './server-account.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class ServerAccountComponent {
  private readonly auth = inject(ServerAuthService);

  protected readonly account = this.auth.account;
  protected readonly isLoggingIn = this.auth.isLoggingIn;
  protected readonly offersLogin = this.auth.offersLogin;
  /** Whether the reader has asked to delete the account and is being asked again. */
  protected readonly isConfirmingDelete = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly deleteFailed = signal(false);

  protected readonly errorKey = computed(() => {
    const error = this.auth.error();
    return error ? (LOGIN_ERROR_KEYS[error] ?? 'feature.lobby.account.errors.retry') : '';
  });

  constructor() {
    // A login, however it came, from this button, the lobby's or another tab, starts afresh: the
    // deleting asked about, or failed, was the account before it.
    effect(() => {
      if (!this.account()) return;
      untracked(() => {
        this.isConfirmingDelete.set(false);
        this.deleteFailed.set(false);
      });
    });
  }

  protected login(): void {
    void this.auth.startLogin();
  }

  protected logout(): void {
    this.isConfirmingDelete.set(false);
    void this.auth.logout();
  }

  protected async deleteAccount(): Promise<void> {
    this.isDeleting.set(true);
    this.deleteFailed.set(false);
    try {
      await this.auth.deleteAccount();
      this.isConfirmingDelete.set(false);
    } catch {
      this.deleteFailed.set(true);
    } finally {
      this.isDeleting.set(false);
    }
  }
}
