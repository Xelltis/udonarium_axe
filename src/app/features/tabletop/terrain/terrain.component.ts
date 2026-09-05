import { NgStyle } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  Signal,
  signal,
  viewChildren,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { TerrainFogCover, VisionService } from '@axe/application/tabletop/vision.service';
import { ContextMenuSeparator, ContextMenuService } from '@axe/application/ui/context-menu.service';
import { buildOverlapContextMenu } from '@axe/application/ui/overlap-context-menu';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { buildSurfaceSwitchContextMenu } from '@axe/application/ui/surface-switch-context-menu';
import { TabletopOverlapService } from '@axe/application/ui/tabletop-overlap.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ImageFile } from '@axe/core/storage/image-file';
import { PERF_TERRAIN_GRID_RASTER, perfCounters } from '@axe/core/util/perf-counters';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, SlopeDirection, Terrain, TerrainFace } from '@axe/domain/tabletop/terrain';
import { WallFace, WallLight, WallSilhouette } from '@axe/domain/tabletop/vision-scene';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import {
  computeHexSlopeSteps,
  HexSlopeStepData,
  HexSlopeStepFloor,
} from '@axe/features/tabletop/terrain/hex-slope-step-geometry';
import { buildTerrainContextMenu } from '@axe/features/tabletop/terrain/terrain-context-menu';
import { terrainWallFace, type WallSide } from '@axe/features/tabletop/terrain/terrain-wall-face';
import {
  wallLightLayerStyle,
  wallSilhouetteBackground,
  wallSilhouetteStyle,
} from '@axe/features/tabletop/wall-projection';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { SafePipe } from '@axe/ui/pipes/safe.pipe';
import { allCleared, fogClipPath, FogClipRect, fogClipRuns } from '@axe/ui/tabletop/fog-clip';
import { buildHexRingClipPath, calcHexFlowerParams, HexFlowerParams } from '@axe/ui/tabletop/hex-pedestal-geometry';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import {
  ShadedBackground,
  shadedBackgroundGrid,
  shadedBackgroundImage,
  STRETCHED_TEXTURE,
  TextureLayout,
} from '@axe/ui/tabletop/shaded-background';
import { translateZCss, Z_OFFSET_TABLETOP_OBJECT_PX } from '@axe/ui/tabletop/z-offset';

interface TerrainGridBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface TerrainGridViewport extends TerrainGridBounds {
  canvasLeft: number;
  canvasTop: number;
  canvasWidth: number;
  canvasHeight: number;
  offsetLeft: number;
  offsetTop: number;
}

const NO_HEX_SLOPE: HexSlopeStepData = { floors: [], walls: [] };

/** The same list, or two empty ones: an empty @for renders nothing either way. */
function sameOrBothEmpty<T>(a: readonly T[], b: readonly T[]): boolean {
  return a === b || (a.length === 0 && b.length === 0);
}

