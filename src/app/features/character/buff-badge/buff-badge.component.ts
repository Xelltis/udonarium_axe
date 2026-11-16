import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { StatusAilmentService } from '@axe/application/character/status-ailment.service';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { buffKindFrom } from '@axe/domain/character/buff-kind';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/**
 * A buff as a badge: its icon in a circle of its colour, its strength at the top left and the rounds
 * left at the bottom right where time takes it away. A debuff carries a small ▼ inside the circle, at
 * its bottom right, on the circle's own colour. The same badge wherever a buff is shown as one, over
 * a piece or in a row of its details. The host lays out nothing of its own.
 */
@Component({
  selector: 'buff-badge',
  templateUrl: './buff-badge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe],
  host: { class: 'contents' },
})
export class BuffBadgeComponent {
  private readonly statusAilments = inject(StatusAilmentService);

  readonly badge = input.required<BuffBadge>();

  /** Whether the buff is a debuff: marked one, or unmarked and going by the name of a state the room keeps. */
  protected readonly isDebuff = computed(() => {
    const badge = this.badge();
    return buffKindFrom(badge.kindMark, badge.name, this.statusAilments.ailments()) === 'debuff';
  });
}
