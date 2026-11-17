import { NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { DiceRenderService } from '@axe/application/dice/dice-render.service';
import { EffectFieldService } from '@axe/application/effect/effect-field.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { AmbienceService } from '@axe/application/tabletop/ambience.service';
import { BoardSwitchService } from '@axe/application/tabletop/board-switch.service';
import { ConcealmentService } from '@axe/application/tabletop/concealment.service';
import { FirstPersonService } from '@axe/application/tabletop/first-person.service';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { HeldPieceService } from '@axe/application/tabletop/held-piece.service';
import { HudFrameService } from '@axe/application/tabletop/hud-frame.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { PieceLinksService } from '@axe/application/tabletop/piece-links.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { PiecePartPickService } from '@axe/application/tabletop/piece-part-pick.service';
import { PiecePicturesService } from '@axe/application/tabletop/piece-pictures.service';
import { RulerService } from '@axe/application/tabletop/ruler.service';
import { Table3dService } from '@axe/application/tabletop/table-3d.service';
import { TableAmbienceService } from '@axe/application/tabletop/table-ambience.service';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ThirdPersonService } from '@axe/application/tabletop/third-person.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuAction } from '@axe/application/ui/context-menu.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { RotationGuideService } from '@axe/application/ui/rotation-guide.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { StartupLoadingService } from '@axe/application/ui/startup-loading.service';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { trackLazyLoad } from '@axe/core/util/lazy-loads';
import { observeSize } from '@axe/core/util/observe-size';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { glideToCentre } from '@axe/domain/tabletop/camera/camera-glide';
import { FilterType, GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { squareSpanOf } from '@axe/domain/tabletop/move/move-grid';
import { zoomToViewPositionZ } from '@axe/domain/tabletop/physical-scale';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { tableForegroundOf } from '@axe/domain/tabletop/table-foreground';
import { TableRuler } from '@axe/domain/tabletop/table-ruler';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { boardShapeOf } from '@axe/domain/tabletop/world/table-world';
import { CardComponent } from '@axe/features/card/card/card.component';
import { CardStackComponent } from '@axe/features/card/card-stack/card-stack.component';
import type { DeckBuilderResult } from '@axe/features/card/deck-builder-dialog/deck-builder-dialog.component';
import { GameCharacterComponent } from '@axe/features/character/game-character/game-character.component';
import { CoinComponent } from '@axe/features/coin/coin/coin.component';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { listedThingLabel } from '@axe/features/disclosure/concealment-context-menu';
import { EffectTargetOverlayComponent } from '@axe/features/effect/effect-target-overlay/effect-target-overlay.component';
import { TableEffectOverlayComponent } from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { PeerCursorComponent } from '@axe/features/lobby/peer-cursor/peer-cursor.component';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { ReplayRouteOverlayComponent } from '@axe/features/replay/replay-route-overlay/replay-route-overlay.component';
import { CreateObjectMenuService } from '@axe/features/tabletop/create-menu/create-object-menu.service';
import { TableFogAirOverlayComponent } from '@axe/features/tabletop/fog-of-war/table-fog-air-overlay.component';
import {
  BackdropLayerView,
  backdropLayerViews,
  LayerDrawing,
} from '@axe/features/tabletop/game-table/background-layer-views';
import { handCanvasPressesOn } from '@axe/features/tabletop/game-table/canvas-presses';
import { firstTableView } from '@axe/features/tabletop/game-table/first-table-view';
import { buildGameTableContextMenu, GameTableMenu } from '@axe/features/tabletop/game-table/game-table-context-menu';
import { GameTableGestureService } from '@axe/features/tabletop/game-table/game-table-gesture.service';
import { GameTableGridFaces } from '@axe/features/tabletop/game-table/game-table-grid-faces';
import { gridCanvasScale } from '@axe/features/tabletop/game-table/grid-canvas-scale';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import { TableDropPreviewComponent } from '@axe/features/tabletop/game-table/table-drop-preview/table-drop-preview.component';
import { TableHintBandComponent } from '@axe/features/tabletop/game-table/table-hint-band/table-hint-band.component';
import { TableMarqueeOverlayComponent } from '@axe/features/tabletop/game-table/table-marquee-overlay/table-marquee-overlay.component';
import { installTableTestHooks } from '@axe/features/tabletop/game-table/table-test-hooks';
import { GameTableMaskComponent } from '@axe/features/tabletop/game-table-mask/game-table-mask.component';
import { TableInterruptOverlayComponent } from '@axe/features/tabletop/interrupt-prompt/table-interrupt-overlay.component';
import { LightSourceComponent } from '@axe/features/tabletop/light-source/light-source.component';
import { RangeComponent } from '@axe/features/tabletop/range/range.component';
import { handRulerPressesOn } from '@axe/features/tabletop/ruler/ruler-input';
import { TableRulerComponent } from '@axe/features/tabletop/ruler/table-ruler.component';
import { TableRulerOverlayComponent } from '@axe/features/tabletop/ruler/table-ruler-overlay.component';
import { SceneFadeOverlayComponent } from '@axe/features/tabletop/scene-fade-overlay/scene-fade-overlay.component';
import { TableAltitudeGuideOverlayComponent } from '@axe/features/tabletop/table-altitude-guide-overlay/table-altitude-guide-overlay.component';
import { TableAmbienceComponent } from '@axe/features/tabletop/table-ambience/table-ambience.component';
import { TableBeamOverlayComponent } from '@axe/features/tabletop/table-beam-overlay/table-beam-overlay.component';
import { TableForegroundOverlayComponent } from '@axe/features/tabletop/table-foreground-overlay/table-foreground-overlay.component';
import { TableFreePathOverlayComponent } from '@axe/features/tabletop/table-free-path-overlay/table-free-path-overlay.component';
import { TableMoveBlockOverlayComponent } from '@axe/features/tabletop/table-move-block-overlay/table-move-block-overlay.component';
import { TableMoveCostOverlayComponent } from '@axe/features/tabletop/table-move-cost-overlay/table-move-cost-overlay.component';
import { TableMoveRangeOverlayComponent } from '@axe/features/tabletop/table-move-range-overlay/table-move-range-overlay.component';
import { TableTargetOverlayComponent } from '@axe/features/tabletop/table-target-overlay/table-target-overlay.component';
import { TableTriggerOverlayComponent } from '@axe/features/tabletop/table-trigger-overlay/table-trigger-overlay.component';
import { TableVisionOverlayComponent } from '@axe/features/tabletop/table-vision-overlay/table-vision-overlay.component';
import { TableWeatherOverlayComponent } from '@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component';
import { TableZoneOverlayComponent } from '@axe/features/tabletop/table-zone-overlay/table-zone-overlay.component';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
import { TerrainBatchService } from '@axe/features/tabletop/terrain-batch/terrain-batch.service';
import { TextNoteComponent } from '@axe/features/tabletop/text-note/text-note.component';
import { TableVisionVolumeOverlayComponent } from '@axe/features/tabletop/vision-volume/table-vision-volume-overlay.component';
import { WhiteBoardComponent } from '@axe/features/tabletop/white-board/white-board.component';
import { BackdropDirective } from '@axe/ui/directives/backdrop.directive';
import { ReloadNoticeDirective } from '@axe/ui/directives/reload-notice.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { FloorPlaneDirective } from '@axe/ui/tabletop/floor-plane.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';
import { TranslocoModule } from '@jsverse/transloco';

/** How long after the selection asks, in milliseconds, the view starts gliding to the point asked for. */
const GLIDE_DELAY_MS = 50;

/** The size the character generator opens at from the table's menu. */
const CHARACTER_GENERATOR_PANEL = { width: 460, height: 420 };

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-table',
  templateUrl: './game-table.component.html',
  providers: [GameTableGestureService],
  imports: [
    BackdropDirective,
    FloorPlaneDirective,
    HudPlaceDirective,
    NgClass,
    NgTemplateOutlet,
    TerrainComponent,
    WhiteBoardComponent,
    GameTableMaskComponent,
    TextNoteComponent,
    TooltipDirective,
    NgStyle,
    CardStackComponent,
    CardComponent,
    PeerCursorComponent,
    RangeComponent,
    DiceSymbolComponent,
    GameCharacterComponent,
    SafePipe,
    TableMarqueeOverlayComponent,
    TableFogAirOverlayComponent,
    TableVisionOverlayComponent,
    TableVisionVolumeOverlayComponent,
    TableBeamOverlayComponent,
    TableTargetOverlayComponent,
    TableAltitudeGuideOverlayComponent,
    TableRulerOverlayComponent,
    TableRulerComponent,
    TableDropPreviewComponent,
    TableMoveRangeOverlayComponent,
    TableMoveBlockOverlayComponent,
    TableMoveCostOverlayComponent,
    TableInterruptOverlayComponent,
    TableFreePathOverlayComponent,
    TableZoneOverlayComponent,
    TableTriggerOverlayComponent,
    TableEffectOverlayComponent,
    EffectTargetOverlayComponent,
    ReplayRouteOverlayComponent,
    CoinComponent,
    TranslocoModule,
    LightSourceComponent,
    TableAmbienceComponent,
    TableWeatherOverlayComponent,
    TableForegroundOverlayComponent,
    ReloadNoticeDirective,
    SceneFadeOverlayComponent,
    TableHintBandComponent,
  ],
  host: {
    class: 'block',
    '(contextmenu)': 'onContextMenu($event)',
    '(document:mousedown)': 'onDocumentMouseDown($event)',
    '(document:touchstart)': 'onDocumentTouchStart($event)',
    '(document:contextmenu)': 'onDocumentContextMenu($event)',
    '(document:keydown.escape)': 'onEscapeKey($event)',
    '(document:keydown.enter)': 'onEnterKey($event)',
    '(window:resize)': 'onWindowResize()',
  },
})
export class GameTableComponent {
  private readonly createMenu = inject(CreateObjectMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly tableCamera = inject(TableCameraService);
  private readonly tablePick = inject(TablePickService);
  private readonly tableSurfaces = inject(TableSurfaceService);
  protected readonly table3d = inject(Table3dService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly ruler = inject(RulerService);
  private readonly hudFrame = inject(HudFrameService);
  private readonly pieceMotions = inject(PieceMotionsService);
  private readonly ground = inject(GroundService);
  private readonly piecePictures = inject(PiecePicturesService);
  private readonly injector = inject(Injector);
  private readonly imageService = inject(ImageService);
  private readonly motion = inject(MotionService);
  private readonly tabletopService = inject(TabletopService);
  /**
   * Whether the table shown lays a picture in front of everything. The code that draws it is
   * fetched the first time one does, as most tables never lay any.
   */
  protected readonly laysForeground = computed(
    () => tableForegroundOf(this.tabletopService.currentTableVersion()) !== null
  );
  private readonly weatherAmbience = inject(AmbienceService);
  private readonly ambienceService = inject(TableAmbienceService);
  /**
   * Whether the table shown has weather over the whole map. The code that draws it, like the code
   * that draws an area of ambience, is fetched the first time a table has one.
   */
  protected readonly hasWeather = computed(() => this.weatherAmbience.weather() !== null);
  private readonly terrainBatch = inject(TerrainBatchService);
  /** What hands the dice thrown on the table to its scene, which nothing else on the table asks for. */
  private readonly diceRender = inject(DiceRenderService);
  private readonly terrainMenu = inject(TerrainMenuService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly startRoom = inject(StartRoomService);
  private readonly startupLoading = inject(StartupLoadingService);
  protected readonly visionService = inject(VisionService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly cardTargetService = inject(CardTargetService);
  private readonly effectTargetingService = inject(EffectTargetingService);
  private readonly movePlan = inject(MovePlannerService);
  private readonly viewport = inject(ViewportService);
  private readonly effectPlaybackService = inject(EffectPlaybackService);
  private readonly effectFieldService = inject(EffectFieldService);
  private readonly mobileLayout = inject(MobileLayoutService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChangeService = inject(ObjectChangeService);
  private readonly pieceLinks = inject(PieceLinksService);
  private readonly partPick = inject(PiecePartPickService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly appRef = inject(ApplicationRef);
  private readonly t = inject(TRANSLATE_FN);
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);
  private readonly thirdPerson = inject(ThirdPersonService);

  private _initialized = false;
  /** A resize fires many times over one drag; only the last of them has to reach the camera. */
  private _resizeFrame: number | null = null;
  private _lastTableId: string | null = null;
  private _lastMode2dTableId: string | null = null;
  /** What the grid on the canvas was drawn from, so it is only drawn again when one of them changes. */
  private _gridDrawnFrom: string | null = null;
  private readonly renderLite = inject(RenderLiteService);
  readonly gestureService = inject(GameTableGestureService);
  private readonly firstPerson = inject(FirstPersonService);
  private readonly boardSwitches = inject(BoardSwitchService);
  private readonly concealment = inject(ConcealmentService);

  constructor() {
    effect((onCleanup) => {
      const canvas = this.sceneCanvas()?.nativeElement;
      if (canvas) onCleanup(this.table3d.attach(canvas));
    });
    this.keepMergedTerrainsKnown();
    this.followThirdPersonView();
    this.followStackOrder();
    this.followCancelledGestures();
    this.followFlatView();
    this.followFirstPersonView();
    this.glideToFocus();
    this.followTableInUse();
    this.followDeviceSettings();
    this.followRenderLite();
    this.followStartupLoading();
    this.destroyRef.onDestroy(() => {
      if (this.glideTimer !== null) clearTimeout(this.glideTimer);
      this.glideTimer = null;
      if (this._resizeFrame !== null) cancelAnimationFrame(this._resizeFrame);
      this.gestureService.destroy();
    });

    this.tabletopActionService.makeDefaultTable();
    // A browser that keeps a room to start on sets it out in place of the sample pieces, and the
    // sample comes back only where that room cannot be read. A page opened with an invitation waits
    // on the room's own pieces, and is given the sample only if it goes into no room.
    const startsOnOwnRoom = this.startRoom.hasPending;
    const setsOutSample = !startsOnOwnRoom && !this.startRoom.waitsOnInvite;
    if (setsOutSample) this.tabletopActionService.makeDefaultTabletopObjects();
    afterNextRender(() => this.startTable(startsOnOwnRoom, setsOutSample));
  }

  /**
   * Sets the table going once its view is built: the room it starts on, the gestures, the grid, the
   * camera's layout, what the canvas is handed, the presses on it and the test hooks, and the first
   * view of the first table where the sample was set out.
   */
  private startTable(startsOnOwnRoom: boolean, setsOutSample: boolean): void {
    if (startsOnOwnRoom) {
      void this.startRoom.loadPending().then((loaded) => {
        if (loaded) return;
        this.tabletopActionService.makeDefaultTabletopObjects();
        this.frameFirstTable();
      });
    }
    this._initialized = true;
    const root = this.rootElementRef().nativeElement;
    this.gestureService.initialize(root, () => this.currentTable.gridShow);
    this.gestureService.cancelInput();

    this.redrawTableGrid();
    this.gestureService.setTransform(0, 0, 0, 0, 0, 0);
    this.updateCameraLayout();
    this.destroyRef.onDestroy(() => this.tableCamera.forget());
    this.destroyRef.onDestroy(observeSize(root, () => this.updateCameraLayout()));
    this.followGridShown();
    this.followFaceGrids();
    this.destroyRef.onDestroy(handRulerPressesOn(root, this.ruler));
    this.destroyRef.onDestroy(
      handCanvasPressesOn(root, {
        pickAt: (x, y) => this.tablePick.pressedAt(x, y)?.target.id ?? null,
        entryOf: (identifier) => this.tabletopOverlap.get(identifier),
      })
    );
    this.destroyRef.onDestroy(
      installTableTestHooks(window, {
        pick: this.tablePick,
        camera: this.tableCamera,
        overlap: this.tabletopOverlap,
        surfaces: this.tableSurfaces,
        scene: this.table3d,
        hud: this.hudFrame,
        motions: this.pieceMotions,
        ground: this.ground,
        pictures: this.piecePictures,
        dice: this.diceRender,
        tabletop: this.tabletopService,
        store: this.objectStore,
        moveCamera: (view) => this.gestureService.moveTo(view),
        refresh: () => this.appRef.tick(),
        partAt: (identifier, pageX, pageY) => {
          const body = this.objectStore.get<GameCharacter>(identifier);
          return body instanceof GameCharacter ? (this.partPick.partAt(body, pageX, pageY)?.identifier ?? null) : null;
        },
      })
    );
    this.syncMode2d();
    if (setsOutSample) this.frameFirstTable();
  }

  /** Has the view refreshed when the camera takes to following a piece, or lets it go. */
  private followThirdPersonView(): void {
    effect(() => {
      this.thirdPerson.view();
      untracked(() => {
        if (this._initialized) this.gestureService.refreshView();
      });
    });
  }

  /**
   * Tells the characters' order about a piece whose place in it moved. A piece's own change bumps
   * its version, not the collection's, so the order it is laid out in has to be told separately,
   * and only when the order really moved.
   */
  private followStackOrder(): void {
    const seenStackIndex = new Map<string, number>();
    this.objectChangeService.onObjectChangedForSingleAlias(
      'character',
      (event) => {
        const char = this.objectStore.get<GameCharacter>(event.identifier);
        if (!char) return;
        if (seenStackIndex.get(event.identifier) === char.zindex) return;
        seenStackIndex.set(event.identifier, char.zindex);
        this.stackOrderVersion.update((v) => v + 1);
      },
      this.destroyRef
    );
  }

  /** Drops the press under way on the table whenever something asks for its gesture to be called off. */
  private followCancelledGestures(): void {
    effect(() => {
      this.selectionSignalService.cancelTableGestureVersion();
      this.gestureService.cancelInput();
    });
  }

  /** Lays the view flat, or lets it tilt again, as the seat and the table ask. */
  private followFlatView(): void {
    effect(() => {
      this.tabletopService.mode2d();
      this.tabletopService.orthographicProjection();
      if (this._initialized) untracked(() => this.syncMode2d());
    });
  }

  /**
   * Holds the table's gestures still while the first-person view is up, and on the way back
   * draws the grid again and lays the view out as the table has it.
   */
  private followFirstPersonView(): void {
    effect(() => {
      const away = this.firstPerson.showing();
      untracked(() => {
        this.gestureService.suspended = away;
        if (away) {
          this.gestureService.cancelInput();
          return;
        }
        if (!this._initialized) return;
        this.redrawTableGrid();
        this.syncMode2d();
        this.snapToRealSize();
      });
    });
  }

  /** Brings the point the selection asks for to the middle of the view, a moment after it asks. */
  private glideToFocus(): void {
    effect(() => {
      const focus = this.selectionSignalService.focusCoordinate();
      if (!focus) return;
      this.glideTimer = setTimeout(() => {
        this.glideTimer = null;
        const view = this.tableCamera.view;
        const layout = this.tableCamera.layout;
        if (!view || !layout) return;
        // Brought to the middle of the view as the camera stands, turned and tilted, and no nearer.
        const moved = glideToCentre(view, layout, focus);
        this.gestureService.glideBy(moved.x, moved.y, 0);
      }, GLIDE_DELAY_MS);
    });
  }

  /**
   * Draws the grid again and lays the view out as the table has it whenever the table in use, or
   * which table is in use, changes; a change of table lets the selection go.
   */
  private followTableInUse(): void {
    this.objectChangeService.onObjectChangedFor(
      // Before initialisation neither the current table nor the selector is certain to be there.
      () => (this._initialized ? [this.currentTable.identifier, this.tableSelecter.identifier] : []),
      () => {
        if (!this._initialized) return;
        const id = this.currentTable.identifier;
        if (this._lastTableId !== null && this._lastTableId !== id) {
          this.selectionSignalService.clearSelection();
        }
        this._lastTableId = id;
        this.redrawTableGrid();
        this.syncMode2d();
      },
      this.destroyRef
    );
  }

  /**
   * The calibration, the lock and the width a square is meant to measure are all kept on the
   * device rather than on the table, so no table event announces them. Without this, measuring
   * the screen or asking for a wider square would change nothing until something else
   * happened to redraw the board.
   */
  private followDeviceSettings(): void {
    effect(() => {
      this.displayCalibration.realSizeEnabled();
      this.viewLock.locked();
      this.displayCalibration.pxPerMm();
      this.tabletopService.cellMm();
      untracked(() => {
        this.syncViewLock();
        this.snapToRealSize();
      });
    });
  }

  /**
   * How much drawing the machine is asked for decides how large the grid's canvas is, and the
   * reader can turn that over at any time.
   */
  private followRenderLite(): void {
    effect(() => {
      this.renderLite.active();
      if (!this._initialized) return;
      untracked(() => this.redrawTableGrid());
    });
  }

  /**
   * Ends the loading screen once the canvas has drawn, or at once where it draws nothing, and
   * fetches the code that draws effects once the screen has gone, so the first effect is not cut
   * short while it comes.
   */
  private followStartupLoading(): void {
    effect(() => {
      const drawsNothing = this.table3d.unavailable() || this.table3d.renderer() === 'none';
      const drawing = this.table3d.backend() !== null;
      untracked(() => {
        if (drawsNothing) {
          this.startupLoading.finish();
        } else if (drawing) {
          this.startupLoading.reach('pieces');
          void this.startupLoading.finishAfter(() => this.table3d.whenIdle());
        }
      });
    });
    effect(() => {
      if (!this.startupLoading.finished()) return;
      untracked(() => {
        void trackLazyLoad(import('@axe/features/effect/table-effect-overlay/table-effect-overlay.component')).catch(
          () => undefined
        );
        void trackLazyLoad(import('@axe/features/tabletop/table-ambience/table-ambience.component')).catch(
          () => undefined
        );
        void trackLazyLoad(
          import('@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component')
        ).catch(() => undefined);
      });
    });
  }

  /** Brings the camera back until the first table and the tutorial board standing on it are in view. */
  private frameFirstTable(): void {
    const layout = this.tableCamera.layout;
    if (!layout) return;
    const panelsBeside = !this.viewport.isCompact();
    this.gestureService.moveTo(
      firstTableView(this.gestureService.tableView(), layout, this.currentTable, panelsBeside)
    );
  }

  /**
   * Whether a square could measure its real width right now.
   *
   * Perspective stretches the far edge of the screen, so a board drawn under it has no single
   * scale to set. The test lives here rather than at each caller, so no way in can skip it.
   */
  private canShowRealSize(): boolean {
    return (
      this._initialized &&
      this.tabletopService.mode2d() &&
      this.gestureService.orthographicProjection &&
      this.displayCalibration.realSizeEnabled()
    );
  }

  /**
   * The camera goes where a square measures the width it is meant to.
   *
   * The gestures stop at life size, so this reaches past them by setting the depth outright.
   * Real size only holds still under the lock, which is why turning it on takes the lock with it.
   */
  private snapToRealSize(): void {
    if (!this.canShowRealSize()) return;
    const zoom = this.displayCalibration.zoomFor(this.tabletopService.cellMm(), this.currentTable.gridSize);
    if (zoom === null) return;
    this.gestureService.snapToViewPositionZ(zoomToViewPositionZ(zoom));
  }

  /**
   * A resize is the one moment the camera is written to while locked.
   *
   * Real size is a property of the glass rather than of the window, so it survives the window
   * changing shape - but only if it is put back afterwards.
   */
  onWindowResize(): void {
    // The warning is wanted at once; the camera can wait for the frame the drag settles on.
    this.displayCalibration.refreshScreenScale();
    if (!this.viewLock.locked() || !this.canShowRealSize()) return;
    if (this._resizeFrame !== null) return;
    this._resizeFrame = requestAnimationFrame(() => {
      this._resizeFrame = null;
      this.snapToRealSize();
    });
  }

  private syncViewLock(): void {
    this.gestureService.viewLocked = this.viewLock.locked() && this.tabletopService.mode2d();
  }

  private syncMode2d(): void {
    const enabled = this.tabletopService.mode2d();
    const enteredMode2d = enabled && this._lastMode2dTableId !== this.currentTable.identifier;
    this._lastMode2dTableId = enabled ? this.currentTable.identifier : null;
    const orthographicProjection = enabled && this.tabletopService.orthographicProjection();
    const projectionChanged = this.gestureService.orthographicProjection !== orthographicProjection;
    this.gestureService.tiltLocked = enabled;
    this.gestureService.orthographicProjection = orthographicProjection;
    if (enabled || projectionChanged) {
      const rotateZ = enteredMode2d ? -this.gestureService.viewRotateZ : 0;
      this.gestureService.setTransform(0, 0, 0, 0, 0, rotateZ);
    }
    this.syncViewLock();
    this.snapToRealSize();
  }

  readonly rootElementRef = viewChild.required<ElementRef<HTMLElement>>('root');
  readonly gridCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('gridCanvas');
  /** The canvas the table is drawn on through three.js, there only while a seat asks for it. */
  private readonly sceneCanvas = viewChild<ElementRef<HTMLCanvasElement>>('sceneCanvas');

  /** The room's table selector, which says which table is in use. */
  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  /** The table in use, whose size, grid and pictures this view draws. */
  get currentTable(): GameTable {
    return this.tabletopService.currentTable;
  }

  private glideTimer: ReturnType<typeof setTimeout> | null = null;
  /** The board as wide and deep as its cells run, as last written to the table's box. */
  private boardPx = { width: 0, height: 0 };

  /**
   * How large each background picture really is, kept by the picture rather than by the layer.
   *
   * A size belongs to the image, so two layers wearing the same one ask the same question. Kept
   * by the layer it was measured on, the table would gather an entry for every layer ever laid
   * down and never let one go, since nothing here hears about a layer being taken away.
   */
  private readonly layerNaturalSizes = signal<ReadonlyMap<string, { width: number; height: number }>>(new Map());

  protected onBackgroundLayerImageLoad(identifier: string, event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img.naturalWidth <= 0 || img.naturalHeight <= 0) return;
    const known = this.layerNaturalSizes().get(identifier);
    if (known?.width === img.naturalWidth && known?.height === img.naturalHeight) return;
    const next = new Map(this.layerNaturalSizes());
    next.set(identifier, { width: img.naturalWidth, height: img.naturalHeight });
    this.layerNaturalSizes.set(next);
  }

  private readonly laidLayers = computed(() => {
    // Laying one down and taking one away come through the collection; what each says about
    // itself comes through its own version.
    this.objectChangeService.collectionOf(TableBackgroundLayer.aliasName)();
    this.objectChangeService.fileVersion();
    const table = this.watchCurrentTable();
    return table.backgroundLayers.filter((layer) => {
      this.objectChangeService.versionOf(layer.identifier)();
      // A layer with nothing to show has nothing to draw, and an empty pane still costs the
      // machine a surface to composite. No picture and no opacity both count as nothing.
      return layer.enabled && layer.opacity > 0 && !!this.imageService.getEmptyOr(layer.imageIdentifier).url;
    });
  });

  readonly backdropLayers = computed(() => this.laidLayers().filter((layer) => layer.placedBackdrop));

  /** What the backdrops behind the table are drawn as, back to front, as `backdropLayerViews` lays them out. */
  readonly backdropLayerViews = computed<readonly BackdropLayerView[]>(() =>
    backdropLayerViews(this.backdropLayers(), this.layerDrawing())
  );
  /** What drawing the layers reads: the pictures, what each measures, and whether things may move. */
  private layerDrawing(): LayerDrawing {
    this.objectChangeService.fileVersion();
    return {
      imageUrlOf: (imageIdentifier) => this.imageService.getEmptyOr(imageIdentifier).url,
      naturalSizes: this.layerNaturalSizes(),
      moving: this.motion.enabled(),
    };
  }

  /** The picture laid behind the table, or the empty image when the table has none. */
  readonly backgroundImage = computed(
    () => {
      this.objectChangeService.fileVersion();
      return this.imageService.getEmptyOr(this.watchCurrentTable().backgroundImageIdentifier);
    },
    { equal: imageFileEqual() }
  );

  /** The tint the background picture is drawn with: white, black, or empty for none. */
  readonly backgroundFilterType = computed<FilterType>(() => this.watchCurrentTable().backgroundFilterType);

  /** Whether something on the table is being dragged, which turns the cursor into a grabbing hand. */
  readonly isPointerDragging = computed(() => this.pointerDeviceService.isDragging);
  private readonly stackOrderVersion = signal(0);

  readonly characters = computed(() => {
    this.objectChangeService.collectionOf('character')();
    this.stackOrderVersion();
    // Siblings that sit on the same spot are painted in the order they are laid out.
    return [...this.tabletopService.characters].sort((a, b) => a.zindex - b.zindex);
  });
  readonly tableMasksOverCanvas = computed(() => {
    this.objectChangeService.collectionOf('table-mask')();
    return this.tabletopService.tableMasks;
  });
  readonly cards = computed(() => {
    this.objectChangeService.collectionOf('card')();
    return this.tabletopService.cards;
  });
  readonly cardStacks = computed(() => {
    this.objectChangeService.collectionOf('card-stack')();
    return this.tabletopService.cardStacks;
  });
  readonly ranges = computed(() => {
    this.objectChangeService.collectionOf('range')();
    return this.tabletopService.ranges;
  });
  /**
   * Whether any ruler is to be read on the table: this seat's own in hand, one another seat is laying,
   * or one left lying on it. The overlay that says what they measure is not loaded before.
   */
  protected readonly measuresAnything = computed(() => {
    if (this.ruler.inHand() || this.tableRulers().length > 0) return true;
    this.objectChangeService.collectionOf(PeerCursor.aliasName)();
    return this.objectStore.getObjects<PeerCursor>(PeerCursor).some((cursor) => {
      this.objectChangeService.versionOf(cursor.identifier)();
      return cursor.measuring !== '';
    });
  });

  /** The rulers left lying on the table. */
  readonly tableRulers = computed(() => {
    this.objectChangeService.collectionOf(TableRuler.aliasName)();
    return this.objectStore.getObjects<TableRuler>(TableRuler).filter((ruler) => ruler.isVisibleOnTable);
  });
  readonly lightSources = computed(() => {
    this.objectChangeService.collectionOf('light-source')();
    return this.tabletopService.lightSources;
  });
  readonly whiteBoards = computed(() => {
    this.objectChangeService.collectionOf('white-board')();
    return this.tabletopService.whiteBoards;
  });
  readonly terrains = computed(() => {
    this.objectChangeService.collectionOf('terrain')();
    return this.tabletopService.terrains;
  });
  readonly ambiences = computed(() => this.ambienceService.shown());
  readonly textNotes = computed(() => {
    this.objectChangeService.collectionOf('text-note')();
    return this.tabletopService.textNotes;
  });
  readonly diceSymbols = computed(() => {
    this.objectChangeService.collectionOf('dice-symbol')();
    return this.tabletopService.diceSymbols;
  });
  readonly coins = computed(() => {
    this.objectChangeService.collectionOf('coin')();
    return this.tabletopService.coins;
  });
  readonly peerCursors = computed(() => {
    this.objectChangeService.collectionOf('PeerCursor')();
    return this.tabletopService.peerCursors;
  });

  /**
   * The characters laid over the table, flat on the screen where the canvas draws them: all but
   * those drawn as a part of another, which show in the body's card.
   */
  readonly charactersOverCanvas = computed(() => {
    const parts = this.pieceLinks.partIdentifiers();
    return this.characters().filter((character) => !parts.has(character.identifier));
  });
  /**
   * The blocks laid over the table, on the screen where the canvas draws them: all but the ones
   * drawn together, which have no element of their own.
   */
  readonly terrainsOverCanvas = computed(() => {
    const merged = this.terrainBatch.mergedTerrains();
    return this.terrains().filter((terrain) => !merged.has(terrain.identifier));
  });

  /** The pictures of the grid laid over the walls and the beams on them, by the face of the scene each goes on. */
  readonly gridFaces = new GameTableGridFaces({
    objectChange: this.objectChangeService,
    images: this.imageService,
    table: () => this.currentTable,
    tableSelecter: () => this.tableSelecter,
    terrains: this.terrains,
  });

  private async openTableSetting(): Promise<void> {
    const { GameTableSettingComponent } =
      await import('@axe/features/tabletop/game-table-setting/game-table-setting.component');
    await this.modalService.open(GameTableSettingComponent);
  }

  private async openDeckBuilder(position: PointerCoordinate): Promise<void> {
    const { DeckBuilderDialogComponent } =
      await import('@axe/features/card/deck-builder-dialog/deck-builder-dialog.component');
    const result = await this.modalService.open<DeckBuilderResult | null>(DeckBuilderDialogComponent);
    if (!result) return;
    if (this.tabletopActionService.createDeckFromTag(position, result.tag, result.useImageName)) {
      SoundEffect.play(PresetSound.cardPut);
    }
  }

  /**
   * The entries of the table's plain right-click menu for a point on the table, as
   * `buildContextMenuModel` lists them.
   */
  buildContextMenuActions(objectPosition: PointerCoordinate): ContextMenuAction[] {
    return this.buildContextMenuModel(objectPosition).actions;
  }

  /**
   * The table's right-click menu for a point on the table, both as a plain list and as the groups of
   * the rotating menu, as `buildGameTableContextMenu` builds it from the table and the reader now.
   */
  buildContextMenuModel(objectPosition: PointerCoordinate): GameTableMenu {
    const canEditSwitches = this.boardSwitches.canEdit();
    return buildGameTableContextMenu(
      {
        create: this.createMenu.menuGroupsAt(objectPosition),
        party: this.createMenu.gatherPartyMenuAt(objectPosition),
        canEditSwitches,
        concealed: this.concealment.concealed().map((object) => ({
          label: listedThingLabel(object.name, this.t(`feature.boardSwitch.thing.${object.aliasName}`), this.t),
          reveal: () => this.concealment.reveal(object),
        })),
        pressedGround: this.boardSwitches.pressedGround().map((ground) => ({
          label: listedThingLabel(
            ground.pressSwitch?.def.label.trim() || ground.name,
            this.t(
              ground.pressSwitch?.retired ? 'feature.boardSwitch.groundRetired' : 'feature.boardSwitch.groundPressed'
            ),
            this.t
          ),
          reset: () => this.boardSwitches.reset(ground),
        })),
        mobile: this.mobileLayout.isActive(),
        mode2d: this.tabletopService.mode2d(),
        viewLocked: this.viewLock.locked(),
        canSnapToRealSize: this.displayCalibration.isCalibrated() && this.tabletopService.orthographicProjection(),
      },
      {
        openDeckBuilder: () => void this.openDeckBuilder(objectPosition),
        openCharacterGenerator: () => this.roomPanels.open('characterGenerator', CHARACTER_GENERATOR_PANEL),
        openTableSetting: () => void this.openTableSetting(),
        setViewLocked: (locked) => {
          this.viewLock.set(locked);
          this.syncViewLock();
        },
        snapToRealSize: () => {
          // Real size brings the lock with it; the service settles that for every way in.
          this.displayCalibration.setRealSizeEnabled(true);
          this.snapToRealSize();
          this.syncViewLock();
        },
      },
      this.t
    );
  }

  /**
   * Opens the table's menu at the pointer on a right click over the table, where the table has the
   * focus and the pointer allows a menu.
   */
  onContextMenu(e: MouseEvent) {
    if (!document.activeElement?.contains(this.rootElementRef().nativeElement)) return;
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const menuPosition = this.pointerDeviceService.pointers[0];
    const objectPosition = this.tablePick.landingAtPointer();
    this.openTableContextMenu(menuPosition, objectPosition);
  }

  /**
   * Opens the table's menu at a place on the screen for a point on the table. In 2D with a rotating
   * style chosen it opens as the rotating menu; otherwise as a plain list.
   */
  openTableContextMenu(menuPosition: PointerCoordinate, objectPosition: PointerCoordinate): void {
    const menu = this.buildContextMenuModel(objectPosition);
    this.pieceContextMenu.openPieceMenu(
      menuPosition,
      { actions: menu.actions, radialGroups: menu.rotatingGroups },
      this.currentTable.name
    );
  }
  /** Forgets that the last press moved the view, as any new mouse press begins. */
  onDocumentMouseDown(_e: MouseEvent) {
    this.gestureService.isTableTransformed = false;
  }

  /** Forgets that the last press moved the view, as any new touch begins. */
  onDocumentTouchStart(_e: TouchEvent) {
    this.gestureService.isTableTransformed = false;
  }

  /**
   * Swallows the browser's menu after a press that moved the view, where the pointer would not open
   * the table's own, so turning the view does not end in a menu.
   */
  onDocumentContextMenu(e: MouseEvent) {
    if (this.gestureService.isTableTransformed && !this.pointerDeviceService.isAllowedToOpenContextMenu)
      e.preventDefault();
  }

  /**
   * Whether an effect is playing or standing on the table. The code that draws effects is fetched the
   * first time one is, and kept from then on; it is fetched ahead once the loading screen has gone,
   * so that the first effect is not cut short while it comes.
   */
  protected readonly drawsEffects = computed(
    () => this.effectPlaybackService.activeCasts().length > 0 || this.effectFieldService.fields().length > 0
  );

  /** The jolt of an effect, which shakes the camera with it. */
  readonly screenShake = computed(() => this.effectPlaybackService.shake());

  readonly isPickingTarget = computed(() => this.cardTargetService.isPicking());
  readonly isPickingEffectTarget = computed(() => this.effectTargetingService.isPicking());
  /** Whether a move is being worked out, which is when the table says how to work one out. */
  readonly isPlanningMove = this.movePlan.isPlanning;

  private readonly heldPiece = inject(HeldPieceService);

  /**
   * What more a drag can be turned into, said while there is a piece in hand to turn.
   *
   * Left unsaid where there is no wheel to turn and no key to hold, and where the planned
   * move is already speaking from this band. A piece on a wall has no height of its own, so
   * it is offered the footholds and not the air.
   */
  protected readonly holdHint = computed<{ footing: string; lift: string | null } | null>(() => {
    if (this.viewport.isTouch() || this.isPlanningMove()) return null;
    const held = this.heldPiece.held();
    if (!held) return null;
    return {
      footing: 'feature.tabletop.holdHint.footing',
      lift: held.liftable ? 'feature.tabletop.holdHint.lift' : null,
    };
  });

  private readonly rotationGuide = inject(RotationGuideService);

  /**
   * What is said while something is being turned: how far it has turned, how far it is pointed up
   * where it is pointed up as well, and how to snap it to the grid's directions. A hand with no Alt
   * key is told only the angle.
   */
  protected readonly rotateHint = computed(() => {
    const turn = this.rotationGuide.turn();
    if (!turn) return null;
    const aimed = turn.pitch !== undefined;
    const snapKey = turn.snapping
      ? `feature.tabletop.rotateHint.${aimed ? 'snappingAim' : 'snapping'}`
      : `feature.tabletop.rotateHint.${aimed ? 'holdAltAim' : 'holdAlt'}`;
    return { ...turn, offersSnap: !this.viewport.isTouch(), snapKey };
  });

  /**
   * Backs out on Escape: from picking an effect's targets first, then from picking a card's target,
   * and otherwise clears the selection. Backing out of a pick takes the key, so whatever else
   * listens for Escape, as the first-person view does to leave, lets it be.
   */
  onEscapeKey(event: Event) {
    if (this.effectTargetingService.cancel() || this.cardTargetService.cancelPicking()) {
      event.preventDefault();
      return;
    }
    this.selectionSignalService.clearSelection();
  }

  /** Confirming a target. It does not steal the key from a field being typed into. */
  onEnterKey(event: Event) {
    if (!this.effectTargetingService.isPicking() || isTypingTarget(event.target)) return;
    event.preventDefault();
    this.effectTargetingService.confirm();
  }

  private watchCurrentTable(): GameTable {
    const table = this.currentTable;
    this.objectChangeService.versionOf(table.identifier)();
    this.objectChangeService.versionOf(this.tableSelecter.identifier)();
    return table;
  }

  /**
   * Hands the canvas the pictures of the grid laid over the walls of the table and over the fronts of
   * the beams standing out from them, by the faces of the scene they go on, whenever they change.
   */
  private followFaceGrids(): void {
    effect(
      () => {
        const grids = this.gridFaces.faceGrids();
        untracked(() => this.table3d.showFaceGrids(grids));
      },
      { injector: this.injector }
    );
  }

  /**
   * Keeps the blocks the canvas draws together, which have no element of their own on the screen,
   * known to what finds the pieces under a point and rests a piece on what is under it, each with its
   * menu for a right click on it.
   */
  private keepMergedTerrainsKnown(): void {
    const known = new Set<string>();
    effect(() => {
      const merged = this.terrainBatch.mergedTerrains();
      untracked(() => {
        for (const identifier of [...known]) {
          if (merged.has(identifier)) continue;
          known.delete(identifier);
          this.tabletopOverlap.unregister(identifier, null);
        }
        for (const identifier of merged) {
          if (known.has(identifier) && this.tabletopOverlap.get(identifier)?.element === null) continue;
          const terrain = this.terrainBatch.terrainOf(identifier);
          if (!terrain) continue;
          this.tabletopOverlap.registerWithoutElement(terrain, () => this.terrainMenu.open(terrain));
          known.add(identifier);
        }
      });
    });
    this.destroyRef.onDestroy(() => {
      for (const identifier of known) this.tabletopOverlap.unregister(identifier, null);
    });
  }

  /** Hands the canvas the grid again whenever the grid is shown or hidden. */
  private followGridShown(): void {
    effect(
      () => {
        this.gestureService.gridOpacity();
        untracked(() => this.shareGrid());
      },
      { injector: this.injector }
    );
  }

  /** How many times the page has drawn its grid, so the canvas draws it again from the page's. */
  private gridRevision = 0;

  /**
   * Hands the canvas the grid: the canvas it is drawn on, where that lies on the board, which is the
   * box the board's picture is stretched over, and how opaque it is shown.
   */
  private shareGrid(): void {
    const table = this.currentTable;
    this.table3d.showGrid({
      canvas: this.gridCanvas().nativeElement,
      box: boardShapeOf(table.width, table.height, table.gridSize, table.gridType).box,
      opacity: this.gestureService.gridOpacity(),
      revision: this.gridRevision,
    });
  }

  /**
   * Tells the camera where the table sits on the page and how big its board is, once the table has
   * been set up, whenever the box it is seen through changes size, and whenever the board does.
   */
  private updateCameraLayout(): void {
    if (!this._initialized) return;
    const rect = this.rootElementRef().nativeElement.getBoundingClientRect();
    this.tableCamera.setLayout({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      boardWidth: this.boardPx.width,
      boardHeight: this.boardPx.height,
    });
  }

  /** Draws the grid from the table as it stands now. */
  private redrawTableGrid(): void {
    this.setGameTableGrid(
      this.currentTable.width,
      this.currentTable.height,
      this.currentTable.gridSize,
      this.currentTable.gridType,
      this.currentTable.gridColor,
      this.currentTable.gridFontColor,
      squareSpanOf(this.currentTable)
    );
  }

  /**
   * Sizes the board and draws its grid.
   *
   * A table announces every change to itself and to what stands on it, and drawing the grid over a
   * whole board is the dearest thing on that path, so the drawing is left as it stands unless one
   * of the things it is drawn from has changed.
   */
  private setGameTableGrid(
    width: number,
    height: number,
    gridSize: number,
    gridType: GridType,
    gridColor: string,
    gridFontColor: string,
    squareSpan: number
  ) {
    const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
    const boardWidthPx = geo ? geo.pixelW : width * gridSize;
    const boardHeightPx = geo ? geo.pixelH : height * gridSize;
    const scale = gridCanvasScale(boardWidthPx, boardHeightPx, this.renderLite.active());
    const drawnFrom = `${width}|${height}|${gridSize}|${gridType}|${gridColor}|${gridFontColor}|${scale}|${squareSpan}`;
    if (drawnFrom !== this._gridDrawnFrom) {
      this._gridDrawnFrom = drawnFrom;
      const canvas = this.gridCanvas().nativeElement;
      this.boardPx = { width: width * gridSize, height: height * gridSize };
      this.updateCameraLayout();
      canvas.style.width = scale === 1 ? '' : `${boardWidthPx}px`;
      canvas.style.height = scale === 1 ? '' : `${boardHeightPx}px`;

      const render = new GridLineRender(canvas, scale);
      if (geo) {
        render.renderViewport(
          geo.pixelW,
          geo.pixelH,
          gridSize,
          gridType,
          gridColor,
          gridFontColor,
          -geo.offsetY,
          -geo.offsetX
        );
      } else {
        render.render(width, height, gridSize, gridType, gridColor, gridFontColor, false, 0, 0, squareSpan);
      }
      this.gridRevision++;
      this.shareGrid();
      afterNextRender(() => this.shareGrid(), { injector: this.injector });
    }
  }
}
