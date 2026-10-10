import { NgClass } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { LegacyScratchMaskMigrationService } from '@axe/application/tabletop/legacy-scratch-mask-migration.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { BottomSheetService } from '@axe/application/ui/bottom-sheet.service';
import { ButtonGuideService } from '@axe/application/ui/button-guide.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MenuLayoutService } from '@axe/application/ui/menu-layout.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WIDGET_FAB } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { Network } from '@axe/core/network/network';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { MENU_SURFACES } from '@axe/domain/ui/menu-command';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import { AlarmEventHandlerService } from '@axe/features/alarm/alarm-event-handler.service';
import { ButtonGuideEventHandlerService } from '@axe/features/button-guide/button-guide-event-handler.service';
import { CardStackListImageComponent } from '@axe/features/card/card-stack-list-img/card-stack-list-img.component';
import { HandDragGhostComponent } from '@axe/features/card/hand-rail/hand-drag-ghost.component';
import { HandRailComponent } from '@axe/features/card/hand-rail/hand-rail.component';
import { HandRailService } from '@axe/features/card/hand-rail/hand-rail.service';
import { ChatPortraitImageComponent } from '@axe/features/chat/chat-portrait-img/chat-portrait-img.component';
import { ChatSettingsEventHandlerService } from '@axe/features/chat/chat-settings-event-handler.service';
import { ChatSoundEventHandlerService } from '@axe/features/chat/chat-sound-event-handler.service';
import { ChatTickerComponent } from '@axe/features/chat/chat-ticker/chat-ticker.component';
import { DiceChatEventHandlerService } from '@axe/features/dice/dice-chat-event-handler.service';
import { DiceSymbolCreateDialogComponent } from '@axe/features/dice/dice-symbol-create-dialog/dice-symbol-create-dialog.component';
import { DiceThrowEventHandlerService } from '@axe/features/dice/dice-throw-event-handler.service';
import { EffectChatEventHandlerService } from '@axe/features/effect/effect-chat-event-handler.service';
import { FilesTooLargeEventHandlerService } from '@axe/features/file/files-too-large/files-too-large-event-handler.service';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { NpcDragGhostComponent } from '@axe/features/gm-tools/npc-bar/npc-drag-ghost.component';
import { HotbarBarComponent } from '@axe/features/hotbar/hotbar-bar/hotbar-bar.component';
import { InviteJoinComponent } from '@axe/features/lobby/invite-join/invite-join.component';
import { NetworkEventHandlerService } from '@axe/features/lobby/network-event-handler.service';
import { NetworkIndicatorComponent } from '@axe/features/lobby/network-indicator/network-indicator.component';
import { CutInEventHandlerService } from '@axe/features/media/cut-in-event-handler.service';
import { MiniJukeboxComponent } from '@axe/features/media/mini-jukebox/mini-jukebox.component';
import {
  isMenuGroupView,
  MenuCommandService,
  MenuEntryView,
  MenuGroupView,
  MenuNodeView,
} from '@axe/features/menu/menu-command.service';
import { MobileShellComponent } from '@axe/features/mobile/mobile-shell/mobile-shell.component';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { PlToolbarComponent } from '@axe/features/pl-tools/pl-toolbar/pl-toolbar.component';
import { ReplayBoardBannerComponent } from '@axe/features/replay/replay-board-banner/replay-board-banner.component';
import { ReplayEventHandlerService } from '@axe/features/replay/replay-event-handler.service';
import { ReplayIndicatorComponent } from '@axe/features/replay/replay-indicator/replay-indicator.component';
import { ReplayStagingBannerComponent } from '@axe/features/replay/replay-staging-banner/replay-staging-banner.component';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { RoomRestoreBannerComponent } from '@axe/features/room-archive/room-restore-banner/room-restore-banner.component';
import { StreamingOverlayComponent } from '@axe/features/streaming-overlay/streaming-overlay.component';
import { SwitchNoticeComponent } from '@axe/features/tabletop/board-switch/switch-notice.component';
import { CcfoliaRoomImportEventHandlerService } from '@axe/features/tabletop/ccfolia-room-import/ccfolia-room-import-event-handler.service';
import { FogMemoryWriterService } from '@axe/features/tabletop/fog-of-war/fog-memory-writer.service';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { ImageDropEventHandlerService } from '@axe/features/tabletop/image-drop/image-drop-event-handler.service';
import { MovePlanEventHandlerService } from '@axe/features/tabletop/table-move-range-overlay/move-plan-event-handler.service';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { VisualNovelOverlayComponent } from '@axe/features/visual-novel/visual-novel-overlay/visual-novel-overlay.component';
import { VoteEventHandlerService } from '@axe/features/vote/vote-event-handler.service';
import { VoteWidgetComponent } from '@axe/features/vote/vote-widget/vote-widget.component';
import { CompassComponent } from '@axe/features/widgets/compass/compass.component';
import { ConnectionQualityComponent } from '@axe/features/widgets/connection-quality/connection-quality.component';
import { DigitalClockComponent } from '@axe/features/widgets/digital-clock/digital-clock.component';
import { RenderStatsComponent } from '@axe/features/widgets/render-stats/render-stats.component';
import { BottomSheetComponent } from '@axe/ui/components/bottom-sheet/bottom-sheet.component';
import { ConfirmDialogComponent } from '@axe/ui/components/confirm-dialog/confirm-dialog.component';
import { ContextMenuComponent } from '@axe/ui/components/context-menu/context-menu.component';
import { UiFabSubmenuComponent } from '@axe/ui/components/fab-submenu/fab-submenu.component';
import { UiFabSubmenuButtonComponent } from '@axe/ui/components/fab-submenu/fab-submenu-button.component';
import { ModalComponent } from '@axe/ui/components/modal/modal.component';
import { SnackbarComponent } from '@axe/ui/components/snackbar/snackbar.component';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { ReloadNoticeDirective } from '@axe/ui/directives/reload-notice.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import {
  FAB_COLUMN_CLASSES,
  FAB_GUIDE_DRAWER_CLASSES,
  FAB_GUIDE_ROW_CLASSES,
  fabDrawerPlaceClasses,
  FabDrawerSide,
  fabDrawerSide,
  fabLabelSideClasses,
  fabPopoverSideClasses,
  FabSubmenuAnchor,
  fabSubmenuAnchor,
} from '@axe/ui/fab-drawer';
import { TranslocoModule } from '@jsverse/transloco';
import { version as APP_VERSION } from '@pkg';

