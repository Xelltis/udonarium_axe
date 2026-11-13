import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
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
  private readonly pieceTarget = inject(PieceTargetService);

  protected readonly zIndex = Z_TABLE_BANDS;

  /** How many pieces on the table are aimed at, which is when the band speaks. */
  protected readonly count = computed(() => this.pieceTarget.onTable().length);

  /** Takes every aim off. The press is kept off the table underneath. */
  protected clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.pieceTarget.clear();
  }
}
