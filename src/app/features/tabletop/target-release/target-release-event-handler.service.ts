import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { TurnState } from '@axe/domain/tabletop/turn-state';

/**
 * Takes the aim off pieces as the fight moves on without the reader: off a piece on the table the
 * moment this reader loses sight of it, and off every piece as the turn passes to the next.
 *
 * An aim is kept in this browser alone and is read wherever aims are, in the chat's lines aimed at
 * targets among them, so an aim left on would strike a piece the reader no longer means to. A piece
 * gone out of sight, into the dark or under the fog, put into stealth or left behind as the reader's
 * own eyes move away, cannot be pressed to take the aim off it; an aim is only ever put on a piece
 * the reader can see, so it is taken off on the same terms. The game master sees everything and
 * loses no aim to sight, nor while looking at the table as a player, which is a look rather than a
 * change of who is looking. A turn handed to the next piece ends what the aims were for, so they
 * are all taken off, for everyone; the aim that outlived its turn is the one that strikes the wrong
 * piece.
 */
@Injectable({ providedIn: 'root' })
export class TargetReleaseEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly pieceTarget = inject(PieceTargetService);

  /** Whose turn it was when the round was last looked at; undefined before it has been looked at. */
  private lastTurnOf: string | undefined;

  constructor() {
    effect(() => {
      this.uiSignal.targetChange();
      this.objectChange.collectionOf(GameCharacter.aliasName)();
      if (this.vision.previewAsUserId()) return;
      const unseen = this.objectStore.getObjects<GameCharacter>(GameCharacter).filter((piece) => {
        if (!piece.targeted || !piece.isVisibleOnTable) return false;
        this.objectChange.versionOf(piece.identifier)();
        return !this.vision.isTokenVisible(piece);
      });
      if (unseen.length > 0) untracked(() => this.pieceTarget.drop(unseen));
    });
    this.objectChange.onObjectChangedForIdentifier('TurnState', () => this.turnChanged(), this.destroyRef);
  }

  /**
   * Takes every aim off as the turn passes to another piece, or the round closes. The turn as it
   * stands when first heard of, on joining, ends nothing.
   */
  private turnChanged(): void {
    const current = this.objectStore.get<TurnState>('TurnState')?.currentIdentifier ?? '';
    const before = this.lastTurnOf;
    this.lastTurnOf = current;
    if (before === undefined || before === current) return;
    this.pieceTarget.clear();
  }
}
