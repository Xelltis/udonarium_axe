import { inject, Provider } from '@angular/core';
import { BEFORE_BOARD_MODE } from '@axe/application/replay/replay-playback.service';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';

/** Takes what is due of the room's automatic save in this browser before a replay's board is shown. */
export const BEFORE_BOARD_MODE_PROVIDER: Provider = {
  provide: BEFORE_BOARD_MODE,
  useFactory: () => {
    const roomArchive = inject(RoomArchiveEventHandlerService);
    return () => roomArchive.flush();
  },
};
