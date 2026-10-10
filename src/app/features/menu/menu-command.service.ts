import { computed, inject, Injectable } from '@angular/core';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { BuffViewPreferenceService } from '@axe/application/ui/buff-view-preference.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService, MotionSetting } from '@axe/application/ui/motion.service';
import { NpcBarService } from '@axe/application/ui/npc-bar.service';
import { PieceOverlayPreferenceService } from '@axe/application/ui/piece-overlay-preference.service';
import { RenderLiteService, RenderLiteSetting } from '@axe/application/ui/render-lite.service';
import { Theme, ThemeService } from '@axe/application/ui/theme.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { BUFF_VIEW_LABEL_KEYS, type BuffViewMode } from '@axe/domain/character/buff-view-mode';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { findOrphanedOwnership } from '@axe/domain/tabletop/ownership';
import {
  isMenuCommandOffered,
  MenuActName,
  MenuCommand,
  menuCommandOf,
  MenuCustomName,
  MenuCycleName,
  MenuToggleName,
} from '@axe/domain/ui/menu-command';
import { isMenuGroup, MenuLayout, MenuNode } from '@axe/domain/ui/menu-layout';
import { nextViewMode, viewModeIcon, viewModeLabelKey } from '@axe/domain/ui/view-mode';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';

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
const BUFF_VIEW_ICONS: Readonly<Record<BuffViewMode, string>> = {
  icon: 'bubble_chart',
  detail: 'format_list_bulleted',
  count: 'tag',
};

/**
 * The two things the screen itself owns rather than any service: saving, which reports its progress
 * where the menu can show it, and the file picker, which is an element of the page.
 */
export interface MenuHostActions {
  save(): void;
  chooseFilesToLoad(): void;
  isSaving(): boolean;
}

/** How a press turned out. Anything but `done` means nothing happened. */
export type MenuRunResult = 'done' | 'notOffered' | 'unavailable' | 'noHost' | 'drawsItself';

/** One entry of a menu as it is to be drawn just now. */
export interface MenuEntryView {
  id: string;
  command: MenuCommand;
  testId: string;
  icon: string;
  /** The translation key of its name, which a switch changes as it is switched. */
  labelKey: string;
  /** What somebody called it, which is written instead of the key when it is there. */
  label: string | null;
  /** Written in front of the name with a colon, where the name alone would not say what it is. */
  prefixKey: string | null;
  /** Written in place of the mark, for the language. */
  text: string | null;
  lit: boolean | null;
  /** Whether it is drawn faintly, which a switch over the table is while it stands off. */
  dim: boolean;
  disabled: boolean;
  /** What it draws instead of a button, where it draws its own thing. */
  custom: MenuCustomName | null;
}

/** One small menu of a menu, with whatever of it this seat is offered. */
export interface MenuGroupView {
  id: string;
  /** What the tests reach its button by. */
  testId: string;
  /** What the tests reach the menu it opens by. */
  menuTestId: string;
  icon: string;
  labelKey: string;
  /** What somebody called it, which is written instead of the key when it is there. */
  label: string | null;
  entries: readonly MenuEntryView[];
}

export type MenuNodeView = MenuEntryView | MenuGroupView;

/** Whether the node drawn is a small menu rather than a single press. */
export function isMenuGroupView(node: MenuNodeView): node is MenuGroupView {
  return Array.isArray((node as MenuGroupView).entries);
}

