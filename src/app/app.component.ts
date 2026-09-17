import { NgClass } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CutInService } from '@axe/application/media/cut-in.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { LegacyScratchMaskMigrationService } from '@axe/application/tabletop/legacy-scratch-mask-migration.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
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
import { PeerRole } from '@axe/domain/peer/peer-role';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { FAB_ENTRIES, FAB_SUBMENUS, FabEntry, FabSubmenuName } from '@axe/domain/ui/fab-menu';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import { AlarmEventHandlerService } from '@axe/features/alarm/alarm-event-handler.service';
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
import { EffectChatEventHandlerService } from '@axe/features/effect/effect-chat-event-handler.service';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { NpcDragGhostComponent } from '@axe/features/gm-tools/npc-bar/npc-drag-ghost.component';
import { HotbarBarComponent } from '@axe/features/hotbar/hotbar-bar/hotbar-bar.component';
import { InviteJoinComponent } from '@axe/features/lobby/invite-join/invite-join.component';
import { NetworkEventHandlerService } from '@axe/features/lobby/network-event-handler.service';
import { NetworkIndicatorComponent } from '@axe/features/lobby/network-indicator/network-indicator.component';
import { CutInEventHandlerService } from '@axe/features/media/cut-in-event-handler.service';
import { MiniJukeboxComponent } from '@axe/features/media/mini-jukebox/mini-jukebox.component';
import { MobileShellComponent } from '@axe/features/mobile/mobile-shell/mobile-shell.component';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { PlToolbarComponent } from '@axe/features/pl-tools/pl-toolbar/pl-toolbar.component';
import { ReplayBoardBannerComponent } from '@axe/features/replay/replay-board-banner/replay-board-banner.component';
import { ReplayEventHandlerService } from '@axe/features/replay/replay-event-handler.service';
import { ReplayIndicatorComponent } from '@axe/features/replay/replay-indicator/replay-indicator.component';
import { ReplayStagingBannerComponent } from '@axe/features/replay/replay-staging-banner/replay-staging-banner.component';
import { RoomArchiveEventHandlerService } from '@axe/features/room-archive/room-archive-event-handler.service';
import { RoomRestoreBannerComponent } from '@axe/features/room-archive/room-restore-banner/room-restore-banner.component';
import { SeatDisplayMenuComponent, SeatMenuKind } from '@axe/features/seat-display/seat-display-menu.component';
import { StreamingOverlayComponent } from '@axe/features/streaming-overlay/streaming-overlay.component';
import { CcfoliaRoomImportEventHandlerService } from '@axe/features/tabletop/ccfolia-room-import/ccfolia-room-import-event-handler.service';
import { FogMemoryWriterService } from '@axe/features/tabletop/fog-of-war/fog-memory-writer.service';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { ImageDropEventHandlerService } from '@axe/features/tabletop/image-drop/image-drop-event-handler.service';
import { MovePlanEventHandlerService } from '@axe/features/tabletop/table-move-range-overlay/move-plan-event-handler.service';
import { VisualNovelModeService } from '@axe/features/visual-novel/visual-novel-mode.service';
import { VisualNovelOverlayComponent } from '@axe/features/visual-novel/visual-novel-overlay/visual-novel-overlay.component';
import { VoteEventHandlerService } from '@axe/features/vote/vote-event-handler.service';
import { VoteWidgetComponent } from '@axe/features/vote/vote-widget/vote-widget.component';
import { ConnectionQualityComponent } from '@axe/features/widgets/connection-quality/connection-quality.component';
import { DigitalClockComponent } from '@axe/features/widgets/digital-clock/digital-clock.component';
import { RenderStatsComponent } from '@axe/features/widgets/render-stats/render-stats.component';
import { ConfirmDialogComponent } from '@axe/ui/components/confirm-dialog/confirm-dialog.component';
import { ContextMenuComponent } from '@axe/ui/components/context-menu/context-menu.component';
import { UiFabSubmenuComponent } from '@axe/ui/components/fab-submenu/fab-submenu.component';
import { UiFabSubmenuButtonComponent } from '@axe/ui/components/fab-submenu/fab-submenu-button.component';
import { ModalComponent } from '@axe/ui/components/modal/modal.component';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { ReloadNoticeDirective } from '@axe/ui/directives/reload-notice.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import {
  FAB_COLUMN_CLASSES,
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

/** The small menus opened beside the drawer: those of its entries, saving and loading, the widgets, and this seat's display. */
type FabSubmenuKind = FabSubmenuName | 'saveLoad' | SeatMenuKind;

