import { inject, Provider } from '@angular/core';
import { BEFORE_RELOAD } from '@axe/application/ui/reload-notice.service';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';

/** Keeps the room in this browser's automatic save before a reload the reader asked for. */
export const BEFORE_RELOAD_PROVIDER: Provider = {
  provide: BEFORE_RELOAD,
  useFactory: () => {
    const roomArchive = inject(RoomArchiveEventHandlerService);
    return () => roomArchive.flush();
  },
};
