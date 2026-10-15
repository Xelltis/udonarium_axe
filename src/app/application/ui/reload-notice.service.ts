import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Logger } from '@axe/core/logging/logger';

/**
 * Tells the reader that the page wants reloading because part of the app could not be fetched.
 *
 * Parts of the app are fetched only when they are first used. A tab left open across a release asks
 * for files the new release no longer has, and nothing it asks for from then on arrives. The reader
 * is asked once per page, and the page reloads only when they say so. Once they have put it off,
 * each further failure says so at the bottom of the screen, with a button that reloads.
 */
@Injectable({ providedIn: 'root' })
export class ReloadNoticeService {
  private readonly confirm = inject(ConfirmService);
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);
  private asked: 'not-yet' | 'asking' | 'put-off' = 'not-yet';

  /**
   * Asks the reader to reload the page, the first time. While that question is open nothing more is
   * said; once it was put off, the bottom of the screen says it again.
   */
  tellReloadNeeded(): void {
    if (this.asked === 'asking') return;
    if (this.asked === 'put-off') {
      this.snackbar.show(this.t('common.dialog.reloadNeeded'), {
        action: { label: this.t('common.dialog.reload'), run: () => this.reload() },
      });
      return;
    }
    this.asked = 'asking';
    void this.confirm
      .ask({
        title: this.t('common.dialog.updatedTitle'),
        message: this.t('common.dialog.updatedMessage'),
        okLabel: this.t('common.dialog.reload'),
        cancelLabel: this.t('common.dialog.later'),
      })
      .then((reload) => {
        if (reload) this.reload();
        else this.asked = 'put-off';
      });
  }

  /**
   * The same loader, except that one that cannot fetch what it loads also asks the reader to reload.
   * It still rejects as before.
   */
  noticingFailure<T>(load: () => Promise<T>): () => Promise<T> {
    return () =>
      load().catch((reason: unknown) => {
        Logger.warn('[ReloadNotice] 画面の一部を読み込めませんでした', reason);
        this.tellReloadNeeded();
        throw reason;
      });
  }

  /** Reloads the page, once the reader has asked for it. */
  protected reload(): void {
    location.reload();
  }
}