/** How far from the corner the button starts, before anybody has put it anywhere. */
const FAB_MARGIN_PX = 12;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [
    GameTableComponent,
    NetworkIndicatorComponent,
    MiniJukeboxComponent,
    GmToolbarComponent,
    PlToolbarComponent,
    HandRailComponent,
    HandDragGhostComponent,
    NpcDragGhostComponent,
    ConnectionQualityComponent,
    RenderStatsComponent,
    DigitalClockComponent,
    CompassComponent,
    VoteWidgetComponent,
    HotbarBarComponent,
    MobileShellComponent,
    RoomRestoreBannerComponent,
    ReplayStagingBannerComponent,
    ReplayIndicatorComponent,
    ReplayBoardBannerComponent,
    InviteJoinComponent,
    StreamingOverlayComponent,
    SwitchNoticeComponent,
    SnackbarComponent,
    ChatTickerComponent,
    UiFabSubmenuComponent,
    UiFabSubmenuButtonComponent,
    VisualNovelOverlayComponent,
    NgClass,
    DraggableDirective,
    WidgetPlaceDirective,
    ReloadNoticeDirective,
    TranslocoModule,
  ],
  // The drawer opens toward whichever side of the screen has room for it, and a window that
  // changes shape can leave the button on the other side without anybody touching it.
  host: { '(window:resize)': 'measureFabSides()' },
})
export class AppComponent {
  // Built with the shell, whether or not anything shows them: each dresses the page in this
  // seat's setting as it starts, before the first screen is drawn.
  private readonly theme = inject(ThemeService);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly language = inject(LanguageService);
  readonly visualNovel = inject(VisualNovelModeService);
  private readonly handRail = inject(HandRailService);
  readonly widgets = inject(WidgetVisibilityService);
  readonly viewport = inject(ViewportService);
  readonly mobile = inject(MobileLayoutService);
  readonly overlayMode = inject(OverlayModeService);

  readonly isTableSplit = computed(() => this.mobile.isActive() && !this.visualNovel.active());
  private readonly t = inject(TRANSLATE_FN);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly saveDataService = inject(SaveDataService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);

  readonly modalLayerViewContainerRef = viewChild.required('modalLayer', { read: ViewContainerRef });

