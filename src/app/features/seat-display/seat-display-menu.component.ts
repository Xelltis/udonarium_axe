import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output, Signal } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import { SUPPORTED_LANGS, SupportedLang } from '@axe/application/i18n/transloco.config';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService, MotionSetting } from '@axe/application/ui/motion.service';
import { RenderLiteService, RenderLiteSetting } from '@axe/application/ui/render-lite.service';
import { Theme, ThemeService } from '@axe/application/ui/theme.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { VIEW_MODES, ViewMode } from '@axe/domain/ui/view-mode';
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
import { TranslocoModule } from '@jsverse/transloco';

const THEMES: readonly Theme[] = ['auto', 'dark', 'light'];
const MOTION_SETTINGS: readonly MotionSetting[] = ['auto', 'on', 'off'];
const RENDER_LITE_SETTINGS: readonly RenderLiteSetting[] = ['auto', 'on', 'off'];

/** One of the things floating over the table that this seat shows or hides. */
interface WidgetSwitch {
  readonly key: string;
  readonly labelKey: string;
  readonly shown: Signal<boolean>;
  readonly toggle: () => void;
}

/**
 * How this seat draws the table and what floats over it, in one place.
 *
 * Every setting here belongs to this browser alone rather than to the room: the view, the theme,
 * the effects, how heavily the table is drawn, the language and the widgets. Each is laid out as
 * its choices side by side with the one in force marked, so what is chosen can be read without
 * pressing anything.
 *
 * A press anywhere outside it, or Escape, asks for it to be closed. A press on whatever opens it
 * is left to that, which marks itself with `data-seat-display-toggle`.
 */
@Component({
  selector: 'app-seat-display-menu',
  templateUrl: './seat-display-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, UiIconButtonComponent],
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class SeatDisplayMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  protected readonly viewMode = inject(ViewModePreferenceService);
  protected readonly theme = inject(ThemeService);
  protected readonly motion = inject(MotionService);
  protected readonly renderLite = inject(RenderLiteService);
  protected readonly language = inject(LanguageService);
  protected readonly mobile = inject(MobileLayoutService);
  protected readonly viewport = inject(ViewportService);
  private readonly widgets = inject(WidgetVisibilityService);

  /** Asks whoever opened it to close it. */
  readonly closed = output<void>();

  protected readonly viewModes = VIEW_MODES;
  protected readonly themes = THEMES;
  protected readonly motionSettings = MOTION_SETTINGS;
  protected readonly renderLiteSettings = RENDER_LITE_SETTINGS;
  protected readonly langs = SUPPORTED_LANGS;

  /** What "auto" has settled on for the table in view, said beside it. */
  protected readonly autoViewKey = computed(() =>
    this.tabletop.recommendsFlat() ? 'feature.seatDisplay.view.nowFlat' : 'feature.seatDisplay.view.nowPerspective'
  );

  /** The hotbar is not drawn for someone watching, so there is nothing for them to show or hide. */
  private readonly canUseHotbar = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole !== PeerRole.Guest;
  });

  protected readonly widgetSwitches = computed<readonly WidgetSwitch[]>(() => {
    const widgets = this.widgets;
    const switches: WidgetSwitch[] = [
      { key: 'clock', labelKey: 'app.fab.clock', shown: widgets.clock, toggle: () => widgets.toggleClock() },
      {
        key: 'recording',
        labelKey: 'app.fab.recording',
        shown: widgets.recording,
        toggle: () => widgets.toggleRecording(),
      },
      {
        key: 'connectionQuality',
        labelKey: 'app.fab.connectionQuality',
        shown: widgets.connectionQuality,
        toggle: () => widgets.toggleConnectionQuality(),
      },
      {
        key: 'miniPlayer',
        labelKey: 'app.fab.miniPlayer',
        shown: widgets.miniPlayer,
        toggle: () => widgets.toggleMiniPlayer(),
      },
    ];
    if (this.canUseHotbar()) {
      switches.push({
        key: 'hotbar',
        labelKey: 'feature.hotbar.toggle',
        shown: widgets.hotbar,
        toggle: () => widgets.toggleHotbar(),
      });
    }
    return switches;
  });

  protected chooseViewMode(mode: ViewMode): void {
    this.viewMode.choose(mode);
  }

  protected chooseTheme(theme: Theme): void {
    this.theme.theme.set(theme);
  }

  protected chooseLanguage(lang: SupportedLang): void {
    void this.language.setLang(lang);
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.host.contains(target)) return;
    if (target instanceof Element && target.closest('[data-seat-display-toggle]')) return;
    this.closed.emit();
  }
}
