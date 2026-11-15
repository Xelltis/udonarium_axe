import { DestroyRef, inject, Injectable } from '@angular/core';
import { ResetUndoService } from '@axe/application/character/reset-undo.service';
import { resetCarriedOut$ } from '@axe/core/event/domain-events';
import type { ResetRecord } from '@axe/domain/character/piece-reset';

/**
 * Keeps what a reset did as it is carried out on this device, so it can be taken back from the chat
 * line that reported it.
 *
 * A reset is announced only on the device that carried it out, from a chat command or a button
 * alike, so no other seat keeps anything.
 */
@Injectable({ providedIn: 'root' })
export class ResetUndoEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly resetUndo = inject(ResetUndoService);

  constructor() {
    resetCarriedOut$.subscribe((event) => {
      this.resetUndo.keep(event.messageIdentifier, event.record as ResetRecord);
    }, this.destroyRef);
  }
}
