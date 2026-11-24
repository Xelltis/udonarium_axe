import { DestroyRef, inject, Injectable } from '@angular/core';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { revealSealedDice$ } from '@axe/core/event/domain-events';
import { onSealedFacesChangedElsewhere } from '@axe/core/storage/sealed-faces';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';

/**
 * Shows the dice this seat has sealed when the game master asks every seat to, as plot dice are
 * shown together. Each seat shows its own, since only its browser has their faces: a seat away when
 * asked keeps them sealed. Only the game master may ask: asked by any other seat, nothing is shown.
 *
 * Draws anew the sealed dice whose faces another tab of the page changed, as by rolling them there,
 * since the room is told nothing of a sealed die's face.
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
      if (this.permission.canPeerSeeHidden(event.from))
        this.diceRoll.revealOwnSealed(this.objectStore.getObjects(DiceSymbol));
    }, destroyRef);
    destroyRef.onDestroy(
      onSealedFacesChangedElsewhere((identifiers) => {
        for (const identifier of identifiers) this.objectChange.notifyChanged(identifier);
      })
    );
  }
}
