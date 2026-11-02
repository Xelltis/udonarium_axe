import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { BuffBadge } from '@axe/domain/character/buff-badge';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';

/**
 * A buff as a badge: its icon in a circle of its colour, its strength at the top left and the rounds
 * left at the bottom right where time takes it away. The same badge wherever a buff is shown as one,
 * over a piece or in a row of its details. The host lays out nothing of its own.
 */
@Component({
  selector: 'buff-badge',
  templateUrl: './buff-badge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SafePipe],
  host: { class: 'contents' },
})
export class BuffBadgeComponent {
  readonly badge = input.required<BuffBadge>();
}