  readonly isMyselfGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  fabOpen = signal(true);

  protected readonly fabWidget = WIDGET_FAB;
  protected readonly fabFallback = () => ({ left: FAB_MARGIN_PX, top: FAB_MARGIN_PX });
  private readonly fabMenuRef = viewChild<ElementRef<HTMLElement>>('fabMenu');
  private readonly fabSide = signal<FabDrawerSide>({ up: false, left: false });

  /**
   * Where the drawer hangs from the button, which is wherever there is room for it.
   *
   * The order of what is in it never turns round with the drawer: the first thing on the
   * list is at the top whichever way it opens, so a menu learnt in one corner is the same
   * menu in another.
   */
  protected readonly fabDrawerPlace = computed(() => fabDrawerPlaceClasses(this.fabSide()));

  /** Which side of an item its name is written on, so it is never written off the screen. */
  protected readonly fabLabelSide = computed(() => fabLabelSideClasses(this.fabSide()));

  protected readonly fabColumns = FAB_COLUMN_CLASSES;

  /** Whether every button in the drawer and on the toolbars is saying what it is. */
  protected readonly guide = inject(ButtonGuideService);
  protected readonly fabGuideDrawer = FAB_GUIDE_DRAWER_CLASSES;
  protected readonly fabGuideRow = FAB_GUIDE_ROW_CLASSES;

  private readonly menuCommands = inject(MenuCommandService);
  private readonly menuLayouts = inject(MenuLayoutService);
  private readonly fabLayout = this.menuLayouts.layoutOf('fab');
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointers = inject(PointerDeviceService);
  private readonly confirm = inject(ConfirmService);

