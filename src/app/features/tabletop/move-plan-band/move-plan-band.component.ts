import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { Z_TABLE_BANDS } from '@axe/ui/z-layers';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The band at the foot of the screen while a move is worked out: how it is taken, the kinds of move
 * the room plays and how far the chosen one has left, whether nobody may stop it, and how to work it
 * out. Drawn over every panel rather than inside the table, so a window left open at the foot of the
 * screen does not hide what the move is waiting on.
 */
@Component({
  selector: 'move-plan-band',
  templateUrl: './move-plan-band.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  imports: [TranslocoModule],
})
export class MovePlanBandComponent {
  private readonly movePlan = inject(MovePlannerService);
  private readonly viewport = inject(ViewportService);

  protected readonly zIndex = Z_TABLE_BANDS;
  /** Whether a move is being worked out, which is when the band speaks. */
  protected readonly isPlanning = this.movePlan.isPlanning;
  protected readonly isJumping = this.movePlan.isJumping;
  /** Whether the move is drawn as straight legs, which has no jumping to choose. */
  protected readonly isFree = this.movePlan.isFree;
  /** The kinds of move the room plays, and how far the chosen one has left. */
  protected readonly kindBand = this.movePlan.kindBand;
  /** Whether the move being worked out is one nobody may stop, offered where the room plays zones. */
  protected readonly unstoppableBand = this.movePlan.unstoppableBand;
  /** A hand with no keys is told what it can do rather than which keys it has not got. */
  protected readonly hintKey = computed(() =>
    this.viewport.isTouch() ? 'feature.tabletop.movePlan.hintTouch' : 'feature.tabletop.movePlan.hint'
  );

  /** The two ways a move may be taken, offered as a pair so which one is on is plain to see. */
  protected readonly modes = [
    {
      jumping: false,
      icon: 'directions_walk',
      label: 'feature.tabletop.movePlan.walk',
      testId: 'move-plan-walk',
    },
    {
      jumping: true,
      icon: 'keyboard_double_arrow_up',
      label: 'feature.tabletop.movePlan.jump',
      testId: 'move-plan-jump',
    },
  ] as const;

  /**
   * Chooses how the move is taken. A finger has no space bar. The press is kept off the table
   * underneath, which would read it as a choice of where to walk to.
   */
  protected chooseMode(jumping: boolean, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    if (this.isJumping() !== jumping) this.movePlan.toggleJump();
  }

  /** Chooses the kind of move, kept off the table underneath like the mode is. */
  protected chooseKind(kind: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.movePlan.setKind(kind);
  }

  /** Makes the move one nobody may stop, or not, kept off the table underneath. */
  protected toggleUnstoppable(on: boolean, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.movePlan.setUnstoppable(on);
  }
}