@Injectable({ providedIn: 'root' })
export class MenuCommandService {
  private readonly roomPanels = inject(RoomPanelService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly objectStore = inject(ObjectStore);
  private readonly tabletop = inject(TabletopService);
  private readonly turnOrder = inject(TurnOrderService);
  private readonly confirm = inject(ConfirmService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly t = inject(TRANSLATE_FN);

  private readonly visualNovel = inject(VisualNovelModeService);
  private readonly handRail = inject(HandRailService);
  private readonly npcBar = inject(NpcBarService);
  private readonly overlay = inject(PieceOverlayPreferenceService);
  private readonly widgets = inject(WidgetVisibilityService);
  private readonly buttonGuide = inject(ButtonGuideService);

  private readonly viewMode = inject(ViewModePreferenceService);
  private readonly theme = inject(ThemeService);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly language = inject(LanguageService);
  private readonly buffView = inject(BuffViewPreferenceService);
  private readonly mobile = inject(MobileLayoutService);
  private readonly viewport = inject(ViewportService);

  private host: MenuHostActions | null = null;

  /** The screen hands over the two things only it can do. Called once, from the composition root. */
  registerHost(host: MenuHostActions): void {
    this.host = host;
  }

  /**
   * An arrangement as it is to be drawn just now.
   *
   * An entry naming a command this version has never heard of is left out, and so is one this seat
   * is not offered or that would mean nothing here; a small menu left with nothing in it goes with
   * them, since an empty menu is only a button that opens onto nothing.
   */
  viewOf(layout: MenuLayout): MenuNodeView[] {
    const views: MenuNodeView[] = [];
    for (const node of layout.nodes) {
      if (isMenuGroup(node)) {
        const entries = node.items
          .map((item) => this.entryView(item))
          .filter((entry): entry is MenuEntryView => entry !== null);
        if (entries.length < 1) continue;
        views.push({
          id: node.id,
          testId: node.testId ?? `fab-entry-${node.id}`,
          menuTestId: node.menuTestId ?? `fab-submenu-${node.id}`,
          icon: node.icon,
          labelKey: node.labelKey ?? '',
          label: node.label ?? null,
          entries,
        });
        continue;
      }
      const entry = this.entryView(node);
      if (entry) views.push(entry);
    }
    return views;
  }

  /**
   * The entries of an arrangement, whatever level each one sits at.
   *
   * A bar of buttons has nowhere to open a small menu on, so one that turns up in its arrangement
   * — carried in from a file, or made before a version said it could not — gives up what it holds
   * to the bar rather than taking it out of reach along with itself.
   */
  entriesOf(layout: MenuLayout): MenuEntryView[] {
    return this.viewOf(layout).flatMap((node) => (isMenuGroupView(node) ? node.entries : [node]));
  }

  private entryView(node: MenuNode): MenuEntryView | null {
    if (isMenuGroup(node)) return null;
    const command = menuCommandOf(node.command);
    if (!command) return null;
    if (!this.offers(command) || !this.isAvailable(command)) return null;
    return {
      id: node.id,
      command,
      testId: command.testId ?? `fab-entry-${command.key}`,
      icon: node.icon ?? this.iconOf(command),
      labelKey: this.labelKeyOf(command),
      label: node.label ?? null,
      prefixKey: node.label ? null : this.prefixKeyOf(command),
      text: this.textOf(command),
      lit: this.litOf(command),
      dim: command.dims === true && this.litOf(command) === false,
      disabled: this.disabledOf(command),
      custom: command.action.kind === 'custom' ? command.action.custom : null,
    };
  }

  /** What is written in front of a name that would not say what it is on its own. */
  private prefixKeyOf(command: MenuCommand): string | null {
    const action = command.action;
    if (action.kind === 'cycle' && action.cycle === 'buffView') return 'feature.plTools.buffView';
    return null;
  }

  /** This seat's role, which settles what the menus offer it. */
  readonly role = computed<PeerRole>(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole;
  });

  /** Whether this seat is offered the command at all. */
  offers(command: MenuCommand): boolean {
    return isMenuCommandOffered(command, this.role());
  }

  /**
   * Whether the command is worth drawing now.
   *
   * Only the switch to the small-screen layout answers no: it is meaningless on a screen wide
   * enough for the desktop one, or on a screen already using it.
   */
  isAvailable(command: MenuCommand): boolean {
    if (command.action.kind === 'act' && command.action.act === 'useMobileLayout') {
      return this.viewport.isCompact() && this.mobile.prefersDesktop();
    }
    return true;
  }

  /** The mark the command wears now, which for a setting is the choice it stands at. */
  iconOf(command: MenuCommand): string {
    const action = command.action;
    if (action.kind === 'cycle') {
      switch (action.cycle) {
        case 'viewMode':
          return viewModeIcon(this.viewMode.mode(), this.tabletop.mode2d());
        case 'theme':
          return THEME_ICONS[this.theme.theme()];
        case 'motion':
          return MOTION_ICONS[this.motion.setting()];
        case 'renderLite':
          return RENDER_LITE_ICONS[this.renderLite.setting()];
        case 'buffView':
          return BUFF_VIEW_ICONS[this.buffView.mode()];
        case 'language':
          return command.icon;
      }
    }
    if (action.kind === 'toggle') {
      switch (action.toggle) {
        case 'darkness':
          return this.darknessEnabled() ? 'bedtime' : 'bedtime_off';
        case 'fog':
          return this.fogEnabled() ? 'foggy' : 'filter_drama';
        case 'buffs':
          return this.overlay.buffs() ? 'auto_fix_high' : 'auto_fix_off';
        case 'speechBubbles':
          return this.overlay.speech() ? 'chat_bubble' : 'speaker_notes_off';
        default:
          return command.icon;
      }
    }
    return command.icon;
  }

  /** What the command is called now, which for a switch says which way it stands. */
  labelKeyOf(command: MenuCommand): string {
    const action = command.action;
    if (action.kind === 'cycle') {
      switch (action.cycle) {
        case 'viewMode':
          return viewModeLabelKey(this.viewMode.mode(), this.tabletop.mode2d());
        case 'theme':
          return `common.theme.${this.theme.theme()}`;
        case 'motion':
          return `common.motion.${this.motion.setting()}`;
        case 'renderLite':
          return `common.renderLite.${this.renderLite.setting()}`;
        case 'buffView':
          return BUFF_VIEW_LABEL_KEYS[this.buffView.mode()];
        case 'language':
          return command.labelKey;
      }
    }
    if (action.kind === 'toggle') {
      switch (action.toggle) {
        case 'darkness':
          return this.darknessEnabled() ? 'app.fab.darknessOn' : 'app.fab.darknessOff';
        case 'fog':
          return this.fogEnabled() ? 'app.fab.fogOn' : 'app.fab.fogOff';
        case 'resourceBars':
          return this.overlay.resourceBars() ? 'app.fab.resourceBarsShown' : 'app.fab.resourceBarsHidden';
        case 'buffs':
          return this.overlay.buffs() ? 'app.fab.buffsShown' : 'app.fab.buffsHidden';
        case 'speechBubbles':
          return this.overlay.speech() ? 'app.fab.speechShown' : 'app.fab.speechHidden';
        default:
          return command.labelKey;
      }
    }
    return command.labelKey;
  }

  /** The name written out, for the places that show text rather than a translation key. */
  labelOf(command: MenuCommand): string {
    const action = command.action;
    if (action.kind === 'cycle' && action.cycle === 'buffView') {
      return `${this.t('feature.plTools.buffView')}: ${this.t(this.labelKeyOf(command))}`;
    }
    return this.t(this.labelKeyOf(command));
  }

  /** What is written in place of a mark, for the language, which has none. */
  textOf(command: MenuCommand): string | null {
    const action = command.action;
    if (action.kind === 'cycle' && action.cycle === 'language') return this.language.currentLang().toUpperCase();
    return null;
  }

  /** Whether a switch stands on, or null for what has no off. */
  litOf(command: MenuCommand): boolean | null {
    const action = command.action;
    if (action.kind !== 'toggle') return null;
    switch (action.toggle) {
      case 'visualNovel':
        return this.visualNovel.active();
      case 'handRail':
        return this.handRail.isOpen();
      case 'darkness':
        return this.darknessEnabled();
      case 'fog':
        return this.fogEnabled();
      case 'resourceBars':
        return this.overlay.resourceBars();
      case 'buffs':
        return this.overlay.buffs();
      case 'speechBubbles':
        return this.overlay.speech();
      case 'npcBar':
        return this.npcBar.isOpen();
      case 'widgetPlToolbar':
        return this.widgets.plToolbar();
      case 'widgetGmToolbar':
        return this.widgets.gmToolbar();
      case 'widgetClock':
        return this.widgets.clock();
      case 'widgetCompass':
        return this.widgets.compass();
      case 'widgetRecording':
        return this.widgets.recording();
      case 'widgetConnectionQuality':
        return this.widgets.connectionQuality();
      case 'widgetMiniPlayer':
        return this.widgets.miniPlayer();
      case 'widgetHotbar':
        return this.widgets.hotbar();
    }
  }

  /** Whether the command cannot be pressed just now. */
  disabledOf(command: MenuCommand): boolean {
    const action = command.action;
    if (action.kind !== 'act') return false;
    if (action.act === 'save') return this.host?.isSaving() ?? false;
    if (action.act === 'zipLoad' || action.act === 'importCharacter') return !this.canEditTabletop();
    return false;
  }

  /**
   * Does what the command is for.
   *
   * The role is asked again here rather than trusted from whoever drew the button, since an
   * arrangement is stored on the screen it belongs to and a stored name proves nothing. Whatever
   * runs puts the guide to the buttons away, since it was read to find what to press, bar the one
   * that brings it out.
   */
  run(command: MenuCommand): MenuRunResult {
    if (!this.offers(command)) return 'notOffered';
    if (!this.isAvailable(command)) return 'unavailable';

    const action = command.action;
    if (action.kind !== 'act' || action.act !== 'buttonGuide') this.buttonGuide.hide();
    switch (action.kind) {
      case 'panel':
        this.roomPanels.open(action.panel);
        return 'done';
      case 'toggle':
        this.toggle(action.toggle);
        return 'done';
      case 'cycle':
        this.cycle(action.cycle);
        return 'done';
      case 'act':
        return this.act(action.act);
      case 'custom':
        return 'drawsItself';
    }
  }

  private toggle(name: MenuToggleName): void {
    switch (name) {
      case 'visualNovel':
        this.visualNovel.toggle();
        return;
      case 'handRail':
        this.handRail.toggle();
        return;
      case 'darkness':
        this.flipTable('darknessEnabled');
        return;
      case 'fog':
        this.flipTable('fogEnabled');
        return;
      case 'resourceBars':
        this.overlay.toggleResourceBars();
        return;
      case 'buffs':
        this.overlay.toggleBuffs();
        return;
      case 'speechBubbles':
        this.overlay.toggleSpeech();
        return;
      case 'npcBar':
        this.npcBar.toggle();
        return;
      case 'widgetPlToolbar':
        this.widgets.togglePlToolbar();
        return;
      case 'widgetGmToolbar':
        this.widgets.toggleGmToolbar();
        return;
      case 'widgetClock':
        this.widgets.toggleClock();
        return;
      case 'widgetCompass':
        this.widgets.toggleCompass();
        return;
      case 'widgetRecording':
        this.widgets.toggleRecording();
        return;
      case 'widgetConnectionQuality':
        this.widgets.toggleConnectionQuality();
        return;
      case 'widgetMiniPlayer':
        this.widgets.toggleMiniPlayer();
        return;
      case 'widgetHotbar':
        this.widgets.toggleHotbar();
        return;
    }
  }

  private cycle(name: MenuCycleName): void {
    switch (name) {
      case 'viewMode':
        this.viewMode.choose(nextViewMode(this.viewMode.mode()));
        return;
      case 'theme':
        this.theme.cycle();
        return;
      case 'motion':
        this.motion.cycle();
        return;
      case 'renderLite':
        this.renderLite.cycle();
        return;
      case 'language':
        void this.language.toggle();
        return;
      case 'buffView':
        this.buffView.cycle();
        return;
    }
  }

  private act(name: MenuActName): MenuRunResult {
    switch (name) {
      case 'save':
        if (!this.host) return 'noHost';
        this.host.save();
        return 'done';
      case 'zipLoad':
        if (!this.host) return 'noHost';
        this.host.chooseFilesToLoad();
        return 'done';
      case 'importCharacter':
        this.roomPanels.open('characterImport');
        return 'done';
      case 'useMobileLayout':
        this.mobile.useMobileLayout();
        return 'done';
      case 'turnNext':
        this.turnOrder.next();
        return 'done';
      case 'turnPrev':
        this.turnOrder.prev();
        return 'done';
      case 'releaseOwnership':
        void this.releaseOrphanedOwnership();
        return 'done';
      case 'buttonGuide':
        this.buttonGuide.show();
        return 'done';
    }
  }

  /** Whether this seat may put things on the table, which loading a room or a character does. */
  private readonly canEditTabletop = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  private readonly darknessEnabled = computed(() => {
    const table = this.tabletop.currentTable;
    this.objectChange.versionOf(table.identifier)();
    return table.darknessEnabled;
  });

  private readonly fogEnabled = computed(() => {
    const table = this.tabletop.currentTable;
    this.objectChange.versionOf(table.identifier)();
    return table.fogEnabled;
  });

  private flipTable(field: 'darknessEnabled' | 'fogEnabled'): void {
    const table = this.tabletop.currentTable;
    table[field] = !table[field];
    table.update();
    this.objectChange.notifyChanged(table.identifier);
  }

  private async releaseOrphanedOwnership(): Promise<void> {
    const orphaned = findOrphanedOwnership(this.objectStore.getObjects());
    if (orphaned.length === 0) return;
    if (!(await this.confirm.ask(this.t('app.fab.releaseOwnershipConfirm', { count: orphaned.length })))) return;
    for (const object of orphaned) object.owner = '';
  }
}
