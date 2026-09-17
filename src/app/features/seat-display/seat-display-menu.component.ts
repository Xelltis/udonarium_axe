import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
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
import { nextViewMode, viewModeIcon, viewModeLabelKey } from '@axe/domain/ui/view-mode';
import { TranslocoModule } from '@jsverse/transloco';

const THEME_ICONS: Readonly<Record<Theme, string>> = {
  auto: 'brightness_auto',
  dark: 'dark_mode',
  light: 'light_mode',
};
const MOTION_ICONS: Readonly<Record<MotionSetting, string>> = {
  auto: 'motion_photos_auto',
  on: 'motion_photos_on',
  off: 'motion_photos_off',
};
const RENDER_LITE_ICONS: Readonly<Record<RenderLiteSetting, string>> = {
  auto: 'blur_circular',
  on: 'blur_off',
  off: 'blur_on',
};

/** One press in the panel: a setting that moves on to its next choice, or a widget shown or hidden. */
interface SeatButton {
  readonly testId: string;
  readonly icon: string;
  /** Written in place of an icon, for the language, which has none. */
  readonly text?: string;
  readonly labelKey: string;
  /** Whether a widget is out; left out for a setting, which has no off. */
  readonly lit?: boolean;
  readonly press: () => void;
}

/** The buttons of one kind, set apart from the kind before. */
interface SeatButtonGroup {
  readonly key: 'settings' | 'widgets';
  readonly labelKey: string | null;
  readonly buttons: readonly SeatButton[];
}

/**
 * How this seat draws the table and what floats over it, opened from one button on the menu.
 *
 * Every setting here belongs to this browser alone rather than to the room. The view, the theme,
 * the effects, how heavily the table is drawn and the language are each one icon that moves on to
 * the next choice when pressed, as they did on the menu itself; the widgets are icons lit while
 * they are out. What an icon stands for, and what it is set to, is written beside it on hover the
 * way the menu names its own items, so it shows at once and turns to whichever side the menu does.
 *
 * A press anywhere outside it, or Escape, asks for it to be closed. A press on whatever opens it
 * is left to that, which marks itself with `data-seat-display-toggle`.
 */
@Component({
  selector: 'app-seat-display-menu',
  templateUrl: './seat-display-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
  host: {
    '(document:keydown.escape)': 'closed.emit()',
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
  },
})
export class SeatDisplayMenuComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly tabletop = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly theme = inject(ThemeService);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly language = inject(LanguageService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly viewport = inject(ViewportService);
  private readonly widgets = inject(WidgetVisibilityService);

  /** Asks whoever opened it to close it. */
  readonly closed = output<void>();

  /** The hotbar is not drawn for someone watching, so there is nothing for them to show or hide. */
  private readonly canUseHotbar = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole !== PeerRole.Guest;
  });

  private readonly settingButtons = computed<readonly SeatButton[]>(() => {
    const mode = this.viewMode.mode();
    const laysFlat = this.tabletop.mode2d();
    const theme = this.theme.theme();
    const motion = this.motion.setting();
    const renderLite = this.renderLite.setting();
    const buttons: SeatButton[] = [
      {
        testId: 'seat-view',
        icon: viewModeIcon(mode, laysFlat),
        labelKey: viewModeLabelKey(mode, laysFlat),
        press: () => this.cycleViewMode(),
      },
      {
        testId: 'seat-theme',
        icon: THEME_ICONS[theme],
        labelKey: `common.theme.${theme}`,
        press: () => this.theme.cycle(),
      },
      {
        testId: 'seat-motion',
        icon: MOTION_ICONS[motion],
        labelKey: `common.motion.${motion}`,
        press: () => this.motion.cycle(),
      },
      {
        testId: 'seat-render-lite',
        icon: RENDER_LITE_ICONS[renderLite],
        labelKey: `common.renderLite.${renderLite}`,
        press: () => this.renderLite.cycle(),
      },
      {
        testId: 'seat-lang',
        icon: '',
        text: this.language.currentLang().toUpperCase(),
        labelKey: 'common.language.switchTooltip',
        press: () => void this.language.toggle(),
      },
    ];
    if (this.viewport.isCompact() && this.mobile.prefersDesktop()) {
      buttons.push({
        testId: 'seat-use-mobile',
        icon: 'smartphone',
        labelKey: 'feature.mobile.useMobile',
        press: () => this.mobile.useMobileLayout(),
      });
    }
    return buttons;
  });

  private readonly widgetButtons = computed<readonly SeatButton[]>(() => {
    const widgets = this.widgets;
    const buttons: SeatButton[] = [
      {
        testId: 'seat-widget-clock',
        icon: 'schedule',
        labelKey: 'app.fab.clock',
        lit: widgets.clock(),
        press: () => widgets.toggleClock(),
      },
      {
        testId: 'seat-widget-recording',
        icon: 'radio_button_checked',
        labelKey: 'app.fab.recording',
        lit: widgets.recording(),
        press: () => widgets.toggleRecording(),
      },
      {
        testId: 'seat-widget-connectionQuality',
        icon: 'network_check',
        labelKey: 'app.fab.connectionQuality',
        lit: widgets.connectionQuality(),
        press: () => widgets.toggleConnectionQuality(),
      },
      {
        testId: 'seat-widget-miniPlayer',
        icon: 'play_circle',
        labelKey: 'app.fab.miniPlayer',
        lit: widgets.miniPlayer(),
        press: () => widgets.toggleMiniPlayer(),
      },
    ];
    if (this.canUseHotbar()) {
      buttons.push({
        testId: 'seat-widget-hotbar',
        icon: 'apps',
        labelKey: 'feature.hotbar.toggle',
        lit: widgets.hotbar(),
        press: () => widgets.toggleHotbar(),
      });
    }
    return buttons;
  });

  protected readonly groups = computed<readonly SeatButtonGroup[]>(() => [
    { key: 'settings', labelKey: null, buttons: this.settingButtons() },
    { key: 'widgets', labelKey: 'feature.seatDisplay.widgets.label', buttons: this.widgetButtons() },
  ]);

  private cycleViewMode(): void {
    this.viewMode.choose(nextViewMode(this.viewMode.mode()));
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.host.contains(target)) return;
    if (target instanceof Element && target.closest('[data-seat-display-toggle]')) return;
    this.closed.emit();
  }
}
