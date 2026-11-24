import { DestroyRef, inject, Injectable } from '@angular/core';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { revealSealedDice$ } from '@axe/core/event/domain-events';
import { onSealedFacesChangedElsewhere } from '@axe/core/storage/sealed-faces';
import { ObjectStore } from '@axe/core/sync/object-store';
import { inOneTab } from '@axe/core/util/one-tab';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';

/** The lock the tabs of one seat in a browser answer the game master's asking to show sealed dice under, the seat's user id after it. */
const REVEAL_LOCK = 'axe-reveal-sealed-dice';
/** How long a tab that answered keeps the others from answering, as each is told a moment apart. */
const REVEAL_KEPT_MS = 3000;

/**
 * Shows the dice this seat has sealed when the game master asks every seat to, as plot dice are
 * shown together. Each seat shows its own, since only its browser has their faces: a seat away when
 * asked keeps them sealed. One tab of the seat in the browser answers for every tab of it, as they
 * share the faces, and a tab of a seat with no sealed die does not answer, leaving the lock to the
 * tabs of a seat that has. Only the game master may ask: asked by any other seat, nothing is shown.
 *
 * Draws anew the
 * sealed dice whose faces another tab of the page changed, as by rolling them there, since the room
 * is told nothing of a sealed die's face.
 */
@Injectable({ providedIn: 'root' })
export class SealedDiceEventHandlerService {
  private readonly diceRoll = inject(DiceRollService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly permission = inject(RolePermissionService);

  constructor() {
    const destroyRef = inject(DestroyRef);
    revealSealedDice$.subscribe((event) => {
      if (!this.permission.canPeerSeeHidden(event.from)) return;
      const dice = this.objectStore.getObjects(DiceSymbol);
      if (!dice.some((die) => die.isSealed && die.isMine)) return;
      inOneTab(`${REVEAL_LOCK}:${PeerCursor.myUserId}`, REVEAL_KEPT_MS, () => this.diceRoll.revealOwnSealed(dice));
    }, destroyRef);
    destroyRef.onDestroy(
      onSealedFacesChangedElsewhere((identifiers) => {
        for (const identifier of identifiers) this.objectChange.notifyChanged(identifier);
      })
    );
  }
}
