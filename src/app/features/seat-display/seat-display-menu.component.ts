import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, output, Signal } from '@angular/core';
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
import { UiIconButtonComponent } from '@axe/ui/components/icon-button/icon-button.component';
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

/** One of the things floating over the table that this seat shows or hides. */
interface WidgetSwitch {
  readonly key: string;
  readonly icon: string;
  readonly labelKey: string;
  readonly shown: Signal<boolean>;
  readonly toggle: () => void;
}

/**
 * How this seat draws the table and what floats over it, opened from one button on the menu.
 *
 * Every setting here belongs to this browser alone rather than to the room. The view, the theme,
 * the effects, how heavily the table is drawn and the language are each one icon that moves on to
 * the next choice when pressed, as they did on the menu itself; the widgets are icons lit while
 * they are out. What an icon stands for, and what it is set to, is its tooltip.
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
  private readonly viewMode = inject(ViewModePreferenceService);
  protected readonly theme = inject(ThemeService);
  protected readonly motion = inject(MotionService);
  protected readonly renderLite = inject(RenderLiteService);
  protected readonly language = inject(LanguageService);
  protected readonly mobile = inject(MobileLayoutService);
  protected readonly viewport = inject(ViewportService);
  private readonly widgets = inject(WidgetVisibilityService);

  /** Asks whoever opened it to close it. */
  readonly closed = output<void>();

  protected readonly themeIcons = THEME_ICONS;
  protected readonly motionIcons = MOTION_ICONS;
  protected readonly renderLiteIcons = RENDER_LITE_ICONS;

  /** The view in force, named with what "auto" has settled on for the table in view. */
  protected readonly viewLabelKey = computed(() => viewModeLabelKey(this.viewMode.mode(), this.tabletop.mode2d()));
  protected readonly viewIcon = computed(() => viewModeIcon(this.viewMode.mode(), this.tabletop.mode2d()));

  /** The hotbar is not drawn for someone watching, so there is nothing for them to show or hide. */
  private readonly canUseHotbar = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole !== PeerRole.Guest;
  });

  protected readonly widgetSwitches = computed<readonly WidgetSwitch[]>(() => {
    const widgets = this.widgets;
    const switches: WidgetSwitch[] = [
      {
        key: 'clock',
        icon: 'schedule',
        labelKey: 'app.fab.clock',
        shown: widgets.clock,
        toggle: () => widgets.toggleClock(),
      },
      {
        key: 'recording',
        icon: 'radio_button_checked',
        labelKey: 'app.fab.recording',
        shown: widgets.recording,
        toggle: () => widgets.toggleRecording(),
      },
      {
        key: 'connectionQuality',
        icon: 'network_check',
        labelKey: 'app.fab.connectionQuality',
        shown: widgets.connectionQuality,
        toggle: () => widgets.toggleConnectionQuality(),
      },
      {
        key: 'miniPlayer',
        icon: 'play_circle',
        labelKey: 'app.fab.miniPlayer',
        shown: widgets.miniPlayer,
        toggle: () => widgets.toggleMiniPlayer(),
      },
    ];
    if (this.canUseHotbar()) {
      switches.push({
        key: 'hotbar',
        icon: 'apps',
        labelKey: 'feature.hotbar.toggle',
        shown: widgets.hotbar,
        toggle: () => widgets.toggleHotbar(),
      });
    }
    return switches;
  });

  protected cycleViewMode(): void {
    this.viewMode.choose(nextViewMode(this.viewMode.mode()));
  }

  protected cycleLanguage(): void {
    void this.language.toggle();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.host.contains(target)) return;
    if (target instanceof Element && target.closest('[data-seat-display-toggle]')) return;
    this.closed.emit();
  }
}
