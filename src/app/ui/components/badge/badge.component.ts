import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

@Component({
  selector: 'badge',
  templateUrl: './badge.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BadgeComponent {
  readonly count = input(0);
  /** Bouncing from each new count until the bounce has finished. */
  readonly animeState = linkedSignal<number, 'active' | 'inactive'>({
    source: this.count,
    computation: () => 'active',
  });

  /** Called when the bounce animation finishes, so the badge rests until its count changes again. */
  onBounceEnd() {
    this.animeState.set('inactive');
  }
}
