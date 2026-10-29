import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { HandRailService } from '@axe/application/card/hand-rail.service';
import { ChatFontService } from '@axe/application/chat/chat-font.service';
import { SpeechBubbleService } from '@axe/application/chat/speech-bubble.service';
import { DiceThrowService } from '@axe/application/dice/dice-throw.service';
import { LanguageService } from '@axe/application/i18n/language.service';
import { AudioAnalysisService } from '@axe/application/media/audio-analysis.service';
import { CutInService } from '@axe/application/media/cut-in.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { GravityService } from '@axe/application/tabletop/gravity.service';
import { LegacyScratchMaskMigrationService } from '@axe/application/tabletop/legacy-scratch-mask-migration.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TurnOrderService } from '@axe/application/turn/turn-order.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { LOAD_FAILURE_NOTICE } from '@axe/application/ui/overlay-components';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { OverlayModeService } from '@axe/application/ui/overlay-mode.service';
import type { PanelOption } from '@axe/application/ui/panel.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { SkinService } from '@axe/application/ui/skin.service';
import { ThemeService } from '@axe/application/ui/theme.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { VisualNovelModeService } from '@axe/application/ui/visual-novel-mode.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ObjectStore } from '@axe/core/sync/object-store';
import { RoomPanelName } from '@axe/domain/ui/room-panel';
import type { Vote } from '@axe/domain/vote/vote';
import { AlarmEventHandlerService } from '@axe/features/alarm/alarm-event-handler.service';
import { BattleChatEventHandlerService } from '@axe/features/battle-cut-in/battle-chat-event-handler.service';
import { BattleCutInEventHandlerService } from '@axe/features/battle-cut-in/battle-cut-in-event-handler.service';
import { BattleCutInOverlayComponent } from '@axe/features/battle-cut-in/battle-cut-in-overlay/battle-cut-in-overlay.component';
import { BattleCutInStateService } from '@axe/features/battle-cut-in/battle-cut-in-state.service';
import { ButtonGuideEventHandlerService } from '@axe/features/button-guide/button-guide-event-handler.service';
import { CardEventHandlerService } from '@axe/features/card/card-event-handler.service';
import { HandDragGhostComponent } from '@axe/features/card/hand-rail/hand-drag-ghost.component';
import { HandRailComponent } from '@axe/features/card/hand-rail/hand-rail.component';
import { CcfoliaRoomImportEventHandlerService } from '@axe/features/ccfolia-room-import/ccfolia-room-import-event-handler.service';
import { ChatSettingsEventHandlerService } from '@axe/features/chat/chat-settings-event-handler.service';
import { ChatSoundEventHandlerService } from '@axe/features/chat/chat-sound-event-handler.service';
import { ChatTickerComponent } from '@axe/features/chat/chat-ticker/chat-ticker.component';
import { DiceChatEventHandlerService } from '@axe/features/dice/dice-chat-event-handler.service';
import { DiceThrowEventHandlerService } from '@axe/features/dice/dice-throw-event-handler.service';
import { EffectChatEventHandlerService } from '@axe/features/effect/effect-chat-event-handler.service';
import { AssetRemovalEventHandlerService } from '@axe/features/file/asset-removal-event-handler.service';
import { FilesTooLargeEventHandlerService } from '@axe/features/file/files-too-large/files-too-large-event-handler.service';
import { FirstPersonViewComponent } from '@axe/features/first-person/first-person-view/first-person-view.component';
import { GmToolbarComponent } from '@axe/features/gm-tools/gm-toolbar/gm-toolbar.component';
import { GpuNoticeComponent } from '@axe/features/gpu-notice/gpu-notice.component';
import { HotbarBarComponent } from '@axe/features/hotbar/hotbar-bar/hotbar-bar.component';
import { ShortcutSheetComponent } from '@axe/features/keyboard/shortcut-sheet.component';
import { TabletopShortcutEventHandlerService } from '@axe/features/keyboard/tabletop-shortcut-event-handler.service';
import { InviteJoinComponent } from '@axe/features/lobby/invite-join/invite-join.component';
import { NetworkEventHandlerService } from '@axe/features/lobby/network-event-handler.service';
import { NetworkIndicatorComponent } from '@axe/features/lobby/network-indicator/network-indicator.component';
import { BeatLightComponent } from '@axe/features/media/beat-light/beat-light.component';
import { CutInEventHandlerService } from '@axe/features/media/cut-in-event-handler.service';
import { MiniJukeboxComponent } from '@axe/features/media/mini-jukebox/mini-jukebox.component';
import { MixEventHandlerService } from '@axe/features/media/mix-event-handler.service';
import { TurnSoundEventHandlerService } from '@axe/features/media/turn-sound/turn-sound-event-handler.service';
import { FabDrawerComponent } from '@axe/features/menu/fab-drawer/fab-drawer.component';
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
import { FogMemoryWriterService } from '@axe/features/tabletop/fog-of-war/fog-memory-writer.service';
import { GameTableComponent } from '@axe/features/tabletop/game-table/game-table.component';
import { ImageDropEventHandlerService } from '@axe/features/tabletop/image-drop/image-drop-event-handler.service';
import { InterruptPromptComponent } from '@axe/features/tabletop/interrupt-prompt/interrupt-prompt.component';
import { MovePlanBandComponent } from '@axe/features/tabletop/move-plan-band/move-plan-band.component';
import { MovePlanEventHandlerService } from '@axe/features/tabletop/table-move-range-overlay/move-plan-event-handler.service';
import { VisualNovelEventHandlerService } from '@axe/features/visual-novel/visual-novel-event-handler.service';
import { VisualNovelOverlayComponent } from '@axe/features/visual-novel/visual-novel-overlay/visual-novel-overlay.component';
import { VoteEventHandlerService } from '@axe/features/vote/vote-event-handler.service';
import { VoteWidgetComponent } from '@axe/features/vote/vote-widget/vote-widget.component';
import { CompassComponent } from '@axe/features/widgets/compass/compass.component';
import { ConnectionQualityComponent } from '@axe/features/widgets/connection-quality/connection-quality.component';
import { DigitalClockComponent } from '@axe/features/widgets/digital-clock/digital-clock.component';
import { GameClockWidgetComponent } from '@axe/features/widgets/game-clock/game-clock-widget.component';
import { RenderStatsComponent } from '@axe/features/widgets/render-stats/render-stats.component';
import { PieceDragGhostComponent } from '@axe/ui/components/piece-drag-ghost/piece-drag-ghost.component';
import { SnackbarComponent } from '@axe/ui/components/snackbar/snackbar.component';
import { ReloadNoticeDirective } from '@axe/ui/directives/reload-notice.directive';
import { version as APP_VERSION } from '@pkg';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  templateUrl: './app.component.html',
  imports: [
    BeatLightComponent,
    GameTableComponent,
    FirstPersonViewComponent,
    NetworkIndicatorComponent,
    MiniJukeboxComponent,
    GmToolbarComponent,
    PlToolbarComponent,
    HandRailComponent,
    HandDragGhostComponent,
    PieceDragGhostComponent,
    ConnectionQualityComponent,
    RenderStatsComponent,
    DigitalClockComponent,
    GameClockWidgetComponent,
    CompassComponent,
    VoteWidgetComponent,
    HotbarBarComponent,
    MobileShellComponent,
    ShortcutSheetComponent,
    RoomRestoreBannerComponent,
    GpuNoticeComponent,
    ReplayStagingBannerComponent,
    ReplayIndicatorComponent,
    ReplayBoardBannerComponent,
    InviteJoinComponent,
    StreamingOverlayComponent,
    SwitchNoticeComponent,
    MovePlanBandComponent,
    InterruptPromptComponent,
    SnackbarComponent,
    ChatTickerComponent,
    FabDrawerComponent,
    VisualNovelOverlayComponent,
    BattleCutInOverlayComponent,
    ReloadNoticeDirective,
  ],
})
export class AppComponent {
  // Built with the shell, whether or not anything shows them: each dresses the page in this
  // seat's setting as it starts, before the first screen is drawn.
  private readonly theme = inject(ThemeService);
  private readonly motion = inject(MotionService);
  private readonly renderLite = inject(RenderLiteService);
  private readonly language = inject(LanguageService);
  readonly visualNovel = inject(VisualNovelModeService);
  protected readonly battleCutIn = inject(BattleCutInStateService);
  private readonly handRail = inject(HandRailService);
  readonly widgets = inject(WidgetVisibilityService);
  readonly viewport = inject(ViewportService);
  readonly mobile = inject(MobileLayoutService);
  readonly overlayMode = inject(OverlayModeService);
  readonly firstPerson = inject(FirstPersonService);

