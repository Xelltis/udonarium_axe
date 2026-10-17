import { DOCUMENT, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { leavingLoss, leavingLossText } from '@axe/application/lobby/leaving-loss';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { LocalModePreferenceService } from '@axe/application/ui/local-mode-preference.service';
import { Network } from '@axe/core/network/network';
import { requestBrowserDataWipe, wipeBrowserData } from '@axe/core/storage/browser-data-wipe';

/**
 * Throws away everything the app keeps in this browser, once the reader has said they are sure,
 * and loads the page again.
 *
 * What goes is this browser's alone: its settings, the room's automatic saves, recorded replays and
 * the pictures for its dice and skins. What the room shares stays with the other peers, so any role
 * may do it, someone watching included.
 */
@Injectable({ providedIn: 'root' })
export class BrowserDataWipeService {
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly document = inject(DOCUMENT);
  private readonly localModePreference = inject(LocalModePreferenceService);

  /**
   * Asks first, saying too what leaving a room server's room now would lose, then wipes and loads the
   * page again; resolves false when the reader thought better of it.
   *
   * The wipe is left to the next load, before the app starts, so nothing this page still holds is
   * written back. Where that cannot be asked for, it is wiped here instead, as far as it goes. The
   * browser is not let ask again whether to leave the page, which would keep a page wiped under it.
   */
  async wipe(): Promise<boolean> {
    const lost = leavingLossText(leavingLoss(), this.t);
    const sure = await this.confirm.ask({
      title: this.t('feature.roomSettings.wipeConfirmTitle'),
      message: lost
        ? `${this.t('feature.roomSettings.wipeConfirmMessage')}\n\n${lost}`
        : this.t('feature.roomSettings.wipeConfirmMessage'),
      okLabel: this.t('feature.roomSettings.wipeConfirmOk'),
      danger: true,
    });
    if (!sure) return false;
    if (!requestBrowserDataWipe()) await wipeBrowserData();
    Network.letPageGo();
    if (this.localModePreference.enabled()) this.dropInvitation();
    this.reload();
    return true;
  }

  /**
   * Takes an invitation off the page's address while playing offline, where the wipe forgets that,
   * and the page, starting afresh online, would go into a room the reader had not gone into. Online
   * it is left, to take the reader back into the room it was in.
   */
  private dropInvitation(): void {
    const win = this.document.defaultView;
    if (win) win.history.replaceState(null, '', win.location.pathname + win.location.search);
  }

  /** Loads the page again, which is where a wipe asked for happens. */
  reload(): void {
    this.document.defaultView?.location.reload();
  }
}