  /**
   * The way back into the menus, from the drawer's own button.
   *
   * Everything else about the drawer can be arranged away, the entry that opens the editor
   * included, and somebody who takes that one off has nothing left to put it back with. The
   * button is not part of any arrangement, so what it offers cannot be arranged away either.
   */
  protected onFabContextMenu(event: MouseEvent): void {
    if (!this.pointers.isAllowedToOpenContextMenu) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      this.pointers.pointers[0],
      [
        { name: this.t('feature.menuEditor.title'), action: () => this.open('menuEditor') },
        { name: this.t('feature.menuEditor.resetAll'), action: () => void this.resetEveryMenu() },
        { name: this.t('app.fab.buttonGuide'), action: () => this.guide.show() },
      ],
      this.t('app.fab.menuOpen')
    );
  }

  /** Puts every menu on this screen back the way it came, once whoever asked has said they mean it. */
  private async resetEveryMenu(): Promise<void> {
    if (!(await this.confirm.ask(this.t('feature.menuEditor.resetAllConfirm')))) return;
    for (const surface of MENU_SURFACES) this.menuLayouts.reset(surface);
  }

  /** The drawer as this seat is offered it, in the order this screen has it arranged. */
  protected readonly fabNodes = computed<MenuNodeView[]>(() => this.menuCommands.viewOf(this.fabLayout()));

  /** The small menu open beside the drawer, once the drawer still holds one by that name. */
  protected readonly openGroup = computed<MenuGroupView | null>(() => {
    const open = this.fabSubmenu();
    if (!open) return null;
    const node = this.fabNodes().find((held) => isMenuGroupView(held) && held.id === open);
    return node && isMenuGroupView(node) ? node : null;
  });

  protected toggleFab(): void {
    this.measureFabSides();
    this.fabOpen.set(!this.fabOpen());
    if (!this.fabOpen()) this.fabSubmenu.set(null);
  }

  /** Which of the drawer's menus is open beside it, if any; opening one closes the one before. */
  protected readonly fabSubmenu = signal<string | null>(null);

  /** Which side of the drawer they open on, which is the side with room. */
  protected readonly fabSubmenuSide = computed(() => fabPopoverSideClasses(this.fabSide()));

  private readonly zipInput = viewChild<ElementRef<HTMLInputElement>>('zipInput');

  /** Where the open menu is pinned, level with the item it was opened from. */
  protected readonly fabSubmenuPlace = signal<FabSubmenuAnchor>({ top: null, bottom: 0 });

  protected toggleFabSubmenu(kind: string, event: MouseEvent): void {
    this.measureFabSides();
    const opener = event.currentTarget;
    if (opener instanceof HTMLElement && opener.offsetParent instanceof HTMLElement) {
      const box = opener.getBoundingClientRect();
      this.fabSubmenuPlace.set(
        fabSubmenuAnchor({
          offsetTop: opener.offsetTop,
          height: opener.offsetHeight,
          drawerHeight: opener.offsetParent.clientHeight,
          centerInWindow: box.top + box.height / 2,
          windowHeight: window.innerHeight,
        })
      );
    }
    this.fabSubmenu.update((open) => (open === kind ? null : kind));
  }

  protected closeFabSubmenu(): void {
    this.fabSubmenu.set(null);
  }

  /** Saves the room from the save and load menu, which gets out of the way while the save runs. */
  protected saveFromMenu(): void {
    this.closeFabSubmenu();
    void this.save();
  }

  /** Whether this seat may put things on the table, which loading a room or a character does. */
  protected readonly canEditTabletop = computed(() => {
    this.objectChange.trackMyCursor();
    return this.rolePermission.canEditTabletop;
  });

  /** Asks for the files to load from the save and load menu, which closes as the picker opens. */
  protected chooseFilesToLoad(): void {
    this.closeFabSubmenu();
    this.zipInput()?.nativeElement.click();
  }

  /** Reads where the button has been put, which is what settles the way the drawer opens. */
  protected measureFabSides(): void {
    const element = this.fabMenuRef()?.nativeElement;
    if (!element) return;
    const box = element.getBoundingClientRect();
    if (box.width < 1 && box.height < 1) return;
    this.fabSide.set(fabDrawerSide(box, { width: window.innerWidth, height: window.innerHeight }));
  }

  protected readonly tabletop = inject(TabletopService);
  /** The ticker is drawn for the screens that asked for it, and not fetched for the rest. */
  protected readonly tickerWanted = computed(() => this.tabletop.display().multiAngleTickerEnabled);

  /**
   * Opens a small menu of the drawer, or does what one of its own entries is for.
   *
   * With every name written out, a small menu is opened the usual way once the guide is put away,
   * so whoever went looking for it sees where it lives.
   */
  protected chooseFab(node: MenuNodeView, event: MouseEvent): void {
    if (isMenuGroupView(node)) {
      this.guide.hide();
      this.toggleFabSubmenu(node.id, event);
    } else this.chooseFromFabSubmenu(node);
  }

  /** What a small menu holds, written beside it while every name is written out. */
  protected entriesOf(node: MenuNodeView): readonly MenuEntryView[] {
    return isMenuGroupView(node) ? node.entries : [];
  }

  /**
   * Does what an entry is for, and closes the menu it was in behind it, unless the entry is a
   * switch of this seat's own that is pressed in turn to see each choice.
   */
  protected chooseFromFabSubmenu(entry: MenuEntryView): void {
    if (entry.disabled) return;
    if (!entry.command.stays) this.closeFabSubmenu();
    this.menuCommands.run(entry.command);
  }

  protected readonly isGroup = isMenuGroupView;

  /**
   * What is written in the bubble beside an entry.
   *
   * A name somebody gave it wins; otherwise the command names itself, with a word in front where
   * the name alone would not say what it is. While a save runs, the one that started it counts
   * out instead.
   */
  protected fabNodeLabel(node: MenuNodeView): string {
    if (isMenuGroupView(node)) {
      if (node.id === 'saveLoad' && this.isSaving()) return `${this.progressPercent()}%`;
      return node.label ?? this.t(node.labelKey);
    }
    if (node.label) return node.label;
    const name = this.t(node.labelKey);
    return node.prefixKey ? `${this.t(node.prefixKey)}: ${name}` : name;
  }
  isSaving = signal(false);
  progressPercent = signal(0);
  constructor() {
    inject(Title).setTitle(`Udonarium Axe ${APP_VERSION}`);

    // Saving the room and asking for files to load are the screen's own to do, and the menus
    // dispatch everything else by themselves; this is the one thing they cannot reach without
    // being handed it.
    this.menuCommands.registerHost({
      save: () => this.saveFromMenu(),
      chooseFilesToLoad: () => this.chooseFilesToLoad(),
      isSaving: () => this.isSaving(),
    });

    if (new URLSearchParams(window.location.search).get('stats') === '1') this.widgets.renderStats.set(true);

    // What a small menu holds is written out beside it with the rest, so one left open would only
    // say it twice, and over the names beside it.
    effect(() => {
      if (this.guide.shown()) untracked(() => this.fabSubmenu.set(null));
    });

    // Start every feature's event handler and the application layer's orchestration services.
    // Each one subscribes from its own constructor under @Injectable({ providedIn: 'root' }),
    // so there is nothing to hold onto here — the injection is the point.
    inject(AlarmEventHandlerService);
    inject(ButtonGuideEventHandlerService);
    inject(DiceChatEventHandlerService);
    inject(DiceThrowEventHandlerService);
    inject(DiceThrowService);
    inject(ChatSettingsEventHandlerService);
    inject(ChatSoundEventHandlerService);
    inject(EffectChatEventHandlerService);
    inject(VoteEventHandlerService);
    inject(CutInEventHandlerService);
    inject(NetworkEventHandlerService);
    inject(RoomArchiveEventHandlerService);
    inject(ReplayEventHandlerService);
    inject(ImageDropEventHandlerService);
    inject(FilesTooLargeEventHandlerService);
    inject(MovePlanEventHandlerService);
    inject(CcfoliaRoomImportEventHandlerService);
    inject(FogMemoryWriterService);
    inject(CutInService);
    inject(SpeechBubbleService);
    inject(GravityService);
    inject(LegacyScratchMaskMigrationService);
    inject(TurnOrderService);
    inject(SkinService);

    const reloadNotice = inject(ReloadNoticeService);
    PanelService.loadFailureNotice = () => reloadNotice.tellReloadNeeded();
    TooltipDirective.loadTooltipPanelComponent = reloadNotice.noticingFailure(() =>
      import('@axe/features/inventory/overview-panel/overview-panel.component').then((m) => m.OverviewPanelComponent)
    );

    afterNextRender(() => {
      this.measureFabSides();
      PanelService.defaultParentViewContainerRef =
        ModalService.defaultParentViewContainerRef =
        ContextMenuService.defaultParentViewContainerRef =
          this.modalLayerViewContainerRef();
      this.roomPanels.open('peerMenu', { left: 80, top: 10 });
      if (this.viewport.isCompact()) return;

      const chatHeight = 460;
      this.roomPanels.open('chatWindow', {
        width: 660,
        height: chatHeight,
        left: 80,
        top: Math.max(10, window.innerHeight - chatHeight - 20),
      });
    });
  }

  /** The menu asks for a panel by name; where it opens and how big it is lives with the panels. */
  open(name: RoomPanelName): void {
    this.roomPanels.open(name);
  }

  /**
   * Saves the room to a file from the save button, named after the room, showing progress as it goes.
   *
   * A press while a save is already running is ignored.
   */
  async save() {
    if (this.isSaving()) return;
    this.isSaving.set(true);
    this.progressPercent.set(0);

    const roomName =
      Network.peerContext && Network.peerContext.roomName.length > 0
        ? Network.peerContext.roomName
        : this.t('app.roomDataDefault');
    await this.saveDataService.saveRoomAsync(roomName, (percent) => {
      this.progressPercent.set(percent);
    });

    setTimeout(() => {
      this.isSaving.set(false);
      this.progressPercent.set(0);
    }, 500);
  }

  /**
   * Loads the files chosen in the file picker into the room.
   *
   * Refused for a role that may not edit the tabletop. The picker is cleared either way, so the
   * same file can be chosen again.
   */
  handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!this.rolePermission.canEditTabletop) {
      input.value = '';
      return;
    }
    const files = input.files;
    const reloadCheck = this.objectStore.get<ReloadCheck>('ReloadCheck');
    reloadCheck?.reloadCheckStart(Network.peerContext.roomName != '');
    if (files && files.length) this.fileArchiver.load(files);
    input.value = '';
  }
}

PanelService.UIPanelComponentClass = UIPanelComponent;
PanelService.chatPortraitComponentClass = ChatPortraitImageComponent;
PanelService.cardStackListComponentClass = CardStackListImageComponent;
ContextMenuService.ContextMenuComponentClass = ContextMenuComponent;
ContextMenuService.loadFourWayRadialMenuComponent = () =>
  import('@axe/ui/components/four-way-radial-menu/four-way-radial-menu.component').then(
    (m) => m.FourWayRadialMenuComponent
  );
ModalService.ModalComponentClass = ModalComponent;
BottomSheetService.frameComponentClass = BottomSheetComponent;
ConfirmService.dialogComponentClass = ConfirmDialogComponent;
TabletopActionService.diceCreateDialogComponentClass = DiceSymbolCreateDialogComponent;