  readonly isTableSplit = computed(() => this.mobile.isActive() && !this.visualNovel.active());
  private readonly roomPanels = inject(RoomPanelService);
  private readonly fileArchiver = inject(FileArchiver);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly overlays = inject(OverlayLayers);

  readonly modalLayerViewContainerRef = viewChild.required('modalLayer', { read: ViewContainerRef });

  protected readonly tabletop = inject(TabletopService);
  /** The ticker is drawn for the screens that asked for it, and not fetched for the rest. */
  protected readonly tickerWanted = computed(() => this.tabletop.display().multiAngleTickerEnabled);

  /** The vote widget is fetched once somebody has called a vote, and not for a table that never does. */
  protected readonly voteCalled = computed(() => {
    this.objectChange.versionOf('Vote')();
    return (this.objectStore.get<Vote>('Vote')?.initTimeStamp ?? 0) > 0;
  });

  constructor() {
    inject(Title).setTitle(`Udonarium Axe ${APP_VERSION}`);

    if (new URLSearchParams(window.location.search).get('stats') === '1') this.widgets.renderStats.set(true);

    // Start every feature's event handler and the application layer's orchestration services.
    // Each one subscribes from its own constructor under @Injectable({ providedIn: 'root' }),
    // so there is nothing to hold onto here — the injection is the point.
    inject(AlarmEventHandlerService);
    inject(ButtonGuideEventHandlerService);
    inject(TabletopShortcutEventHandlerService);
    inject(DiceChatEventHandlerService);
    inject(DiceThrowEventHandlerService);
    inject(DiceThrowService);
    inject(ChatSettingsEventHandlerService);
    inject(ChatSoundEventHandlerService);
    inject(TurnSoundEventHandlerService);
    inject(EffectChatEventHandlerService);
    inject(BattleCutInEventHandlerService);
    inject(BattleChatEventHandlerService);
    inject(VoteEventHandlerService);
    inject(CardEventHandlerService);
    inject(VisualNovelEventHandlerService);
    inject(CutInEventHandlerService);
    inject(MixEventHandlerService);
    inject(NetworkEventHandlerService);
    inject(RoomArchiveEventHandlerService);
    inject(ReplayEventHandlerService);
    inject(ImageDropEventHandlerService);
    inject(FilesTooLargeEventHandlerService);
    inject(AssetRemovalEventHandlerService);
    inject(MovePlanEventHandlerService);
    inject(CcfoliaRoomImportEventHandlerService);
    inject(FogMemoryWriterService);
    inject(CutInService);
    inject(AudioAnalysisService);
    inject(SpeechBubbleService);
    inject(ChatFontService);
    inject(GravityService);
    inject(LegacyScratchMaskMigrationService);
    inject(TurnOrderService);
    inject(SkinService);

    this.fileArchiver.onCodeUnavailable = inject(LOAD_FAILURE_NOTICE);

    afterNextRender(() => {
      this.overlays.main = this.modalLayerViewContainerRef();
      const startPanels: [RoomPanelName, PanelOption][] = [['peerMenu', { left: 80, top: 10 }]];
      if (!this.viewport.isCompact()) {
        const chatHeight = 460;
        const top = Math.max(10, window.innerHeight - chatHeight - 20);
        startPanels.push(['chatWindow', { width: 660, height: chatHeight, left: 80, top }]);
      }
      // The chat window overlaps the connection panel, and stands over it.
      this.roomPanels.openInTurn(startPanels);
    });
  }
}
