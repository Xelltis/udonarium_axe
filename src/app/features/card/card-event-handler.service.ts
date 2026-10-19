import { DestroyRef, inject, Injectable } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';

/**
 * Lets go of the decks a seat made a guest was looking through.
 *
 * A seat looking through a deck's cards holds the deck, which tells everyone it is being looked
 * at. Made a guest, the seat closes the list but may not write that it let go, so the game master's
 * screen does it for it.
 */
@Injectable({ providedIn: 'root' })
export class CardEventHandlerService {
  private readonly objectStore = inject(ObjectStore);

  constructor() {
    inject(ObjectChangeService).onObjectChangedForAlias(
      [PeerCursor.aliasName],
      (event) => {
        if (!PeerCursor.isMyselfGameMaster) return;
        const cursor = this.objectStore.get<PeerCursor>(event.identifier);
        if (!cursor || cursor.role !== PeerRole.Guest || cursor.userId.length < 1) return;
        for (const stack of this.objectStore.getObjects(CardStack)) {
          if (stack.owner === cursor.userId) stack.owner = '';
        }
      },
      inject(DestroyRef)
    );
  }
}
