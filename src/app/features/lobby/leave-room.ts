import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/network/network';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';

/** What leaving the room now would lose, which the reader is asked about first. */
export type LeavingLoss = 'peer-to-peer' | 'unsent' | 'uploads';

/**
 * What leaving the room now would lose, or null for nothing, as outside a room. Through SkyWay the
 * table stays only with whoever is left, and nobody may be. On a room server the table stays there,
 * except what was changed while the link to it is down, and the pictures and sounds this seat has
 * yet to put up there.
 */
export function leavingLoss(): LeavingLoss | null {
  if (!Network.peerContext.isRoom) return null;
  if (Network.transport !== 'server') return 'peer-to-peer';
  if (!Network.isAuthorityOpen) return 'unsent';
  if (ImageStorage.instance.hasUploadsPending || AudioStorage.instance.hasUploadsPending) return 'uploads';
  return null;
}

/**
 * Leaves the room this page is in by loading the page afresh without the invitation its address may
 * still carry, which would otherwise take the reloaded page straight back in. The browser does not
 * ask whether to leave the page: a reader who said no there would stay in the room with the
 * invitation gone from the address.
 */
export function leaveRoomByReloading(win: Window = window): void {
  Network.letPageGo();
  dropInvitationFromAddress(win);
  win.location.reload();
}

/** Takes the invitation off the page's address, which would take the page reloaded back into its room. */
export function dropInvitationFromAddress(win: Window = window): void {
  const { pathname, search } = win.location;
  win.history.replaceState(null, '', pathname + search);
}

/** Leaves the room the reader is in, once they have said they are sure when leaving would lose something. */
@Injectable({ providedIn: 'root' })
export class LeaveRoomService {
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);
  private readonly roomArchive = inject(RoomArchiveEventHandlerService);
  private leaving = false;

  /**
   * Asks first when leaving would lose something, then keeps the room in this browser's automatic
   * save and leaves. Resolves false when the reader thought better of it, or for a press while
   * already leaving.
   */
  async leave(win: Window = window): Promise<boolean> {
    if (this.leaving) return false;
    const loss = leavingLoss();
    if (loss) {
      const sure = await this.confirm.ask({
        title: this.t('feature.lobby.leaveRoom.title'),
        message: this.t(`feature.lobby.leaveRoom.${loss}`),
        okLabel: this.t('feature.lobby.lobby.leaveRoom'),
        danger: true,
      });
      if (!sure) return false;
    }
    this.leaving = true;
    await this.roomArchive.flush();
    leaveRoomByReloading(win);
    return true;
  }
}
