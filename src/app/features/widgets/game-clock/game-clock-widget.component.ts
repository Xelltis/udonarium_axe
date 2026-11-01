import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GameClockService } from '@axe/application/game-clock/game-clock.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { WIDGET_GAME_CLOCK } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import {
  dayFractionOf,
  evenDayFractionOf,
  formatGameClockTime,
  GAME_CLOCK_SKY_HOURS,
  GAME_CLOCK_STEPS,
  type GameClockMode,
  periodIndexOf,
} from '@axe/domain/game-clock/game-clock';
import { clockSky, SKY_ARC, SKY_HEIGHT, SKY_STARS, SKY_WIDTH } from '@axe/features/widgets/game-clock/clock-sky';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** How many skies have been drawn on the page, for each to name its colours apart from another's. */
let skiesDrawn = 0;

/** How long the sky takes to move on to a new hour. */
const SKY_MOVE_MS = 700;

/**
 * The time the room keeps in its story, as a widget each seat shows or hides for itself: the day
 * and the hour of it written over a sky of that hour, the sun or the moon crossing it, which the
 * game master steps on and back from a bar under it and sets up below.
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
  protected readonly skyId = `game-clock-sky-${++skiesDrawn}`;
  protected readonly skyWidth = SKY_WIDTH;
  protected readonly skyHeight = SKY_HEIGHT;
  protected readonly skyArc = SKY_ARC;
  protected readonly stars = SKY_STARS;

  private readonly motion = inject(MotionService);
  /** How far through the day the clock stands. */
  private readonly dayFraction = computed(() =>
    dayFractionOf(this.clock.clock(), this.clock.periods().length, this.clock.skies())
  );
  /**
   * How far through the day the sky is drawn, counted on past a whole day rather than back to 0: it
   * moves on to the clock's over a moment, frame by frame and always forward, so that the sun and
   * the moon go along their arc from east to west and round under it, never back. It goes there at
   * once where the seat keeps the screen still. Null until the sky is first drawn.
   */
  private readonly shownFraction = signal<number | null>(null);
  private skyFrame = 0;

  /** The sky of the hour the clock stands at, or is moving on to. */
  protected readonly sky = computed(() => clockSky(this.shownFraction() ?? this.dayFraction()));

  constructor() {
    effect(() => {
      const fraction = this.dayFraction();
      untracked(() => this.moveSkyTo(fraction));
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.skyFrame));
  }

  /** Which part of the day the clock stands in, as the set-up picks it. */
  protected readonly periodIndex = computed(() => periodIndexOf(this.clock.clock(), this.clock.periods().length));

  /** A mark for each part of the day, the one the clock stands in lit. */
  protected readonly periodMarks = computed(() => {
    const periods = this.clock.periods();
    const at = periodIndexOf(this.clock.clock(), periods.length);
    return periods.map((_, index) => index === at);
  });

  /** The part of the day a step on goes to, the first of the next day after the last. */
  protected readonly nextPeriod = computed(() => {
    const periods = this.clock.periods();
    const at = periodIndexOf(this.clock.clock(), periods.length);
    return periods[(at + 1) % Math.max(1, periods.length)] ?? '';
  });
  protected readonly modes: readonly GameClockMode[] = ['periods', 'hours'];
  protected readonly settingsOpen = signal(false);

  protected readonly buttonClass =
    'rounded-ui-sm text-ui-muted hover:bg-ui-hover hover:text-ui-text m-0 inline-flex size-7 shrink-0 cursor-pointer items-center justify-center border-none bg-transparent p-0 transition-colors hover:shadow-none [&_.material-icons]:text-[18px]!';
  protected readonly fieldClass =
    'border-ui-border-panel bg-ui-input text-ui-text rounded-ui-sm box-border min-w-0 border border-solid px-1.5 py-0.5 text-[12px]';
  protected readonly modeButtonClass =
    'border-ui-border-panel bg-ui-input text-ui-muted aria-pressed:border-ui-accent aria-pressed:bg-ui-accent-bg aria-pressed:text-ui-accent m-0 -ml-px cursor-pointer border border-solid px-2 py-0.5 text-[11px] first:ml-0 first:rounded-l-[3px] last:rounded-r-[3px]';

  /** The time of day on the clock, as a time field writes it. */
  protected readonly timeValue = computed(() => formatGameClockTime({ ...this.clock.clock(), mode: 'hours' }, []));

  protected readonly skyHours = GAME_CLOCK_SKY_HOURS;

  /**
   * Each part of the day with the hour its sky is drawn at, null where it is laid evenly, and the
   * hour it falls at laid evenly, which the choice of that says.
   */
  protected readonly periodSkies = computed(() => {
    const periods = this.clock.periods();
    const skies = this.clock.skies();
    return periods.map((name, index) => ({
      name,
      hour: skies[index] ?? null,
      evenHour: Math.round(evenDayFractionOf(index, periods.length) * 24) % 24,
    }));
  });

  /** The names of the parts of a day the room has set, as the field shows them; empty for the language's own. */
  protected readonly periodsValue = computed(() => this.clock.clock().periods.join(','));

  protected toggleSettings(): void {
    this.settingsOpen.update((open) => !open);
  }

  /**
   * Sets the day a field was changed to, and shows in the field the day the clock keeps, which a
   * field bound one way would not where the clock kept to its bounds and so stayed as it was.
   */
  protected changeDay(field: HTMLInputElement): void {
    if (field.value.trim().length > 0) this.clock.setDay(+field.value);
    field.value = `${this.clock.clock().day}`;
  }

  /** Names the parts of a day as a field was changed to, and shows in it the names as the clock tidied them. */
  protected changePeriods(field: HTMLInputElement): void {
    this.clock.setPeriods(field.value);
    field.value = this.periodsValue();
  }

  /** Sets the time of day a field was changed to, and shows in it the time the clock keeps. */
  protected changeTime(field: HTMLInputElement): void {
    const [hours, minutes] = field.value.split(':').map(Number);
    if (Number.isFinite(hours) && Number.isFinite(minutes)) this.clock.setMinutes(hours * 60 + minutes);
    field.value = this.timeValue();
  }

  /** Sets how the day is written as a field was changed to, and shows in it the form the clock keeps. */
  protected changeDayFormat(field: HTMLInputElement): void {
    this.clock.setDayFormat(field.value);
    field.value = this.clock.clock().dayFormat;
  }

  protected close(): void {
    this.widgets.gameClock.set(false);
  }

  /** Moves the sky on to a share of the day, from where it is drawn, as {@link shownFraction} says. */
  private moveSkyTo(fraction: number): void {
    cancelAnimationFrame(this.skyFrame);
    const from = this.shownFraction();
    if (from === null || !this.motion.enabled()) {
      this.shownFraction.set(fraction);
      return;
    }
    const ahead = (((fraction - from) % 1) + 1) % 1;
    let start: number | null = null;
    const frame = (now: number) => {
      start ??= now;
      const done = Math.min(1, (now - start) / SKY_MOVE_MS);
      this.shownFraction.set(from + ahead * (1 - (1 - done) ** 3));
      if (done < 1) this.skyFrame = requestAnimationFrame(frame);
    };
    if (ahead > 0) this.skyFrame = requestAnimationFrame(frame);
  }
}
