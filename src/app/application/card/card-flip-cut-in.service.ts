import { inject, Injectable } from '@angular/core';
import { CutInService } from '@axe/application/media/cut-in.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { resolveFlipCutIn } from '@axe/domain/card/card-cut-in';
import { CutIn } from '@axe/domain/media/cut-in';

@Injectable({ providedIn: 'root' })
export class CardFlipCutInService {
  private readonly objectStore = inject(ObjectStore);
  private readonly cutInService = inject(CutInService);

  /** Every cut-in in the room, for choosing one a card sets off when it is turned up. */
  cutIns(): CutIn[] {
    return this.objectStore.getObjects<CutIn>(CutIn);
  }

  /** Only for turning a single card face up; a bulk action stays silent. */
  playFor(card: Card): boolean {
    const cutIn = resolveFlipCutIn(card, this.cutIns());
    if (!cutIn) return false;
    return this.cutInService.launch(cutIn);
  }

  /** Ties a card to the cut-in played when it is turned face up. The tie travels with the card to every peer. */
  assign(card: Card, cutInIdentifier: string): void {
    card.cutInIdentifier = cutInIdentifier;
  }
}
