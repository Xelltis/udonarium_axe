import { computed, inject, type Signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { buildTurnIndicator, type TurnIndicator } from '@axe/ui/turn/turn-indicator';

/**
 * A signal following the turn heading.
 *
 * Copying the same wiring into every screen means missing one when it changes. Call this wherever injection is available.
 */
export function turnIndicatorSignal(): Signal<TurnIndicator | null> {
  const objectChange = inject(ObjectChangeService);
  const objectStore = inject(ObjectStore);
  const turnOrder = inject(TurnOrderService);

  return computed(() => {
    objectChange.versionOf('TurnState')();
    const currentIdentifier = turnOrder.currentIdentifier;
    if (currentIdentifier) objectChange.versionOf(currentIdentifier)();
    const current = currentIdentifier ? objectStore.get(currentIdentifier) : null;
    const name = current instanceof GameCharacter ? current.name : '';
    // The sides come from the room's rules and from the parties themselves, names and all, so
    // a mode switched back or a party renamed has to reach the heading without waiting for a turn.
    objectChange.versionOf('Config')();
    objectChange.collectionOf('party')();
    objectChange.collectionOf(GameCharacter.aliasName)();
    for (const party of objectStore.getObjects('party')) objectChange.versionOf(party.identifier)();
    const side = turnOrder.currentSide;
    return buildTurnIndicator(turnOrder.phase, turnOrder.round, name, side ? turnOrder.sideName(side) : '');
  });
}
