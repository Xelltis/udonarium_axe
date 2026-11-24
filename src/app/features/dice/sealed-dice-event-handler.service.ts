import { DestroyRef, inject, Injectable } from '@angular/core';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { revealSealedDice$ } from '@axe/core/event/domain-events';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DiceSymbol } from '@axe/domain/dice/dice-symbol';

/**
 * Shows the dice this seat has sealed when the game master asks every seat to, as plot dice are
 * shown together. Each seat shows its own, since only its browser has their faces: a seat away when
 * asked keeps them sealed. Only the game master may ask: asked by any other seat, nothing is shown.
 */
@Injectable({ providedIn: 'root' })
export class SealedDiceEventHandlerService {
  private readonly diceRoll = inject(DiceRollService);
  private readonly objectStore = inject(ObjectStore);
  private readonly permission = inject(RolePermissionService);

  constructor() {
    revealSealedDice$.subscribe((event) => {
      if (this.permission.canPeerSeeHidden(event.from))
        this.diceRoll.revealOwnSealed(this.objectStore.getObjects(DiceSymbol));
    }, inject(DestroyRef));
  }
}
