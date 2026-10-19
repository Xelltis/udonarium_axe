import { inject, Injectable } from '@angular/core';
import { CutInService } from '@axe/application/media/cut-in.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { resolveFlipCutIn } from '@axe/domain/card/card-cut-in';
import { CutIn } from '@axe/domain/media/cut-in';

/**
 * How long a card turned up before its face reached this end is watched for the name its cut-in goes
 * by (milliseconds). On a room server the face of a card face down to a player comes only once it is
 * turned up.
 */
export const FACE_WAIT_MS = 5_000;

@Injectable({ providedIn: 'root' })
export class CardFlipCutInService {
  private readonly objectStore = inject(ObjectStore);
  private readonly cutInService = inject(CutInService);
  private readonly objectChange = inject(ObjectChangeService);

  /** Every cut-in in the room, for choosing one a card sets off when it is turned up. */
  cutIns(): CutIn[] {
    return this.objectStore.getObjects<CutIn>(CutIn);
  }

  /**
   * Only for turning a single card face up; a bulk action stays silent. A card whose face has not
   * reached this end yet has its cut-in looked for again as its face comes in.
   */
  playFor(card: Card): boolean {
    const cutIn = resolveFlipCutIn(card, this.cutIns());
    if (cutIn) return this.cutInService.launch(cutIn);
    if (card.isFaceWithheld) this.playOnceFaceComes(card);
    return false;
  }

  private playOnceFaceComes(card: Card): void {
    const timer = setTimeout(() => stop(), FACE_WAIT_MS);
    const stop = this.objectChange.objectChanged$.subscribe(() => {
      const cutIn = resolveFlipCutIn(card, this.cutIns());
      if (!cutIn) return;
      clearTimeout(timer);
      stop();
      this.cutInService.launch(cutIn);
    });
  }

  /** Ties a card to the cut-in played when it is turned face up. The tie travels with the card to every peer. */
  assign(card: Card, cutInIdentifier: string): void {
    card.cutInIdentifier = cutInIdentifier;
  }
}
