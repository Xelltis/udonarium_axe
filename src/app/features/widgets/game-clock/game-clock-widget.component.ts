import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { WIDGET_GAME_CLOCK } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { GAME_CLOCK_STEPS, type GameClockMode } from '@axe/domain/game-clock/game-clock';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * The time the room keeps in its story, as a widget each seat shows or hides for itself: the day
 * and the hour of it, which the game master steps on and back from here and sets up below.
 */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-game-clock-widget',
  templateUrl: './game-clock-widget.component.html',
  imports: [DraggableDirective, WidgetPlaceDirective, FormsModule, TranslocoModule],
})
export class GameClockWidgetComponent {
  protected readonly widgets = inject(WidgetVisibilityService);
  protected readonly clock = inject(GameClockService);

  protected readonly widgetName = WIDGET_GAME_CLOCK;
  /**
   * Where it stands until it is dragged: in the middle at the top, under the toolbars that stand
   * there, clear of the menu down the left and the clock and the player on the right.
   */
  protected readonly fallback = (el: HTMLElement) => ({
    left: Math.max(8, Math.round((window.innerWidth - el.offsetWidth) / 2)),
    top: 64,
  });

  protected readonly steps = GAME_CLOCK_STEPS;
  protected readonly modes: readonly GameClockMode[] = ['periods', 'hours'];
  protected readonly settingsOpen = signal(false);

  protected readonly buttonClass =
    'rounded-ui-sm text-ui-muted hover:bg-ui-hover hover:text-ui-text m-0 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors hover:shadow-none [&_.material-icons]:text-[18px]!';
  protected readonly fieldClass =
    'border-ui-border-panel bg-ui-input text-ui-text rounded-ui-sm box-border min-w-0 border border-solid px-1.5 py-0.5 text-[12px]';
  protected readonly modeButtonClass =
    'border-ui-border-panel bg-ui-input text-ui-muted aria-pressed:border-ui-accent aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent m-0 -ml-px cursor-pointer border border-solid px-2 py-0.5 text-[11px] first:ml-0 first:rounded-l-[3px] last:rounded-r-[3px]';

  /** The time of day on the clock, as a time field writes it. */
  protected readonly timeValue = computed(() => {
    const minutes = this.clock.clock().minutes;
    return `${`${Math.floor(minutes / 60)}`.padStart(2, '0')}:${`${minutes % 60}`.padStart(2, '0')}`;
  });

  /** The names of the parts of a day the room has set, as the field shows them; empty for the language's own. */
  protected readonly periodsValue = computed(() => this.clock.clock().periods.join(','));

  protected toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
  }

  protected setTime(value: string): void {
    const [hours, minutes] = value.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) this.clock.setMinutes(hours * 60 + minutes);
  }

  protected close(): void {
    this.widgets.gameClock.set(false);
  }
}