@Component({
  selector: 'terrain',
  templateUrl: './terrain.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, RotableDirective, SelectableDirective, NgStyle, SafePipe],
  host: {
    class: 'block',
    '[style.display]': "isHiddenByFog() ? 'none' : null",
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class TerrainComponent {
  private readonly imageService = inject(ImageService);
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  protected readonly tabletopService = inject(TabletopService);
  protected readonly visionService = inject(VisionService);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tabletopOverlap = inject(TabletopOverlapService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  constructor() {
    effect(() => {
      this.uiSignalService.terrainGridShowVersion();
      let opacity: number = 0.0;
      if (this.terrain().isGrid && !this.onWall()) {
        opacity = 1.0;
      }
      this.setGridCanvasOpacity(opacity);
    });
    effect(() => {
      this.uiSignalService.terrainGridEndVersion();
      let opacity: number = 0.0;
      if (this.terrain().isGrid && !this.onWall()) {
        if (this.tableSelecter.viewTable?.gridShow) {
          opacity = 1.0;
        }
      }
      this.setGridCanvasOpacity(opacity);
    });
    effect(() => {
      const gridCanvases = this.gridCanvases();
      this.gridRasterKey();
      if (!this._initialized || gridCanvases.length < 1) return;
      this.rasterizeGrid();
    });
    setupMovableRotableForPiece(this, {
      target: this.terrain,
      collideLayers: ['terrain'],
    });
    afterNextRender(() => {
      this._initialized = true;
      this.rasterizeGrid();
    });
  }

  /**
   * Where the grid is cut from, and how far the canvas is slid so the cut lands true.
   *
   * A terrain dragged across the floor moves the grid under it a pixel at a time, and cutting
   * the lines again for every pixel is most of what a drag costs. The lines only look
   * different once the terrain crosses into another cell, so the cut is taken from the corner
   * of the cell it stands in, one cell wider than it needs, and the canvas is slid back by
   * the part of a cell it has travelled. Slid a whole number of pixels the cut draws the same
   * picture; slid a fraction it would not, so a terrain standing off the pixel grid, which a
   * hex table or a turned terrain can be, is cut afresh as before.
   */
  private readonly gridSlide = computed(() => {
    this.terrainVersion();
    const viewport = this.getGridViewport(this.getFloorBounds());
    const grid = this.gridSize;
    const restX = viewport.offsetLeft - Math.floor(viewport.offsetLeft / grid) * grid;
    const restY = viewport.offsetTop - Math.floor(viewport.offsetTop / grid) * grid;
    // A turned terrain rotates its canvas about the canvas centre, and growing the canvas
    // moves that centre, so a turned one is cut afresh however whole the remainder looks.
    if (grid <= 0 || this.terrainRotate() !== 0 || !Number.isInteger(restX) || !Number.isInteger(restY)) {
      return {
        viewport,
        offsetLeft: viewport.offsetLeft,
        offsetTop: viewport.offsetTop,
        slideX: 0,
        slideY: 0,
        grow: 0,
      };
    }
    return {
      viewport,
      offsetLeft: viewport.offsetLeft - restX,
      offsetTop: viewport.offsetTop - restY,
      slideX: -restX,
      slideY: -restY,
      grow: grid,
    };
  });

  /**
   * Everything the grid is cut from. The same key cuts the same picture, so it is cut once.
   */
  private readonly gridRasterKey = computed(() => {
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf(this.tabletopService.currentTable.identifier)();
    const table = this.currentTable;
    const slide = this.gridSlide();
    const bbox = this.pedestalHexParams()?.bbox;
    return [
      this.width(),
      this.depth(),
      this.gridSize,
      table.gridType,
      table.gridColor,
      table.gridFontColor,
      this.terrainRotate(),
      slide.offsetLeft,
      slide.offsetTop,
      slide.grow,
      bbox ? `${bbox.minX}:${bbox.minY}:${bbox.maxX}:${bbox.maxY}` : '',
      this.hexSlopeSteps().floors.length,
    ].join('|');
  });

  private rasterizeGrid(): void {
    this.setGameTableGrid(this.currentTable.gridType, this.currentTable.gridColor, this.currentTable.gridFontColor);
  }

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

  readonly terrain = input.required<Terrain>();
  readonly is3D = input(false);
  readonly gridCanvases = viewChildren<ElementRef<HTMLCanvasElement>>('gridCanvas');

  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  get currentTable(): GameTable {
    return this.tabletopService.currentTable;
  }

  private readonly terrainVersion = computed(() => this.objectChange.versionOf(this.terrain().identifier)());

  readonly name = computed(() => {
    this.terrainVersion();
    this.objectChange.versionOf(this.currentTable.identifier)();
    this.objectChange.versionOf(this.tableSelecter.identifier)();
    return this.terrain().name;
  });
  readonly isLocked = computed(() => {
    this.terrainVersion();
    return this.terrain().isLocked;
  });
  readonly hasWall = computed(() => {
    this.terrainVersion();
    return this.terrain().hasWall;
  });
  readonly hasFloor = computed(() => {
    this.terrainVersion();
    return this.terrain().hasFloor;
  });

  readonly wallImage = computed(
    () => {
      this.objectChange.fileVersion();
      this.terrainVersion();
      return this.imageService.getSkeletonOr(this.terrain().wallImage);
    },
    { equal: imageFileEqual() }
  );
  readonly floorImage = computed(
    () => {
      this.objectChange.fileVersion();
      this.terrainVersion();
      return this.imageService.getSkeletonOr(this.terrain().floorImage);
    },
    { equal: imageFileEqual() }
  );

  /**
   * A terrain nobody has given a picture to.
   *
   * It used to be shown as a white block, which is a placeholder standing in the way of the
   * map. It is glass instead: the wall is there and stops what it stops, but only the game
   * master is shown where it stands.
   */
  readonly isBlank = computed(() => {
    this.objectChange.fileVersion();
    this.terrainVersion();
    return !this.terrain().hasFaceImage;
  });

  readonly showsBlankOutline = computed(() => {
    this.objectChange.trackMyCursor();
    return this.isBlank() && this.rolePermission.canSeeHidden;
  });

  private faceImageOf(face: TerrainFace) {
    this.objectChange.fileVersion();
    this.terrainVersion();
    if (this.isBlank()) return ImageFile.Empty;
    return this.imageService.getSkeletonOr(this.terrain().faceImage(face));
  }
  readonly topFaceImage = computed(() => this.faceImageOf('top'), { equal: imageFileEqual() });
  readonly northFaceImage = computed(() => this.faceImageOf('north'), { equal: imageFileEqual() });
  readonly southFaceImage = computed(() => this.faceImageOf('south'), { equal: imageFileEqual() });
  readonly eastFaceImage = computed(() => this.faceImageOf('east'), { equal: imageFileEqual() });
  readonly westFaceImage = computed(() => this.faceImageOf('west'), { equal: imageFileEqual() });

  readonly height = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().height);
  });
  readonly width = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().width);
  });
  readonly depth = computed(() => {
    this.terrainVersion();
    return Math.max(0, this.terrain().depth);
  });
  readonly altitude = computed(() => {
    this.terrainVersion();
    return this.terrain().altitude;
  });

  readonly isDropShadow = computed(() => {
    this.terrainVersion();
    return this.terrain().isDropShadow;
  });
  readonly isSurfaceShading = computed(() => {
    this.terrainVersion();
    return this.terrain().isSurfaceShading;
  });
  readonly doorStyle = computed(() => {
    this.terrainVersion();
    return this.terrain().doorStyle;
  });
  readonly isDoor = computed(() => this.doorStyle() !== DoorStyle.NONE);
  readonly isDoorOpen = computed(() => {
    this.terrainVersion();
    return this.terrain().isDoorOpen;
  });

  /** A door thin across x turns on a hinge at one end of its long side, and the other way round. */
  private readonly hingeOnLongY = computed(() => this.width() < this.depth());

  readonly doorMirrored = computed(() => {
    this.terrainVersion();
    return this.terrain().doorMirrored;
  });

  readonly doorTransform = computed(() => {
    if (!this.isDoor() || !this.isDoorOpen()) return '';
    const mirrored = this.doorMirrored() ? -1 : 1;
    switch (this.doorStyle()) {
      case DoorStyle.SWING:
        return ` rotateZ(${(this.hingeOnLongY() ? -95 : 95) * mirrored}deg)`;
      case DoorStyle.SLIDE: {
        // It runs the length of itself, which puts it inside the wall it was set into.
        const along = (this.hingeOnLongY() ? this.depth() : this.width()) * this.gridSize * mirrored;
        return this.hingeOnLongY() ? ` translateY(${along}px)` : ` translateX(${along}px)`;
      }
      case DoorStyle.LIFT:
        return ` translateZ(${this.height() * this.gridSize}px)`;
      case DoorStyle.SINK:
        return ` translateZ(${-this.height() * this.gridSize}px)`;
      default:
        return '';
    }
  });

  readonly doorOrigin = computed(() => {
    if (!this.isDoor() || this.doorStyle() !== DoorStyle.SWING) return '';
    if (this.hingeOnLongY()) return this.doorMirrored() ? 'center bottom' : 'center top';
    return this.doorMirrored() ? 'right center' : 'left center';
  });

  protected onDoorClick(): void {
    if (!this.isDoor() || this.pointerDeviceService.isDragging) return;
    const terrain = this.terrain();
    terrain.isDoorOpen = !terrain.isDoorOpen;
    SoundEffect.play(terrain.isDoorOpen ? PresetSound.unlock : PresetSound.lock);
  }

  readonly isTiledTexture = computed(() => {
    this.terrainVersion();
    return this.terrain().isTiledTexture;
  });
  private readonly textureLayout = computed<TextureLayout>(() => {
    if (!this.isTiledTexture()) return STRETCHED_TEXTURE;
    const side = `${this.gridSize}px`;
    return { size: `${side} ${side}`, repeat: 'repeat' };
  });
  readonly tileStyle = computed((): Record<string, string> => {
    if (!this.isTiledTexture()) return {};
    const texture = this.textureLayout();
    return { 'background-size': texture.size, 'background-repeat': texture.repeat };
  });

  readonly isSlope = computed(() => {
    this.terrainVersion();
    return this.terrain().isSlope;
  });
  readonly slopeDirection = computed(() => {
    this.terrainVersion();
    const terrain = this.terrain();
    if (!terrain.isSlope) return SlopeDirection.NONE;
    if (terrain.slopeDirection === SlopeDirection.NONE) return SlopeDirection.BOTTOM;
    return terrain.slopeDirection;
  });

  readonly isAltitudeIndicate = computed(() => {
    this.terrainVersion();
    return this.terrain().isAltitudeIndicate;
  });
  readonly terrainRotate = computed(() => {
    this.terrainVersion();
    return this.terrain().rotate;
  });

  readonly isGrid = computed(() => {
    this.terrainVersion();
    return this.terrain().isGrid;
  });

  readonly showsGrid = computed(() => this.isGrid() && !this.onWall());

  readonly isVisibleFloor = computed(() => 0 < this.width() * this.depth());
  readonly isVisibleWallTopBottom = computed(() => 0 < this.width() * this.height());
  readonly isVisibleWallLeftRight = computed(() => 0 < this.depth() * this.height());

  readonly onWall = computed(() => {
    this.terrainVersion();
    return surfaceOf(this.terrain()) !== 'floor';
  });

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }

  readonly isWallExist = computed(
    () => !!(this.hasWall() && this.wallImage() && this.wallImage().url && this.wallImage().url.length > 0)
  );

  readonly terreinAltitude = computed(() => {
    let ret = this.altitude();
    if (this.altitude() < 0 || (!this.isSlope() && !this.isWallExist())) ret += this.height();
    return ret;
  });

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private readonly gridType = computed(() => {
    this.objectChange.versionOf(this.tabletopService.tableSelecter.identifier)();
    this.objectChange.versionOf(this.tabletopService.currentTable.identifier)();
    return this.currentTable.gridType;
  });

  readonly pedestalHexParams = computed<HexFlowerParams | null>(() => {
    const gridType = this.gridType();
    if (!isHexGrid(gridType)) return null;
    const hexSize = Math.min(this.width(), this.depth());
    if (hexSize < 1) return null;
    return calcHexFlowerParams(hexSize, this.gridSize, isFlatTopGrid(gridType));
  });

  readonly isHex = computed(() => this.pedestalHexParams() !== null);

  readonly isHexSlope = computed(() => this.isHex() && this.isSlope() && this.slopeDirection() !== SlopeDirection.NONE);

  readonly hexSlopeSteps = computed<HexSlopeStepData>(() => {
    const params = this.pedestalHexParams();
    if (!params || !this.isHexSlope()) return NO_HEX_SLOPE;
    return computeHexSlopeSteps(
      Math.min(this.width(), this.depth()),
      this.gridSize,
      isFlatTopGrid(this.currentTable.gridType),
      this.slopeDirection(),
      this.height(),
      this.isSurfaceShading(),
      this.width() * this.gridSize,
      this.depth() * this.gridSize,
      params.bbox
    );
  });

  // Computed, so neither the record nor the clip path is rebuilt on every change-detection pass.
  readonly pedestalStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    if (!params) return {} as Record<string, string>;
    const { outline, bbox, L } = params;
    const W = bbox.maxX - bbox.minX;
    const H = bbox.maxY - bbox.minY;
    return {
      background: '#ccc',
      clipPath: buildHexRingClipPath(outline, bbox, 7),
      border: 'none',
      borderRadius: '0',
      width: `${W}px`,
      height: `${H}px`,
      left: `${bbox.minX + L / 2}px`,
      top: `${bbox.minY + L / 2}px`,
    };
  });

  readonly pedestalGrabStyle = computed<Record<string, string>>(() => {
    const params = this.pedestalHexParams();
    if (!params) return {} as Record<string, string>;
    const { bbox, L } = params;
    const halfW = (bbox.maxX - bbox.minX) / 2;
    const halfH = (bbox.maxY - bbox.minY) / 2;
    const radius = Math.sqrt(halfW * halfW + halfH * halfH) + 14;
    const diameter = radius * 2;
    return {
      width: `${diameter}px`,
      height: `${diameter}px`,
      left: `${L / 2 - radius}px`,
      top: `${L / 2 - radius}px`,
      borderRadius: '50%',
    };
  });

  readonly hexFloorClipPath = computed<string | null>(() => {
    const params = this.pedestalHexParams();
    if (!params) return null;
    const { outline, bbox } = params;
    const W = bbox.maxX - bbox.minX;
    const H = bbox.maxY - bbox.minY;
    const points = outline
      .map((v) => {
        const px = v.x - bbox.minX;
        const py = v.y - bbox.minY;
        return `${((px / W) * 100).toFixed(2)}% ${((py / H) * 100).toFixed(2)}%`;
      })
      .join(', ');
    return `polygon(${points})`;
  });

  readonly hexFloorDimStyle = computed<Record<string, string>>(() => {
    const bounds = this.getFloorBounds();
    if (!this.pedestalHexParams()) return {} as Record<string, string>;
    return {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
    };
  });

  readonly terrainGridClipStyle = computed<Record<string, string>>(() => this.makeTerrainGridClipStyle());

  terrainGridClipStepStyle(step: HexSlopeStepFloor): Record<string, string> {
    return this.makeTerrainGridClipStyle(step);
  }

  private makeTerrainGridClipStyle(step?: HexSlopeStepFloor): Record<string, string> {
    const bounds = this.getFloorBounds();
    const clipPath = this.hexFloorClipPath();
    const transform =
      step != null
        ? 'translateZ(' + step.heightPx + 'px)'
        : 'translateZ(' + (this.height() / (this.isSlope() ? 2 : 1)) * this.gridSize + 'px)' + this.floorModCss();
    const style: Record<string, string> = {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      'backface-visibility': this.isSlope() ? 'visible' : 'hidden',
      transform,
      filter: 'brightness(' + this.floorBrightness() + ')',
    };
    if (step != null) {
      style['-webkit-mask'] = step.mask;
      style.mask = step.mask;
    } else {
      style['clip-path'] = clipPath ?? 'none';
    }
    return style;
  }

  readonly terrainGridCanvasStyle = computed<Record<string, string>>(() => {
    const slide = this.gridSlide();
    const viewport = slide.viewport;
    return {
      width: `${viewport.canvasWidth + slide.grow}px`,
      height: `${viewport.canvasHeight + slide.grow}px`,
      left: `${viewport.canvasLeft + slide.slideX}px`,
      top: `${viewport.canvasTop + slide.slideY}px`,
      'backface-visibility': this.isSlope() ? 'visible' : 'hidden',
      transform: `rotateZ(${-this.terrainRotate()}deg) ${translateZCss(Z_OFFSET_TABLETOP_OBJECT_PX)}`,
    };
  });

  readonly hexWalls = computed<{ edgeLength: number; px: number; py: number; angle: number; brightness: number }[]>(
    () => {
      const params = this.pedestalHexParams();
      if (!params) return [];
      const { outline } = params;
      const containerW = this.width() * this.gridSize;
      const containerH = this.depth() * this.gridSize;
      const useSurfaceShading = this.isSurfaceShading();

      return outline.map((v1, i) => {
        const v2 = outline[(i + 1) % outline.length];
        const dx = v2.x - v1.x;
        const dy = v2.y - v1.y;
        const edgeLength = Math.sqrt(dx * dx + dy * dy);
        const edgeAngle = Math.atan2(dy, dx);

        const brightness = useSurfaceShading
          ? Math.max(0.3, Math.min(1.0, 0.65 - 0.35 * Math.cos(edgeAngle) + 0.15 * Math.sin(edgeAngle)))
          : 1.0;

        return {
          edgeLength: edgeLength + 1,
          px: containerW / 2 + v2.x,
          py: containerH / 2 + v2.y,
          angle: edgeAngle + Math.PI,
          brightness,
        };
      });
    }
  );

  math = Math;
  slopeDirectionState = SlopeDirection;

  private _initialized = false;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  onInputStart(_e: MouseEvent | TouchEvent) {
    this.input?.cancel();
  }

  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();

    if (!this.pointerDeviceService.isAllowedToOpenContextMenu) return;

    const menuPosition = this.pointerDeviceService.pointers[0];
    if (this.pieceContextMenu.openForSelection(this.terrain(), this.gridSize, menuPosition)) return;
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    const overlapEntries = buildOverlapContextMenu(
      this.tabletopOverlap,
      this.terrain(),
      menuPosition.x,
      menuPosition.y,
      this.translateFn
    );
    const menuArray = buildTerrainContextMenu(
      this.terrain()!,
      this.gridSize,
      objectPosition,
      this.inventoryService,
      this.tabletopActionService,
      (terrain) => this.showDetail(terrain),
      this.translateFn,
      overlapEntries
    );
    const surfaceEntries = buildSurfaceSwitchContextMenu(this.terrain()!, this.currentTable, this.translateFn);
    this.contextMenuService.open(
      menuPosition,
      surfaceEntries.length > 0 ? [...menuArray, ContextMenuSeparator, ...surfaceEntries] : menuArray,
      this.name()
    );
  }

  onMove() {
    SoundEffect.play(PresetSound.blockPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.blockPut);
  }

  readonly floorModCss = computed(() => {
    if (this.isHex()) return '';
    let ret = '';
    let tmp: number;
    switch (this.slopeDirection()) {
      case SlopeDirection.TOP:
        tmp = Math.atan(this.height() / this.depth());
        ret = ' rotateX(' + tmp + 'rad) scaleY(' + 1 / Math.cos(tmp) + ')';
        break;
      case SlopeDirection.BOTTOM:
        tmp = Math.atan(this.height() / this.depth());
        ret = ' rotateX(' + -tmp + 'rad) scaleY(' + 1 / Math.cos(tmp) + ')';
        break;
      case SlopeDirection.LEFT:
        tmp = Math.atan(this.height() / this.width());
        ret = ' rotateY(' + -tmp + 'rad) scaleX(' + 1 / Math.cos(tmp) + ')';
        break;
      case SlopeDirection.RIGHT:
        tmp = Math.atan(this.height() / this.width());
        ret = ' rotateY(' + tmp + 'rad) scaleX(' + 1 / Math.cos(tmp) + ')';
        break;
    }
    return ret;
  });

  private readonly floorShade = computed(() => {
    if (!this.isSurfaceShading()) return 1.0;
    switch (this.slopeDirection()) {
      case SlopeDirection.TOP:
        return 0.4;
      case SlopeDirection.LEFT:
        return 0.6;
      case SlopeDirection.RIGHT:
        return 0.9;
      default:
        return 1.0;
    }
  });

  private readonly fogCover = computed(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    return this.visionService.terrainFogCover(terrain);
  });

  /**
   * Ground nobody has walked to yet is not drawn at all.
   *
   * Only when none of it has been: a terrain the party has reached part of stays drawn, and
   * its faces are cut back to the part instead. The fog is laid on the floor and a wall
   * stands over it, so what is left drawn over unwalked ground would rise out of a blank.
   */
  readonly isHiddenByFog = computed(() => {
    const cover = this.fogCover();
    return cover !== null && !cover.cleared.some((cell) => cell);
  });

  /**
   * The part of a face the fog covers.
   *
   * Covered rather than cut away: a wall is a box, and a box with its faces cut is a shell
   * with holes in it, which from a low angle is seen straight through. The fog is laid over
   * the part nobody has reached instead, and the box stays closed.
   *
   * A hex board and a slope carry a clip of their own, and two cannot be laid on the one
   * element, so those are left to be shown or hidden whole as they were.
   */
  private fogClip(rects: FogClipRect[], cover: TerrainFogCover | null): string | null {
    if (!cover || this.isHex() || this.isSlope() || allCleared(cover.cleared) || rects.length === 0) return null;
    return fogClipPath(rects);
  }

  private fogVeilStyle(clip: string | null): Record<string, string> | null {
    if (!clip) return null;
    return {
      position: 'absolute',
      inset: '0',
      'clip-path': clip,
      'background-color': this.visionService.fogColor(),
      'pointer-events': 'none',
    };
  }

  /** The cells along one face, its left end first: the west and east faces stand up from the south end. */
  private edgeIndexes(cover: TerrainFogCover, side: WallSide): number[] {
    const { cols, rows } = cover;
    switch (side) {
      case 'north':
        return Array.from({ length: cols }, (_, col) => col);
      case 'south':
        return Array.from({ length: cols }, (_, col) => (rows - 1) * cols + col);
      case 'west':
        return Array.from({ length: rows }, (_, i) => (rows - 1 - i) * cols);
      default:
        return Array.from({ length: rows }, (_, i) => (rows - 1 - i) * cols + cols - 1);
    }
  }

  private edgeCells(cover: TerrainFogCover, side: WallSide): boolean[] {
    return this.edgeIndexes(cover, side).map((i) => cover.cleared[i]);
  }

  /**
   * The top of a block, shaded a cell at a time.
   *
   * The camera looks down on a table, so the top is the face most seen, and one figure for
   * the whole of it lights the far end of a wall whose near end alone stands in a torch's
   * reach.
   */
  /**
   * The shading and the veils, worked out once for the scene rather than once a frame.
   *
   * Building them takes a gradient stop per cell and a clip path per face, and a template
   * calls a plain method on every pass of change detection. A flickering lamp ticks twenty
   * times a second, and every terrain on the board was rebuilding all of it each time.
   */
  protected readonly topShade = computed(() => this.shadedTop(this.topFaceImage().url));
  protected readonly northShade = computed(() =>
    this.shadedFace(this.northFaceImage().url, this.isSurfaceShading() ? 0.3 : 1, 'north')
  );
  protected readonly southShade = computed(() => this.shadedFace(this.southFaceImage().url, 1, 'south'));
  protected readonly westShade = computed(() =>
    this.shadedFace(this.westFaceImage().url, this.isSurfaceShading() ? 0.5 : 1, 'west')
  );
  protected readonly eastShade = computed(() =>
    this.shadedFace(this.eastFaceImage().url, this.isSurfaceShading() ? 0.8 : 1, 'east')
  );

  protected readonly topFog = computed(() => this.topFogStyle());
  protected readonly northFog = computed(() => this.faceFogStyle('north'));
  protected readonly southFog = computed(() => this.faceFogStyle('south'));
  protected readonly westFog = computed(() => this.faceFogStyle('west'));
  protected readonly eastFog = computed(() => this.faceFogStyle('east'));

  private shadedTop(url: string): ShadedBackground {
    const cover = this.fogCover();
    const texture = this.textureLayout();
    if (!cover || this.isHex() || this.isSlope()) {
      return shadedBackgroundGrid(url, [this.floorBrightness()], 1, 1, texture);
    }
    const shade = this.floorShade();
    return shadedBackgroundGrid(
      url,
      cover.brightness.map((brightness) => shade * brightness),
      cover.cols,
      cover.rows,
      texture
    );
  }

  private shadedFace(url: string, base: number, side: WallSide): ShadedBackground {
    const cover = this.fogCover();
    const texture = this.textureLayout();
    if (!cover) return shadedBackgroundGrid(url, [base * this.ambientBrightness()], 1, 1, texture);
    const along = this.edgeIndexes(cover, side).map((i) => base * cover.brightness[i]);
    return shadedBackgroundGrid(url, along, along.length, 1, texture);
  }

  private faceFogStyle(side: WallSide): Record<string, string> | null {
    const cover = this.fogCover();
    if (!cover) return null;
    const height = this.height() * this.gridSize;
    const covered = this.edgeCells(cover, side).map((cell) => !cell);
    return this.fogVeilStyle(this.fogClip(fogClipRuns(covered, this.gridSize, 0, height), cover));
  }

  private topFogStyle(): Record<string, string> | null {
    const cover = this.fogCover();
    if (!cover) return null;
    const rects: FogClipRect[] = [];
    for (let row = 0; row < cover.rows; row++) {
      const line = cover.cleared.slice(row * cover.cols, (row + 1) * cover.cols).map((cell) => !cell);
      rects.push(...fogClipRuns(line, this.gridSize, row * this.gridSize, this.gridSize));
    }
    const style = this.fogVeilStyle(this.fogClip(rects, cover));
    if (!style) return null;
    // The top face is lifted to the height of the block, and its veil rides with it.
    const lift = (this.height() / (this.isSlope() ? 2 : 1)) * this.gridSize;
    return { ...style, transform: `translateZ(${lift}px)` + this.floorModCss() };
  }

  readonly centerBrightness = computed(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    const w = this.width() * this.gridSize;
    const d = this.depth() * this.gridSize;
    return this.visionService.terrainBrightness(
      terrain,
      terrain.location.x + w / 2,
      terrain.location.y + d / 2,
      Math.max(w, d) / 2
    );
  });

  readonly floorBrightness = computed(() => this.floorShade() * this.centerBrightness());

  protected wallShade(base: number): number {
    return base * this.centerBrightness();
  }

  protected shaded(url: string, brightness: number): string {
    return shadedBackgroundImage(url, brightness);
  }

  private faceOf(side: WallSide): WallFace {
    const terrain = this.terrain();
    return terrainWallFace(side, {
      x: terrain.location.x,
      y: terrain.location.y,
      widthPx: this.width() * this.gridSize,
      depthPx: this.depth() * this.gridSize,
      heightPx: this.height() * this.gridSize,
      rotateDeg: terrain.rotate,
    });
  }

  private lightsOf(side: WallSide): Signal<WallLight[]> {
    return computed(
      () => {
        this.terrainVersion();
        return this.visionService.wallLights(this.faceOf(side));
      },
      { equal: sameOrBothEmpty }
    );
  }

  private silhouettesOf(side: WallSide): Signal<WallSilhouette[]> {
    return computed(
      () => {
        this.terrainVersion();
        return this.visionService.wallSilhouettes(this.faceOf(side));
      },
      { equal: sameOrBothEmpty }
    );
  }

  protected readonly northLights = this.lightsOf('north');
  protected readonly southLights = this.lightsOf('south');
  protected readonly eastLights = this.lightsOf('east');
  protected readonly westLights = this.lightsOf('west');

  protected readonly northSilhouettes = this.silhouettesOf('north');
  protected readonly southSilhouettes = this.silhouettesOf('south');
  protected readonly eastSilhouettes = this.silhouettesOf('east');
  protected readonly westSilhouettes = this.silhouettesOf('west');

  private readonly ambientBrightness = computed(() => {
    this.terrainVersion();
    return this.visionService.ambientBrightness();
  });

  /** A face starts at its north or west end, and the west and east faces stand up from the south. */
  private faceIsMirrored(side: WallSide): boolean {
    return side === 'west' || side === 'east';
  }

  protected wallLightStyle(pool: WallLight, side: WallSide): Record<string, string> {
    return wallLightLayerStyle(
      pool,
      this.faceIsMirrored(side),
      this.depth() * this.gridSize,
      this.isTiledTexture() ? this.gridSize : 0
    );
  }

  protected silhouetteBackground(silhouette: WallSilhouette): string {
    return wallSilhouetteBackground(silhouette);
  }

  protected silhouetteStyle(silhouette: WallSilhouette, side: WallSide): Record<string, string> {
    return wallSilhouetteStyle(silhouette, this.faceIsMirrored(side), this.depth() * this.gridSize);
  }

  private getFloorBounds(width: number = this.width(), depth: number = this.depth()): TerrainGridBounds {
    const params = this.pedestalHexParams();
    if (!params) {
      return {
        left: 0,
        top: 0,
        width: width * this.gridSize,
        height: depth * this.gridSize,
      };
    }
    const { bbox } = params;
    const containerW = width * this.gridSize;
    const containerH = depth * this.gridSize;
    return {
      left: containerW / 2 + bbox.minX,
      top: containerH / 2 + bbox.minY,
      width: bbox.maxX - bbox.minX,
      height: bbox.maxY - bbox.minY,
    };
  }

  private getGridViewport(bounds: TerrainGridBounds): TerrainGridViewport {
    const radians = (this.terrainRotate() * Math.PI) / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    const canvasWidth = Math.max(1, bounds.width * cos + bounds.height * sin);
    const canvasHeight = Math.max(1, bounds.width * sin + bounds.height * cos);
    const canvasLeft = (bounds.width - canvasWidth) / 2;
    const canvasTop = (bounds.height - canvasHeight) / 2;

    return {
      ...bounds,
      canvasLeft,
      canvasTop,
      canvasWidth,
      canvasHeight,
      offsetLeft: this.terrain().location.x + bounds.left + canvasLeft,
      offsetTop: this.terrain().location.y + bounds.top + canvasTop,
    };
  }

  private showDetail(gameObject: Terrain) {
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.terrain'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 600, height: 300 });
  }

  private setGameTableGrid(
    gridType: GridType = GridType.SQUARE,
    gridColor: string = '#000000e6',
    gridFontColor: string = gridColor
  ) {
    if (this.gridCanvases().length < 1) return;
    const slide = this.gridSlide();

    perfCounters.bump(PERF_TERRAIN_GRID_RASTER);
    for (const gridCanvas of this.gridCanvases()) {
      const render = new GridLineRender(gridCanvas.nativeElement);
      render.renderViewport(
        slide.viewport.canvasWidth + slide.grow,
        slide.viewport.canvasHeight + slide.grow,
        this.gridSize,
        gridType,
        gridColor,
        gridFontColor,
        slide.offsetTop,
        slide.offsetLeft
      );
    }
    let opacity: number = 0.0;
    setTimeout(() => {
      if (this.terrain().isGrid && !this.onWall()) {
        if (this.tableSelecter.viewTable?.gridShow) {
          opacity = 1.0;
        }
      }
      this.setGridCanvasOpacity(opacity);
    }, 0);
  }

  private setGridCanvasOpacity(opacity: number) {
    for (const gridCanvas of this.gridCanvases()) {
      gridCanvas.nativeElement.style.opacity = opacity + '';
    }
  }
}
