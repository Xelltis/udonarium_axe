import { DestroyRef, inject, Injectable, Injector } from '@angular/core';
import { battleCutIn$ } from '@axe/core/event/domain-events';
import type { BattleCutInReceiverService } from '@axe/features/battle-cut-in/battle-cut-in-receiver.service';

/**
 * Hands the exchanges the room sends to the battle stage on to be played.
 *
 * What plays them is fetched with the first one, as most rooms never play one. Scenes heard while
 * it is on its way wait for it, in the order they came.
 */
@Injectable({ providedIn: 'root' })
export class BattleCutInEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private receiver: Promise<BattleCutInReceiverService | null> | null = null;

  constructor() {
    battleCutIn$.subscribe((event) => {
      void this.receiverOf().then((receiver) => receiver?.receive(event.scene));
    }, this.destroyRef);
  }

  private receiverOf(): Promise<BattleCutInReceiverService | null> {
    this.receiver ??= import('@axe/features/battle-cut-in/battle-cut-in-receiver.service').then(
      (m) => this.injector.get(m.BattleCutInReceiverService),
      () => {
        this.receiver = null;
        return null;
      }
    );
    return this.receiver;
  }
}
