import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { WIDGET_CLOCK } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { CLOCK_GHOST_PATTERN, formatClockParts } from '@axe/features/widgets/digital-clock/clock-format';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { topRightFallback, WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'digital-clock',
  templateUrl: './digital-clock.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, TranslocoModule],
})
export class DigitalClockComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ghost = CLOCK_GHOST_PATTERN;
  protected readonly parts = signal(formatClockParts(new Date()));

  protected readonly widgetName = WIDGET_CLOCK;
  protected readonly fallback = topRightFallback(8);

  constructor() {
    const timer = setInterval(() => this.parts.set(formatClockParts(new Date())), 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected close(): void {
    this.widgets.clock.set(false);
  }
}
