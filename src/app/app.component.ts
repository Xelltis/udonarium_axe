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
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ViewModePreferenceService } from '@axe/application/ui/view-mode-preference.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { WIDGET_FAB } from '@axe/application/ui/widget-place';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { Network } from '@axe/core/network/network';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { ReloadCheck } from '@axe/domain/peer/reload-check';
import { FAB_ENTRIES, FabEntry } from '@axe/domain/ui/fab-menu';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import { AlarmEventHandlerService } from '@axe/features/alarm/alarm-event-handler.service';
import { CardStackListImageComponent } from '@axe/features/card/card-stack-list-img/card-stack-list-img.component';
import { HandDragGhostComponent } from '@axe/features/card/hand-rail/hand-drag-ghost.component';
import { HandRailComponent } from '@axe/features/card/hand-rail/hand-rail.component';
import { ChatPortraitImageComponent } from '@axe/features/chat/chat-portrait-img/chat-portrait-img.component';
import { ChatSettingsEventHandlerService } from '@axe/features/chat/chat-settings-event-handler.service';
import { ChatSoundEventHandlerService } from '@axe/features/chat/chat-sound-event-handler.service';
import { DiceChatEventHandlerService } from '@axe/features/dice/dice-chat-event-handler.service';
import { EffectChatEventHandlerService } from '@axe/features/effect/effect-chat-event-handler.service';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { NpcDragGhostComponent } from '@axe/features/gm-tools/npc-bar/npc-drag-ghost.component';
import { HotbarBarComponent } from '@axe/features/hotbar/hotbar-bar/hotbar-bar.component';
import { OverviewPanelComponent } from '@axe/features/inventory/overview-panel/overview-panel.component';
import { LanguageSelectorComponent } from '@axe/features/language-selector/language-selector.component';
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
import { ModalComponent } from '@axe/ui/components/modal/modal.component';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';
import {
  FAB_COLUMN_CLASSES,
  fabDrawerPlaceClasses,
  FabDrawerSide,
  fabDrawerSide,
  fabLabelSideClasses,
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
    VoteWidgetComponent,
    HotbarBarComponent,
    MobileShellComponent,
    RoomRestoreBannerComponent,
    ReplayStagingBannerComponent,
    ReplayIndicatorComponent,
    ReplayBoardBannerComponent,
    InviteJoinComponent,
    StreamingOverlayComponent,
    LanguageSelectorComponent,
    VisualNovelOverlayComponent,
    NgClass,
    DraggableDirective,
    WidgetPlaceDirective,
    TranslocoModule,
  ],
})
export class AppComponent {
  readonly theme = inject(ThemeService);
  readonly motion = inject(MotionService);
  readonly language = inject(LanguageService);
  readonly visualNovel = inject(VisualNovelModeService);
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
  private readonly viewMode = inject(ViewModePreferenceService);

  protected viewModeLabel(): string {
    return this.tabletop.mode2d() ? 'app.fab.viewFlat' : 'app.fab.viewPerspective';
  }

  protected toggleViewMode(): void {
    this.viewMode.choose(this.tabletop.mode2d() ? 'perspective' : 'flat');
  }

  protected readonly fabEntries = FAB_ENTRIES;

  protected chooseFab(entry: FabEntry): void {
    if (entry.action.kind === 'panel') this.open(entry.action.panel);
    else if (entry.action.kind === 'visualNovel') this.visualNovel.toggle();
  }
  isSaving = signal(false);
  progressPercent = signal(0);
  readonly themeLabel = computed(() => {
    this.language.currentLang();
    const t = this.theme.theme();
    if (t === 'dark') return this.t('common.theme.dark');
    if (t === 'light') return this.t('common.theme.light');
    return this.t('common.theme.auto');
  });
  readonly motionLabel = computed(() => {
    this.language.currentLang();
    const setting = this.motion.setting();
    if (setting === 'on') return this.t('common.motion.on');
    if (setting === 'off') return this.t('common.motion.off');
    return this.t('common.motion.auto');
  });

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
    inject(TurnOrderService);

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
ModalService.ModalComponentClass = ModalComponent;
ConfirmService.dialogComponentClass = ConfirmDialogComponent;
TooltipDirective.TooltipPanelComponentClass = OverviewPanelComponent;
