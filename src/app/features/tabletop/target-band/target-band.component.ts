import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The band at the foot of the screen while any piece is aimed at: how many are, and a press that
 * takes every aim off. A piece aimed at and then forgotten is struck by the next line aimed at
 * targets, and a piece gone where the reader cannot press it cannot be let go of by pressing it, so
 * the way to let go of them all is kept in sight for as long as there is anything to let go of.
 * Drawn over every panel, a step above the band a move is worked out on, so the two are read together.
 */
@Component({
  selector: 'target-band',
  templateUrl: './target-band.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class TargetBandComponent {
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly uiSignal = inject(UiSignalService);
  private readonly pieceTarget = inject(PieceTargetService);

  protected readonly zIndex = Z_TABLE_BANDS;

  /** How many pieces on the table are aimed at, which is when the band speaks. */
  protected readonly count = computed(() => {
    this.uiSignal.targetChange();
    this.objectChange.collectionOf(GameCharacter.aliasName)();
    let count = 0;
    for (const piece of this.objectStore.getObjects<GameCharacter>(GameCharacter)) {
      if (!piece.targeted) continue;
      this.objectChange.versionOf(piece.identifier)();
      if (piece.isVisibleOnTable) count++;
    }
    return count;
  });

  /** Takes every aim off. The press is kept off the table underneath. */
  protected clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.pieceTarget.clear();
  }
}
