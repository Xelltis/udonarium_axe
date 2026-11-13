import { DestroyRef, effect, inject, Injectable, untracked } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { TurnState } from '@axe/domain/tabletop/turn-state';

/**
 * Takes the aim off pieces on the table as the fight moves on without the reader: off a piece the
 * moment this reader loses sight of it, and off every one as the turn passes to the next.
 *
 * An aim is kept in this browser alone and is read wherever aims are, in the chat's lines aimed at
 * targets among them, so an aim left on would strike a piece the reader no longer means to. A piece
 * gone out of sight, into the dark or under the fog, put into stealth or left behind as the reader's
 * own eyes move away, cannot be pressed to take the aim off it; an aim is only ever put on a piece
 * the reader can see, so it is taken off on the same terms. The game master sees everything and
 * loses no aim to sight; looking at the table as a player, they lose what that player would, as
 * the look is for seeing what the players see. A turn handed on ends what the aims were for, so
 * they are all taken off, for everyone; the aim that outlived its turn is the one that strikes the
 * wrong piece. A tick on a piece kept off the table, in a tab of the inventory, is not the fight's
 * and is left as it is; nor are the targets of an effect being picked, which are that reader's to
 * let go of.
 */
@Injectable({ providedIn: 'root' })
export class TargetReleaseEventHandlerService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly vision = inject(VisionService);
  private readonly pieceTarget = inject(PieceTargetService);

  /** The turn as it stood when the round was last looked at; undefined before it has been looked at. */
  private lastTurn: string | undefined;

  constructor() {
    effect(() => {
      const aimed = this.pieceTarget.onTable();
      if (aimed.length < 1) return;
      const unseen = aimed.filter((piece) => !this.vision.isTokenVisible(piece));
      if (unseen.length > 0) untracked(() => this.pieceTarget.drop(unseen));
    });
    this.objectChange.onObjectChangedForIdentifier('TurnState', () => this.turnChanged(), this.destroyRef);
  }

  /**
   * Takes every aim off the table as the turn passes: to another piece, to the same piece again as
   * its turn begins anew, or to nobody as the round closes. The turn as it stands when first heard
   * of, on joining, ends nothing.
   */
  private turnChanged(): void {
    const turns = this.objectStore.get<TurnState>('TurnState');
    const current = `${turns?.currentIdentifier ?? ''}|${turns?.turnStart ?? ''}`;
    const before = this.lastTurn;
    this.lastTurn = current;
    if (before === undefined || before === current) return;
    this.pieceTarget.drop(this.pieceTarget.onTable());
  }
}
