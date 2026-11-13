import { computed, inject, Injectable } from '@angular/core';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';

@Injectable({ providedIn: 'root' })
export class PieceTargetService {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly effectTargeting = inject(EffectTargetingService);

  /**
   * The pieces on the table aimed at, read again as an aim is put on or taken off, as a piece
   * arrives or goes, and as an aimed-at piece changes, which is how it leaves the table.
   */
  readonly onTable = computed<GameCharacter[]>(() => {
    this.uiSignal.targetChange();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    const aimed: GameCharacter[] = [];
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!piece.targeted) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (piece.isVisibleOnTable) aimed.push(piece);
    }
    return aimed;
  });

  toggle(piece: GameCharacter): void {
    piece.targeted = !piece.targeted;
    this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
  }

  /**
   * Takes every aim off. An effect's targets being picked are let go of first: the picks are what the
   * effect would be cast at, and marks taken off while they were kept would leave it cast at pieces
   * that no longer look aimed at.
   */
  clear(): void {
    this.effectTargeting.cancel();
    this.drop(this.objectStore.getObjects<GameCharacter>(GameCharacter));
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

  /** Takes the aim off these pieces, saying so for each that was aimed at, and leaves every other as it is. */
  drop(pieces: readonly GameCharacter[]): void {
    for (const piece of pieces) {
      if (!piece.targeted) continue;
      piece.targeted = false;
      this.uiSignal.notifyTargetChange(piece.identifier, piece.aliasName);
    }
  }

  anything(): boolean {
    return this.objectStore.getObjects<GameCharacter>(GameCharacter).some((piece) => piece.targeted);
  }
}