interface FabSubmenuOpener {
  readonly kind: FabSubmenuKind;
  readonly icon: string;
  readonly labelKey: string;
  readonly testId: string;
}

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
    VoteWidgetComponent,
    HotbarBarComponent,
    MobileShellComponent,
    RoomRestoreBannerComponent,
    ReplayStagingBannerComponent,
    ReplayIndicatorComponent,
    ReplayBoardBannerComponent,
    InviteJoinComponent,
    StreamingOverlayComponent,
    ChatTickerComponent,
    SeatDisplayMenuComponent,
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

  protected toggleFab(): void {
    this.measureFabSides();
    this.fabOpen.set(!this.fabOpen());
    if (!this.fabOpen()) this.fabSubmenu.set(null);
  }

  /** The buttons at the foot of the drawer, each opening a small menu of its own beside it. */
  protected readonly fabSubmenuOpeners: readonly FabSubmenuOpener[] = [
    { kind: 'saveLoad', icon: 'sd_storage', labelKey: 'app.fab.saveLoad', testId: 'fab-save-load' },
    { kind: 'widgets', icon: 'widgets', labelKey: 'app.fab.widgets', testId: 'fab-widgets' },
    { kind: 'display', icon: 'display_settings', labelKey: 'app.fab.display', testId: 'fab-display' },
  ];

  /** Which of the drawer's menus is open beside it, if any; opening one closes the one before. */
  protected readonly fabSubmenu = signal<FabSubmenuKind | null>(null);

  /** Which side of the drawer they open on, which is the side with room. */
  protected readonly fabSubmenuSide = computed(() => fabPopoverSideClasses(this.fabSide()));

  private readonly zipInput = viewChild<ElementRef<HTMLInputElement>>('zipInput');

  /** Where the open menu is pinned, level with the item it was opened from. */
  protected readonly fabSubmenuPlace = signal<FabSubmenuAnchor>({ top: null, bottom: 0 });

  protected toggleFabSubmenu(kind: FabSubmenuKind, event: MouseEvent): void {
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

  /** Opens character import from the save and load menu, a shortcut to the one in the room settings. */
  protected importCharacterFromMenu(): void {
    this.closeFabSubmenu();
    this.open('characterImport');
  }

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

  protected readonly fabEntries = FAB_ENTRIES;

  private readonly myRole = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.myRole;
  });

  /** What each small menu of the drawer offers this seat, by who each entry is for. */
  protected readonly fabSubmenuEntries = computed<Readonly<Record<FabSubmenuName, readonly FabEntry[]>>>(() => {
    const role = this.myRole();
    const offered = (entries: readonly FabEntry[]) =>
      entries.filter(
        (entry) =>
          !entry.audience || (entry.audience === 'gameMaster' ? role === PeerRole.GameMaster : role !== PeerRole.Guest)
      );
    return {
      table: offered(FAB_SUBMENUS.table),
      gameResources: offered(FAB_SUBMENUS.gameResources),
      media: offered(FAB_SUBMENUS.media),
    };
  });

  /** Whether an entry of a small menu is on, for those switched on and off rather than opened. */
  protected fabEntryLit(entry: FabEntry): boolean | null {
    if (entry.action.kind === 'visualNovel') return this.visualNovel.active();
    if (entry.action.kind === 'handRail') return this.handRail.isOpen();
    return null;
  }

  protected chooseFab(entry: FabEntry, event: MouseEvent): void {
    if (entry.action.kind === 'submenu') this.toggleFabSubmenu(entry.action.submenu, event);
    else this.chooseFromFabSubmenu(entry);
  }

  /** Does what an entry of a small menu is for, and closes the menu behind it. */
  protected chooseFromFabSubmenu(entry: FabEntry): void {
    this.closeFabSubmenu();
    if (entry.action.kind === 'panel') this.open(entry.action.panel);
    else if (entry.action.kind === 'visualNovel') this.visualNovel.toggle();
    else if (entry.action.kind === 'handRail') this.handRail.toggle();
  }
  isSaving = signal(false);
  progressPercent = signal(0);
  constructor() {
    inject(Title).setTitle(`Udonarium Axe ${APP_VERSION}`);

    if (new URLSearchParams(window.location.search).get('stats') === '1') this.widgets.renderStats.set(true);

    // Start every feature's event handler and the application layer's orchestration services.
    // Each one subscribes from its own constructor under @Injectable({ providedIn: 'root' }),
    // so there is nothing to hold onto here — the injection is the point.
    inject(AlarmEventHandlerService);
    inject(DiceChatEventHandlerService);
    inject(ChatSettingsEventHandlerService);
    inject(ChatSoundEventHandlerService);
    inject(EffectChatEventHandlerService);
    inject(VoteEventHandlerService);
    inject(CutInEventHandlerService);
    inject(NetworkEventHandlerService);
    inject(RoomArchiveEventHandlerService);
    inject(ReplayEventHandlerService);
    inject(ImageDropEventHandlerService);
    inject(MovePlanEventHandlerService);
    inject(CcfoliaRoomImportEventHandlerService);
    inject(FogMemoryWriterService);
    inject(CutInService);
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
ConfirmService.dialogComponentClass = ConfirmDialogComponent;
TabletopActionService.diceCreateDialogComponentClass = DiceSymbolCreateDialogComponent;
