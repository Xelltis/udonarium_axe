import { inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/index';
import { Logger } from '@axe/core/logging/logger';
import { ServerRoomApiError } from '@axe/core/network/server/server-room-api';

/** A room on the room server, as much of it as deleting it takes. */
export interface DeletableRoom {
  roomKey: string;
  name: string;
  id: string;
}

/**
 * How asking to delete a room ended: deleted, thought better of, already gone, refused because
 * the reader is no GM of it, or failed some other way.
 */
export type RoomDeletionOutcome = 'deleted' | 'cancelled' | 'gone' | 'not-game-master' | 'failed';

/** The message to show for an outcome; none when the reader cancelled. */
export function roomDeletionMessageKey(outcome: RoomDeletionOutcome): string | null {
  switch (outcome) {
    case 'deleted':
      return 'feature.lobby.deleteRoom.deleted';
    case 'gone':
      return 'feature.lobby.deleteRoom.gone';
    case 'not-game-master':
      return 'feature.lobby.deleteRoom.notGameMaster';
    case 'failed':
      return 'feature.lobby.deleteRoom.failed';
    case 'cancelled':
      return null;
  }
}

/** Deletes a room on the room server for a GM of it, once they have confirmed. */
@Injectable({ providedIn: 'root' })
export class RoomDeletionService {
  private readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);

  /**
   * Asks the reader to confirm, then deletes the room. The server closes it for everybody in it,
   * the reader too when they are.
   */
  async delete(room: DeletableRoom): Promise<RoomDeletionOutcome> {
    const sure = await this.confirm.ask({
      title: this.t('feature.lobby.deleteRoom.confirmTitle'),
      message: this.t('feature.lobby.deleteRoom.confirmMessage', { name: `${room.name}/${room.id}` }),
      okLabel: this.t('feature.lobby.deleteRoom.confirmOk'),
      danger: true,
    });
    if (!sure) return 'cancelled';
    try {
      await Network.deleteRoom(room.roomKey);
      return 'deleted';
    } catch (e) {
      if (e instanceof ServerRoomApiError && e.code === 'room-not-found') return 'gone';
      if (e instanceof ServerRoomApiError && e.code === 'not-game-master') return 'not-game-master';
      Logger.warn('[RoomDeletion] the room could not be deleted', e);
      return 'failed';
    }
  }
}
