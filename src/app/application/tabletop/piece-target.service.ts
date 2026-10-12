import { inject, Injectable } from '@angular/core';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';

@Injectable({ providedIn: 'root' })
export class PieceTargetService {
  private readonly objectStore = inject(ObjectStore);
  private readonly uiSignal = inject(UiSignalService);

  toggle(piece: GameCharacter): void {
    piece.targeted = !piece.targeted;
    this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
  }

  clear(): void {
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!piece.targeted) continue;
      piece.targeted = false;
      this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
    }
  }

  /** Aims at exactly these pieces, taking the aim off every other. */
  setOnly(pieces: readonly GameCharacter[]): void {
    const wanted = new Set(pieces.map((piece) => piece.identifier));
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      const next = wanted.has(piece.identifier);
      if (piece.targeted === next) continue;
      piece.targeted = next;
      this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
    }
  }

  anything(): boolean {
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).some((piece) => piece.targeted);
  }
}
