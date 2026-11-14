import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { PieceTargetService } from '@axe/application/tabletop/piece-target.service';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The band at the foot of the screen while any piece is aimed at: how many are, and a press that
 * takes every aim off. A piece aimed at and then forgotten is struck by the next line aimed at
 * targets, and a piece gone where the reader cannot press it cannot be let go of by pressing it, so
 * the way to let go of them all is kept in sight for as long as there is anything to let go of.
 * Drawn over every panel, a step above the band a move is worked out on, so the two are read together.
 *
 * While an effect is held ready the band stays from the moment it is until it is cast or called off,
 * with nothing aimed at too, and holds the buttons that cast it and call it off, so neither needs the
 * panel the effect was chosen in to be in reach. Its count is then set in a box of one width, so the
 * band is the same size whatever is picked.
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
  private readonly effectTargeting = inject(EffectTargetingService);

  protected readonly zIndex = Z_TABLE_BANDS;

  /** How many pieces on the table are aimed at, which is when the band speaks. */
  protected readonly count = computed(() => this.pieceTarget.onTable().length);

  /** Whether an effect is held ready, which keeps the band shown and gives it the buttons to cast and call off. */
  protected readonly aiming = this.effectTargeting.isPicking;

  /** How many targets of the effect held ready this reader is shown picked. */
  protected readonly picked = computed(() => this.effectTargeting.pickOrder().size);

  /** How many targets the effect held ready takes at most. */
  protected readonly limit = this.effectTargeting.limit;

  /** Casts the effect held ready at the pieces picked. The press is kept off the table underneath. */
  protected fire(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.effectTargeting.confirm();
  }

  /** Calls off the effect held ready, putting the aims back as they were before it. */
  protected cancel(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.effectTargeting.cancel();
  }

  /** Takes every aim off. The press is kept off the table underneath. */
  protected clear(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.pieceTarget.clear();
  }
}
