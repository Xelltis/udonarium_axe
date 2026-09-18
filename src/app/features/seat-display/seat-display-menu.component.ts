import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
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
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { UiFabSubmenuComponent } from '@axe/ui/components/fab-submenu/fab-submenu.component';
import { UiFabSubmenuButtonComponent } from '@axe/ui/components/fab-submenu/fab-submenu-button.component';
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
  readonly icon: string | null;
  /** Written in place of an icon, for the language, which has none. */
  readonly text?: string;
  readonly labelKey: string;
  /** Whether a widget is out; left out for a setting, which has no off. */
  readonly lit?: boolean;
  readonly press: () => void;
}

/**
 * Which of this seat's menus is open beside the drawer: how the table is drawn, or what floats
 * over it.
 */
export type SeatMenuKind = 'display' | 'widgets';

/**
 * How this seat draws the table, or what floats over it, opened from its own button on the menu.
 *
 * Everything here belongs to this browser alone rather than to the room. On the display menu the
 * view, the theme, the effects, how heavily the table is drawn and the language are each one icon
 * that moves on to the next choice when pressed, as they did on the menu itself, and the skin opens
 * its own panel; on the widget menu each widget is an icon lit while it is out. What an icon stands for, and what it is set to,
 * is written in the bubble beside it.
 *
 * It closes the way every menu beside the drawer does: on a press outside it, or Escape.
 */
@Component({
  selector: 'app-seat-display-menu',
  templateUrl: './seat-display-menu.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule, UiFabSubmenuComponent, UiFabSubmenuButtonComponent],
})
export class SeatDisplayMenuComponent {
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
  private readonly roomPanels = inject(RoomPanelService);

  /** Which of the two menus this is. */
  readonly kind = input.required<SeatMenuKind>();

  /** Asks whoever opened it to close it. */
  readonly closed = output<void>();

  protected readonly labelKey = computed(() =>
    this.kind() === 'widgets' ? 'feature.seatDisplay.widgets.label' : 'feature.seatDisplay.title'
  );

  /**
   * This seat's role, which settles which toolbar it has and whether it has a hotbar; someone
   * watching has neither, so there is nothing for them to show or hide.
   */
  private readonly role = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole;
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
        testId: 'seat-skin',
        icon: 'palette',
        labelKey: 'app.fab.skin',
        press: () => this.openSkins(),
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
        icon: null,
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
    const role = this.role();
    const buttons: SeatButton[] = [];
    if (role === PeerRole.Player) {
      buttons.push({
        testId: 'seat-widget-plToolbar',
        icon: 'person',
        labelKey: 'app.fab.plTools',
        lit: widgets.plToolbar(),
        press: () => widgets.togglePlToolbar(),
      });
    }
    if (role === PeerRole.GameMaster) {
      buttons.push({
        testId: 'seat-widget-gmToolbar',
        icon: 'shield',
        labelKey: 'app.fab.gmTools',
        lit: widgets.gmToolbar(),
        press: () => widgets.toggleGmToolbar(),
      });
    }
    buttons.push(
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
      }
    );
    if (role !== PeerRole.Guest) {
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

  protected readonly buttons = computed(() =>
    this.kind() === 'widgets' ? this.widgetButtons() : this.settingButtons()
  );

  /** Opens the skins, and closes the menu behind them. */
  private openSkins(): void {
    this.closed.emit();
    this.roomPanels.open('skin');
  }

  private cycleViewMode(): void {
    this.viewMode.choose(nextViewMode(this.viewMode.mode()));
  }
}
