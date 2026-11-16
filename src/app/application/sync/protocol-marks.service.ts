import { effect, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { markProtocols } from '@axe/domain/peer/protocol-marks';

/**
 * Says on this seat's cursor which protocols its version runs, from the moment the cursor is here
 * rather than the first time one of them is needed: the room counts on the marks to keep zones in
 * order, to tell whom the shaped ground reaches, and to count a turn down again, and a seat that
 * said nothing would be taken for an older version.
 */
@Injectable({ providedIn: 'root' })
export class ProtocolMarksService {
  constructor() {
    const objectChange = inject(ObjectChangeService);
    effect(() => {
      objectChange.collectionOf(PeerCursor.aliasName)();
      const mine = PeerCursor.myCursor;
      if (mine) untracked(() => markProtocols(mine));
    });
  }
}
