import { NgClass, NgStyle, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CardTargetService } from '@axe/application/card/card-target.service';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { EffectTargetingService } from '@axe/application/effect/effect-targeting.service';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import {
  ContextMenuAction,
  ContextMenuRadialGroup,
  ContextMenuSeparator,
  ContextMenuService,
} from '@axe/application/ui/context-menu.service';
import { DisplayCalibrationService } from '@axe/application/ui/display-calibration.service';
import { MobileLayoutService } from '@axe/application/ui/mobile-layout.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { buildToggleAction } from '@axe/application/ui/tabletop-context-menu-actions';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ViewLockService } from '@axe/application/ui/view-lock.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { ImageFile, imageFileEqual } from '@axe/core/storage/image-file';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import {
  backgroundScrollAnimation,
  backgroundScrollMargin,
  backgroundTileSize,
} from '@axe/domain/tabletop/background-scroll';
import { FilterType, GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { zoomToViewPositionZ } from '@axe/domain/tabletop/physical-scale';
import { SurfaceDims } from '@axe/domain/tabletop/surface-space';
import { TableBackgroundLayer } from '@axe/domain/tabletop/table-background-layer';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { boardSurfaceOf, surfaceOf, TABLE_SURFACES, TableSurface } from '@axe/domain/tabletop/tabletop-object';
import { WallFace, WallLight, WallSilhouette } from '@axe/domain/tabletop/vision-scene';
import { CardComponent } from '@axe/features/card/card/card.component';
import { CardStackComponent } from '@axe/features/card/card-stack/card-stack.component';
import type { DeckBuilderResult } from '@axe/features/card/deck-builder-dialog/deck-builder-dialog.component';
import { GameCharacterComponent } from '@axe/features/character/game-character/game-character.component';
import { CoinComponent } from '@axe/features/coin/coin/coin.component';
import { DiceSymbolComponent } from '@axe/features/dice/dice-symbol/dice-symbol.component';
import { EffectTargetOverlayComponent } from '@axe/features/effect/effect-target-overlay/effect-target-overlay.component';
import { TableEffectOverlayComponent } from '@axe/features/effect/table-effect-overlay/table-effect-overlay.component';
import { PeerCursorComponent } from '@axe/features/lobby/peer-cursor/peer-cursor.component';
import { RoomPanelService } from '@axe/features/panels/room-panel.service';
import { ReplayRouteOverlayComponent } from '@axe/features/replay/replay-route-overlay/replay-route-overlay.component';
import { TableFogAirOverlayComponent } from '@axe/features/tabletop/fog-of-war/table-fog-air-overlay.component';
import { beamTopGridGeometry, beamWallFaceGrid } from '@axe/features/tabletop/game-table/beam-top-grid';
import { glideTransform } from '@axe/features/tabletop/game-table/game-table-camera';
import { GameTableGestureService } from '@axe/features/tabletop/game-table/game-table-gesture.service';
import {
  WALL_SIDES,
  WallBackground,
  wallBackground,
  wallFaceFor,
  wallIsMirrored,
  WallSurface,
} from '@axe/features/tabletop/game-table/game-table-walls';
import { GridFaceCache } from '@axe/features/tabletop/game-table/grid-face-cache';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import { TableMarqueeOverlayComponent } from '@axe/features/tabletop/game-table/table-marquee-overlay/table-marquee-overlay.component';
import { GameTableMaskComponent } from '@axe/features/tabletop/game-table-mask/game-table-mask.component';
import {
  buildHexOuterBorderSvg,
  buildHexOutlineMask,
} from '@axe/features/tabletop/game-table-mask/game-table-mask-helpers';
import { GameTableScratchMaskComponent } from '@axe/features/tabletop/game-table-scratch-mask/game-table-scratch-mask.component';
import { LightSourceComponent } from '@axe/features/tabletop/light-source/light-source.component';
import { RangeComponent } from '@axe/features/tabletop/range/range.component';
import { TableAmbienceComponent } from '@axe/features/tabletop/table-ambience/table-ambience.component';
import { TableBeamOverlayComponent } from '@axe/features/tabletop/table-beam-overlay/table-beam-overlay.component';
import { TableMoveBlockOverlayComponent } from '@axe/features/tabletop/table-move-block-overlay/table-move-block-overlay.component';
import { TableMoveRangeOverlayComponent } from '@axe/features/tabletop/table-move-range-overlay/table-move-range-overlay.component';
import { TableTargetOverlayComponent } from '@axe/features/tabletop/table-target-overlay/table-target-overlay.component';
import { TableVisionOverlayComponent } from '@axe/features/tabletop/table-vision-overlay/table-vision-overlay.component';
import { TableWeatherOverlayComponent } from '@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component';
import { TerrainComponent } from '@axe/features/tabletop/terrain/terrain.component';
import { TextNoteComponent } from '@axe/features/tabletop/text-note/text-note.component';
import { TableVisionVolumeOverlayComponent } from '@axe/features/tabletop/vision-volume/table-vision-volume-overlay.component';
import {
  wallLightLayerStyle,
  wallSilhouetteBackground,
  wallSilhouetteStyle,
} from '@axe/features/tabletop/wall-projection';
import { WhiteBoardComponent } from '@axe/features/tabletop/white-board/white-board.component';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { translateZCss, Z_OFFSET_BACKGROUND_LAYERS_PX, Z_OFFSET_FOREGROUND_LAYERS_PX } from '@axe/ui/tabletop/z-offset';
import { TranslocoModule } from '@jsverse/transloco';

/** Whether something is being typed into a field, so the board does not steal the key. */
/** One picture drifting under the board, ready to be drawn. */
interface BackgroundLayerView {
  readonly identifier: string;
  readonly imageUrl: string;
  readonly style: Record<string, string>;
  readonly drifts: boolean;
}

interface WallView {
  readonly wall: ActiveWall;
  readonly pools: readonly { readonly style: Record<string, string> }[];
  readonly silhouettes: readonly { readonly background: string; readonly style: Record<string, string> }[];
}

interface ActiveWall {
  surface: TableSurface;
  image: ImageFile;
  containerClass: string;
  containerTransform: string;
  containerOrigin: string;
  widthPx: number;
  heightPx: number;
  surfaceBackground: string;
  surfaceBackgroundSize: string;
  surfaceBackgroundRepeat: string;
}

interface BeamTopGrid {
  identifier: string;
  left: number;
  top: number;
  width: number;
  height: number;
  z: number;
  dataUrl: string;
}

interface BeamWallGrid {
  identifier: string;
  matrix3d: string;
  width: number;
  height: number;
  dataUrl: string;
}

const NO_BEAM_TOP_GRIDS: readonly BeamTopGrid[] = [];
const NO_BEAM_WALL_GRIDS: readonly BeamWallGrid[] = [];

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'game-table',
  templateUrl: './game-table.component.html',
  providers: [GameTableGestureService],
  imports: [
    NgClass,
    NgTemplateOutlet,
    TerrainComponent,
    WhiteBoardComponent,
    GameTableMaskComponent,
    GameTableScratchMaskComponent,
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
    TableMoveRangeOverlayComponent,
    TableMoveBlockOverlayComponent,
    TableEffectOverlayComponent,
    EffectTargetOverlayComponent,
    ReplayRouteOverlayComponent,
    CoinComponent,
    TranslocoModule,
    LightSourceComponent,
    TableAmbienceComponent,
    TableWeatherOverlayComponent,
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
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  private readonly imageService = inject(ImageService);
  private readonly motion = inject(MotionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly tabletopActionService = inject(TabletopActionService);
  protected readonly visionService = inject(VisionService);
  private readonly modalService = inject(ModalService);
  private readonly panelService = inject(PanelService);
  private readonly roomPanels = inject(RoomPanelService);
  private readonly objectStore = inject(ObjectStore);
  private readonly selectionSignalService = inject(SelectionSignalService);
  private readonly cardTargetService = inject(CardTargetService);
  private readonly effectTargetingService = inject(EffectTargetingService);
  private readonly movePlan = inject(MovePlanService);
  private readonly effectPlaybackService = inject(EffectPlaybackService);
  private readonly mobileLayout = inject(MobileLayoutService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChangeService = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly t = inject(TRANSLATE_FN);
  private readonly displayCalibration = inject(DisplayCalibrationService);
  private readonly viewLock = inject(ViewLockService);
  protected readonly isOrthographicProjection = computed(
    () => this.tabletopService.mode2d() && this.tabletopService.orthographicProjection()
  );
  private _initialized = false;
  /** A resize fires many times over one drag; only the last of them has to reach the camera. */
  private _resizeFrame: number | null = null;
  private _lastTableId: string | null = null;
  private _lastMode2dTableId: string | null = null;
  readonly gestureService = inject(GameTableGestureService);

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.glideTimer !== null) clearTimeout(this.glideTimer);
      this.glideTimer = null;
      this.gestureService.destroy();
    });
    // A piece's own change bumps its version, not the collection's, so the order it is
    // laid out in has to be told about separately - and only when the order really moved.
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

    effect(() => {
      this.selectionSignalService.cancelTableGestureVersion();
      this.gestureService.cancelInput();
    });
    effect(() => {
      this.tabletopService.mode2d();
      this.tabletopService.orthographicProjection();
      if (this._initialized) untracked(() => this.syncMode2d());
    });
    effect(() => {
      const focus = this.selectionSignalService.focusCoordinate();
      if (!focus || !this.gameTable) return;
      this.glideTimer = setTimeout(() => {
        this.gameTable().nativeElement.style.transition = '0.2s ease-out';
        this.glideTimer = setTimeout(() => {
          this.glideTimer = null;
          this.gameTable().nativeElement.style.transition = '';
        }, 100);
        const moved = glideTransform(focus, this.tableVisualCenter(), {
          rotateX: this.gestureService.viewRotateX,
          rotateZ: this.gestureService.viewRotateZ,
          positionX: this.gestureService.viewPositionX,
          positionY: this.gestureService.viewPositionY,
          positionZ: this.gestureService.viewPositionZ,
        });
        this.gestureService.setTransform(moved.x, moved.y, moved.z, 0, 0, 0);
      }, 50);
    });

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
        this.setGameTableGrid(
          this.currentTable.width,
          this.currentTable.height,
          this.currentTable.gridSize,
          this.currentTable.gridType,
          this.currentTable.gridColor,
          this.currentTable.gridFontColor
        );
        this.syncMode2d();
      },
      this.destroyRef
    );
    this.destroyRef.onDestroy(() => {
      if (this._resizeFrame !== null) cancelAnimationFrame(this._resizeFrame);
    });

    // The calibration, the lock and the width a square is meant to measure are all kept on the
    // device rather than on the table, so no table event announces them. Without this, measuring
    // the screen or asking for a wider square would change nothing until something else
    // happened to redraw the board.
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
    this.tabletopActionService.makeDefaultTable();
    this.tabletopActionService.makeDefaultTabletopObjects();
    this.tabletopActionService.initAprilDiceImage();

    afterNextRender(() => {
      this._initialized = true;
      this.gestureService.initialize(
        this.rootElementRef().nativeElement,
        this.gameTable().nativeElement,
        this.gameObjects().nativeElement,
        this.gridCanvas().nativeElement,
        () => this.currentTable.gridShow
      );
      this.gestureService.cancelInput();

      this.setGameTableGrid(
        this.currentTable.width,
        this.currentTable.height,
        this.currentTable.gridSize,
        this.currentTable.gridType,
        this.currentTable.gridColor,
        this.currentTable.gridFontColor
      );
      this.gestureService.setTransform(0, 0, 0, 0, 0, 0);
      this.coordinateService.tabletopOriginElement = this.gameObjects().nativeElement;
      this.syncMode2d();
    });
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
  readonly gameTable = viewChild.required<ElementRef<HTMLElement>>('gameTable');
  readonly gameObjects = viewChild.required<ElementRef<HTMLElement>>('gameObjects');
  readonly gridCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('gridCanvas');

  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  get currentTable(): GameTable {
    return this.tabletopService.currentTable;
  }

  readonly tableImage = computed(
    () => {
      this.objectChangeService.fileVersion();
      this.objectChangeService.versionOf(this.currentTable.identifier)();
      this.objectChangeService.versionOf(this.tableSelecter.identifier)();
      return this.imageService.getEmptyOr(this.currentTable.imageIdentifier);
    },
    { equal: imageFileEqual() }
  );

  private wallImageFor(getter: () => string) {
    return computed(
      () => {
        this.objectChangeService.fileVersion();
        this.objectChangeService.versionOf(this.currentTable.identifier)();
        this.objectChangeService.versionOf(this.tableSelecter.identifier)();
        return this.imageService.getEmptyOr(getter());
      },
      { equal: imageFileEqual() }
    );
  }

  readonly northWallImage = this.wallImageFor(() => this.currentTable.northWallImageIdentifier);
  readonly eastWallImage = this.wallImageFor(() => this.currentTable.eastWallImageIdentifier);
  readonly southWallImage = this.wallImageFor(() => this.currentTable.southWallImageIdentifier);
  readonly westWallImage = this.wallImageFor(() => this.currentTable.westWallImageIdentifier);

  readonly wallState = computed(() => {
    const table = this.watchCurrentTable();
    return {
      heightPx: table.wallHeight * table.gridSize,
      widthPx: table.width * table.gridSize,
      depthPx: table.height * table.gridSize,
      showNorth: table.showNorthWall,
      showEast: table.showEastWall,
      showSouth: table.showSouthWall,
      showWest: table.showWestWall,
      gridShow: table.gridShow,
    };
  });

  private readonly wallImages: Record<WallSurface, Signal<ImageFile>> = {
    'north-wall': this.northWallImage,
    'south-wall': this.southWallImage,
    'west-wall': this.westWallImage,
    'east-wall': this.eastWallImage,
  };

  readonly activeWalls = computed<readonly ActiveWall[]>(() => {
    const state = this.wallState();
    const table = this.watchCurrentTable();
    const walls = [] as ActiveWall[];
    for (const side of WALL_SIDES) {
      const image = this.wallImages[side.surface]();
      if (!side.shown(table) || !image.url) continue;
      const widthPx = side.along === 'width' ? state.widthPx : state.depthPx;
      const gridUrl = state.gridShow
        ? this.gridFaces.dataUrl(table, widthPx, state.heightPx, 0, 0, side.labelPrefix, side.labelMatrix)
        : '';
      walls.push({
        surface: side.surface,
        image,
        containerClass: side.containerClass,
        containerTransform: side.containerTransform,
        containerOrigin: side.containerOrigin,
        widthPx,
        heightPx: state.heightPx,
        ...wallBackground(image.url, gridUrl),
      });
    }
    return walls;
  });

  private readonly gridFaces = new GridFaceCache();
  private glideTimer: ReturnType<typeof setTimeout> | null = null;

  wallBackground(imageUrl: string, gridUrl: string): WallBackground {
    return wallBackground(imageUrl, gridUrl);
  }

  /**
   * What each layer's picture measures, once the browser has loaded it.
   *
   * Nothing in the image store reports a size, and the drift is measured in tiles: sliding by
   * anything other than exactly one tile leaves a seam. So the size is read off the loaded
   * picture, and until it arrives the layer stands still rather than guessing.
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

  /**
   * How large the board is drawn, which is as large as a tile of a layer is ever worth drawing.
   *
   * The same measure the run's wrapper wears, so a tile held to it is held to what can be seen.
   */
  private readonly boardPixelSize = computed<{ width: number; height: number }>(() => {
    const table = this.watchCurrentTable();
    const geo = computeHexMaskGeometry(table.width, table.height, table.gridSize, table.gridType);
    if (geo) return { width: geo.pixelW, height: geo.pixelH };
    return { width: table.width * table.gridSize, height: table.height * table.gridSize };
  });

  readonly underLayers = computed(() => this.laidLayers().filter((layer) => !layer.placedOver));
  readonly overLayers = computed(() => this.laidLayers().filter((layer) => layer.placedOver));

  readonly underLayerViews = computed<readonly BackgroundLayerView[]>(() => this.layerViews(this.underLayers()));
  readonly overLayerViews = computed<readonly BackgroundLayerView[]>(() => this.layerViews(this.overLayers()));

  /**
   * What one run of layers is drawn as.
   *
   * Nothing here says how deep a layer sits. The wrapper hides what overflows it, which flattens
   * everything inside into one plane, so within a run it is document order that decides — and
   * that is already back to front. The run as a whole carries the depth.
   *
   * One box a layer, whichever way it drifts. Across runs on `transform` and down runs on
   * `translate`, so the two never write over each other and a layer going both ways still asks
   * the machine for the one surface to composite.
   */
  private layerViews(layers: readonly TableBackgroundLayer[]): readonly BackgroundLayerView[] {
    this.objectChangeService.fileVersion();
    const sizes = this.layerNaturalSizes();
    const moving = this.motion.enabled();
    const board = this.boardPixelSize();

    return layers.map((layer) => {
      const tile = backgroundTileSize(sizes.get(layer.identifier) ?? null, layer.scale, board);
      const x = moving ? backgroundScrollAnimation(layer.speedX, tile?.width ?? 0) : null;
      const y = moving ? backgroundScrollAnimation(layer.speedY, tile?.height ?? 0) : null;
      const scrollsX = !!x && x.durationSeconds > 0;
      const scrollsY = !!y && y.durationSeconds > 0;
      // Spare cloth for the drift to pull in, on the side it is heading for and nowhere else.
      const margin = backgroundScrollMargin(tile, scrollsX, scrollsY);
      const image = this.imageService.getEmptyOr(layer.imageIdentifier);

      return {
        identifier: layer.identifier,
        imageUrl: image.url,
        style: {
          inset: `0px ${-margin.x}px ${-margin.y}px 0px`,
          'background-image': `url(${image.url})`,
          'background-repeat': 'repeat',
          ...(tile ? { 'background-size': `${tile.width}px ${tile.height}px` } : {}),
          // Anything short of whole makes a group of its own to composite, so say it only when
          // the layer actually asked to be seen through.
          ...(layer.opacity < 1 ? { opacity: `${layer.opacity}` } : {}),
          ...(x && scrollsX
            ? {
                '--bg-layer-x-name': 'bgLayerScrollX',
                '--bg-layer-x-duration': `${x.durationSeconds}s`,
                '--bg-layer-x-direction': x.reversed ? 'reverse' : 'normal',
                '--bg-layer-tile-w': `${tile?.width ?? 0}px`,
              }
            : {}),
          ...(y && scrollsY
            ? {
                '--bg-layer-y-name': 'bgLayerScrollY',
                '--bg-layer-y-duration': `${y.durationSeconds}s`,
                '--bg-layer-y-direction': y.reversed ? 'reverse' : 'normal',
                '--bg-layer-tile-h': `${tile?.height ?? 0}px`,
              }
            : {}),
        },
        drifts: scrollsX || scrollsY,
      };
    });
  }

  /**
   * Where each run sits as a whole.
   *
   * The wrapper hides what overflows it, which flattens the layers inside; so a run needs a
   * depth of its own rather than leaning on document order to clear the board.
   */
  protected readonly backgroundLayerTransform = translateZCss(-Z_OFFSET_BACKGROUND_LAYERS_PX);
  protected readonly foregroundLayerTransform = translateZCss(Z_OFFSET_FOREGROUND_LAYERS_PX);

  /** A board drawn on a transparent picture must not be washed out by the veil over it. */
  readonly showsTableSurfaceVeil = computed(() => this.underLayers().length === 0);

  readonly tableSurfaceStyle = computed<Record<string, string>>(() => {
    const table = this.watchCurrentTable();
    const geo = computeHexMaskGeometry(table.width, table.height, table.gridSize, table.gridType);
    if (!geo) {
      return {
        width: '100%',
        height: '100%',
        left: '0px',
        top: '0px',
        '-webkit-mask': 'none',
        mask: 'none',
      };
    }
    const mask = buildHexOutlineMask(table.gridSize, table.gridType, table.width, table.height);
    return {
      width: `${geo.pixelW}px`,
      height: `${geo.pixelH}px`,
      left: `${-geo.offsetX}px`,
      top: `${-geo.offsetY}px`,
      '-webkit-mask': mask,
      mask,
    };
  });

  readonly tableSurfaceBorderStyle = computed<Record<string, string>>(() => {
    const table = this.watchCurrentTable();
    const background = buildHexOuterBorderSvg(table.gridSize, table.gridType, table.width, table.height);
    return { background: background || 'none' };
  });

  get backgroundImage(): ImageFile {
    return this.imageService.getEmptyOr(this.currentTable.backgroundImageIdentifier);
  }

  get backgroundFilterType(): FilterType {
    return this.currentTable.backgroundFilterType;
  }

  get isPointerDragging(): boolean {
    return this.pointerDeviceService.isDragging;
  }
  private readonly stackOrderVersion = signal(0);

  readonly characters = computed(() => {
    this.objectChangeService.collectionOf('character')();
    this.stackOrderVersion();
    // Siblings that sit on the same spot are painted in the order they are laid out.
    return [...this.tabletopService.characters].sort((a, b) => a.zindex - b.zindex);
  });
  readonly tableMasks = computed(() => {
    this.objectChangeService.collectionOf('table-mask')();
    return this.tabletopService.tableMasks;
  });
  readonly tableScratchMasks = computed(() => {
    this.objectChangeService.collectionOf('table-scratch-mask')();
    return this.tabletopService.tableScratchMasks;
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
  readonly ambiences = computed(() => {
    this.objectChangeService.collectionOf('table-ambience')();
    return this.tabletopService.ambiences;
  });
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

  /** Anything standing on a board is drawn by that board, so the table passes it over. */
  private static bySurface<T extends { location: { surface?: string } }>(
    list: readonly T[]
  ): Record<TableSurface, T[]> {
    const result = TABLE_SURFACES.reduce(
      (acc, s) => {
        acc[s] = [];
        return acc;
      },
      {} as Record<TableSurface, T[]>
    );
    for (const item of list) {
      if (boardSurfaceOf(item)) continue;
      result[surfaceOf(item)].push(item);
    }
    return result;
  }

  readonly charactersBySurface = computed(() => GameTableComponent.bySurface(this.characters()));
  readonly cardsBySurface = computed(() => GameTableComponent.bySurface(this.cards()));
  readonly cardStacksBySurface = computed(() => GameTableComponent.bySurface(this.cardStacks()));
  readonly rangesBySurface = computed(() => GameTableComponent.bySurface(this.ranges()));
  readonly textNotesBySurface = computed(() => GameTableComponent.bySurface(this.textNotes()));
  readonly diceSymbolsBySurface = computed(() => GameTableComponent.bySurface(this.diceSymbols()));
  readonly coinsBySurface = computed(() => GameTableComponent.bySurface(this.coins()));
  readonly terrainsBySurface = computed(() => GameTableComponent.bySurface(this.terrains()));

  readonly beamTopGrids = computed<readonly BeamTopGrid[]>(() => {
    const table = this.currentTable;
    this.objectChangeService.versionOf(table.identifier)();
    this.objectChangeService.versionOf(this.tableSelecter.identifier)();
    if (!table.gridShow) return NO_BEAM_TOP_GRIDS;
    const grid = table.gridSize;
    const dims: SurfaceDims = {
      widthPx: table.width * grid,
      depthPx: table.height * grid,
      wallHeightPx: table.wallHeight * grid,
    };
    const result: BeamTopGrid[] = [];
    for (const terrain of this.terrains()) {
      this.objectChangeService.versionOf(terrain.identifier)();
      const geo = beamTopGridGeometry(terrain, dims, grid);
      if (!geo) continue;
      result.push({
        identifier: terrain.identifier,
        ...geo,
        dataUrl: this.gridFaces.dataUrl(table, geo.width, geo.height, geo.top, geo.left, '', null),
      });
    }
    return result.length > 0 ? result : NO_BEAM_TOP_GRIDS;
  });

  readonly beamWallGrids = computed<readonly BeamWallGrid[]>(() => {
    const table = this.currentTable;
    this.objectChangeService.versionOf(table.identifier)();
    this.objectChangeService.versionOf(this.tableSelecter.identifier)();
    if (!table.gridShow) return NO_BEAM_WALL_GRIDS;
    const grid = table.gridSize;
    const dims: SurfaceDims = {
      widthPx: table.width * grid,
      depthPx: table.height * grid,
      wallHeightPx: table.wallHeight * grid,
    };
    const result: BeamWallGrid[] = [];
    for (const terrain of this.terrains()) {
      this.objectChangeService.versionOf(terrain.identifier)();
      const face = beamWallFaceGrid(terrain, dims, grid);
      if (!face) continue;
      result.push({
        identifier: terrain.identifier,
        matrix3d: face.matrix3d,
        width: face.width,
        height: face.height,
        dataUrl: this.gridFaces.dataUrl(
          table,
          face.width,
          face.height,
          face.offsetTop,
          face.offsetLeft,
          face.prefix,
          null
        ),
      });
    }
    return result.length > 0 ? result : NO_BEAM_WALL_GRIDS;
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

  buildContextMenuActions(objectPosition: PointerCoordinate): ContextMenuAction[] {
    return this.buildContextMenuModel(objectPosition).actions;
  }

  buildContextMenuModel(objectPosition: PointerCoordinate): {
    actions: ContextMenuAction[];
    rotatingGroups: ContextMenuRadialGroup[];
  } {
    const [primaryCreateActions, secondaryCreateActions] =
      this.tabletopActionService.makeDefaultContextMenuActionGroups(objectPosition);
    secondaryCreateActions.push({
      name: this.t('feature.tabletop.action.createDeck'),
      action: () => {
        void this.openDeckBuilder(objectPosition);
      },
    });
    if (this.mobileLayout.isActive()) {
      secondaryCreateActions.push({
        name: this.t('feature.tabletop.contextMenu.createWithOptions'),
        action: () => {
          this.roomPanels.open('characterGenerator', { width: 460, height: 420 });
        },
      });
    }
    const tableSettingAction: ContextMenuAction = {
      name: this.t('feature.tabletop.tableSetting.title'),
      action: () => {
        void this.openTableSetting();
      },
    };
    const tableSettingActions = [tableSettingAction, ...this.buildViewLockActions()];
    return {
      actions: [
        ...primaryCreateActions,
        ContextMenuSeparator,
        ...secondaryCreateActions,
        ContextMenuSeparator,
        ...tableSettingActions,
      ],
      rotatingGroups: [
        {
          name: this.t('feature.tabletop.contextMenu.createObject1'),
          icon: 'add_circle',
          actions: primaryCreateActions,
        },
        {
          name: this.t('feature.tabletop.contextMenu.createObject2'),
          icon: 'add_box',
          actions: secondaryCreateActions,
        },
        {
          name: this.t('feature.tabletop.tableSetting.title'),
          icon: 'tune',
          actions: tableSettingActions,
        },
      ],
    };
  }

  /**
   * Holding the view still, and putting it back on real size.
   *
   * Only in 2D, where a screen is laid flat and the miniatures sit on it. The entries go into
   * both menus because the flat one is what the four-way hamburger opens when the rotating
   * menu is off, and a table using that would otherwise have no way to reach them.
   */
  private buildViewLockActions(): ContextMenuAction[] {
    if (!this.tabletopService.mode2d()) return [];
    const actions: ContextMenuAction[] = [
      buildToggleAction(
        this.viewLock.locked(),
        (next) => {
          this.viewLock.set(next);
          this.syncViewLock();
        },
        {
          on: this.t('feature.tabletop.contextMenu.viewLockOn'),
          off: this.t('feature.tabletop.contextMenu.viewLockOff'),
        }
      ),
    ];
    // Offered only where it would do something: under perspective there is no one scale to set,
    // and an entry that quietly does nothing is worse than one that is not there.
    if (this.displayCalibration.isCalibrated() && this.tabletopService.orthographicProjection()) {
      actions.push({
        name: this.t('feature.tabletop.contextMenu.snapToRealSize'),
        action: () => {
          // Real size brings the lock with it; the service settles that for every way in.
          this.displayCalibration.setRealSizeEnabled(true);
          this.snapToRealSize();
          this.syncViewLock();
        },
      });
    }
    return actions;
  }

  onContextMenu(e: MouseEvent) {
    if (!document.activeElement?.contains(this.gameObjects().nativeElement)) return;
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const menuPosition = this.pointerDeviceService.pointers[0];
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    this.openTableContextMenu(menuPosition, objectPosition);
  }

  openTableContextMenu(menuPosition: PointerCoordinate, objectPosition: PointerCoordinate): void {
    const menu = this.buildContextMenuModel(objectPosition);
    const table = this.currentTable;
    const display = this.tabletopService.display();
    if (this.tabletopService.mode2d()) {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.rotatingGroups,
        table.name,
        display.radialMenuEnabled,
        display.radialMenuRotationSpeed,
        multiAngleFontScaleFactor(display.multiAngleFontScale)
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, table.name);
  }
  onDocumentMouseDown(_e: MouseEvent) {
    this.gestureService.isTableTransformed = false;
  }

  onDocumentTouchStart(_e: TouchEvent) {
    this.gestureService.isTableTransformed = false;
  }

  onDocumentContextMenu(e: MouseEvent) {
    if (this.gestureService.isTableTransformed && !this.pointerDeviceService.isAllowedToOpenContextMenu)
      e.preventDefault();
  }

  /** The jolt of an effect, which shakes the camera with it. */
  readonly screenShake = computed(() => this.effectPlaybackService.shake());
  readonly screenFlash = computed(() => this.effectPlaybackService.flash());

  readonly isPickingTarget = computed(() => this.cardTargetService.isPicking());
  readonly isPickingEffectTarget = computed(() => this.effectTargetingService.isPicking());
  /** Whether a move is being worked out, which is when the table says how to work one out. */
  readonly isPlanningMove = this.movePlan.isPlanning;

  onEscapeKey(_e: Event) {
    if (this.effectTargetingService.cancel()) return;
    if (this.cardTargetService.cancelPicking()) return;
    this.selectionSignalService.clearSelection();
  }

  /** Confirming a target. It does not steal the key from a field being typed into. */
  onEnterKey(event: Event) {
    if (!this.effectTargetingService.isPicking() || isTypingTarget(event.target)) return;
    event.preventDefault();
    this.effectTargetingService.confirm();
  }

  private wallFaceFor(surface: TableSurface): WallFace | null {
    const table = this.watchCurrentTable();
    return wallFaceFor(
      surface,
      table.width * table.gridSize,
      table.height * table.gridSize,
      table.wallHeight * table.gridSize
    );
  }

  protected readonly wallBaseFilter = computed<string | null>(() => {
    const brightness = this.visionService.ambientBrightness();
    return brightness < 1 ? 'brightness(' + brightness.toFixed(3) + ')' : null;
  });

  protected readonly wallViews = computed<readonly WallView[]>(() =>
    this.activeWalls().map((wall) => ({
      wall,
      pools: this.wallPoolsFor(wall.surface).map((pool) => ({
        style: this.wallPoolStyleFor(pool, wall.surface, wall.widthPx),
      })),
      silhouettes: this.wallSilhouettesFor(wall.surface).map((silhouette) => ({
        background: this.wallSilhouetteBg(silhouette),
        style: this.wallSilhouetteStyleFor(silhouette, wall.surface, wall.widthPx),
      })),
    }))
  );

  protected wallSilhouettesFor(surface: TableSurface): WallSilhouette[] {
    const face = this.wallFaceFor(surface);
    return face ? this.visionService.wallSilhouettes(face) : [];
  }

  protected wallPoolsFor(surface: TableSurface): WallLight[] {
    const face = this.wallFaceFor(surface);
    return face ? this.visionService.wallLights(face) : [];
  }

  protected wallPoolStyleFor(pool: WallLight, surface: TableSurface, faceLen: number): Record<string, string> {
    return wallLightLayerStyle(pool, wallIsMirrored(surface), faceLen);
  }

  protected wallSilhouetteBg(silhouette: WallSilhouette): string {
    return wallSilhouetteBackground(silhouette);
  }

  protected wallSilhouetteStyleFor(
    silhouette: WallSilhouette,
    surface: TableSurface,
    faceLen: number
  ): Record<string, string> {
    return wallSilhouetteStyle(silhouette, wallIsMirrored(surface), faceLen);
  }

  private watchCurrentTable(): GameTable {
    const table = this.currentTable;
    this.objectChangeService.versionOf(table.identifier)();
    this.objectChangeService.versionOf(this.tableSelecter.identifier)();
    return table;
  }

  private tableVisualCenter(): { x: number; y: number } {
    const table = this.currentTable;
    const geo = computeHexMaskGeometry(table.width, table.height, table.gridSize, table.gridType);
    if (geo) {
      return {
        x: -geo.offsetX + geo.pixelW / 2,
        y: -geo.offsetY + geo.pixelH / 2,
      };
    }
    return {
      x: this.gridCanvas().nativeElement.clientWidth / 2,
      y: this.gridCanvas().nativeElement.clientHeight / 2,
    };
  }

  private setGameTableGrid(
    width: number,
    height: number,
    gridSize: number = 50,
    gridType: GridType = GridType.SQUARE,
    gridColor: string = '#000000e6',
    gridFontColor: string = gridColor
  ) {
    this.gameTable().nativeElement.style.width = width * gridSize + 'px';
    this.gameTable().nativeElement.style.height = height * gridSize + 'px';

    const render = new GridLineRender(this.gridCanvas().nativeElement);
    const geo = computeHexMaskGeometry(width, height, gridSize, gridType);
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
      render.render(width, height, gridSize, gridType, gridColor, gridFontColor);
    }

    setTimeout(() => {
      // So the update runs after the information has caught up with another player's change.
      const opacity: number = this.currentTable.gridShow ? 1.0 : 0.0;
      this.gridCanvas().nativeElement.style.opacity = opacity + '';
    });
  }
}
