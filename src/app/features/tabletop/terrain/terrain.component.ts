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
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ImageService } from '@axe/application/storage/image.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TerrainFogCover, VisionService } from '@axe/application/tabletop/vision.service';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { imageFileEqual } from '@axe/core/storage/image-file';
import { ImageFile } from '@axe/core/storage/image-file';
import { PERF_TERRAIN_GRID_RASTER, perfCounters } from '@axe/core/util/perf-counters';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { buildHexRingClipPath, calcHexFlowerParams, HexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { DoorStyle, Terrain, TerrainFace } from '@axe/domain/tabletop/terrain';
import {
  faceShadeOf,
  sideCellIndexes,
  sideShadeLine,
  slopeShadeOf,
  topShadeGrid,
} from '@axe/domain/tabletop/terrain-shade';
import { drawnSlopeSides, gridSlopeKind, gridSlopeSides, SlopeSide } from '@axe/domain/tabletop/terrain-slope';
import { buildSlopeRoof, SlopePoint, slopeProfileAlong, SlopeRoof } from '@axe/domain/tabletop/terrain-slope-roof';
import { WallFace, WallLight, WallSilhouette } from '@axe/domain/tabletop/vision-scene';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';
import { fogMaskOf, terrainTextureLayout } from '@axe/features/tabletop/terrain/terrain-face-look';
import {
  hexFloorClipPathOf,
  hexWallsOf,
  NO_HEX_WALLS,
  TerrainHexWall,
} from '@axe/features/tabletop/terrain/terrain-hex-shapes';
import { TerrainMenuService } from '@axe/features/tabletop/terrain/terrain-menu.service';
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
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import {
  ShadedBackground,
  shadedBackgroundGrid,
  shadedBackgroundImage,
  shadeRgbOf,
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
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  protected readonly tabletopService = inject(TabletopService);
  protected readonly visionService = inject(VisionService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly terrainMenu = inject(TerrainMenuService);

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
      this.slopeFaces().length,
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

  /** The table selecter, which says which table is on view. */
  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  /** The table currently shown, which the menu's surface entries work against. */
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
   * A white block would be a placeholder standing in the way of the map. It is glass instead:
   * the wall is there and stops what it stops, but only the game master is shown where it
   * stands.
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
  readonly bottomFaceImage = computed(() => this.faceImageOf('bottom'), { equal: imageFileEqual() });
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
  private readonly textureLayout = computed<TextureLayout>(() =>
    terrainTextureLayout(this.isTiledTexture(), this.gridSize)
  );
  readonly tileStyle = computed((): Record<string, string> => {
    if (!this.isTiledTexture()) return {};
    const texture = this.textureLayout();
    return { 'background-size': texture.size, 'background-repeat': texture.repeat };
  });

  readonly isSlope = computed(() => {
    this.terrainVersion();
    return this.terrain().isSlope;
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

  /** The size of one table cell, in pixels. */
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

  /**
   * The sides this block's slope runs down to, among the sides the grid under it has.
   *
   * A block sloping nowhere in particular runs down to the south, which is the way a slope
   * with no direction has always been drawn.
   */
  readonly slopeSides = computed<SlopeSide[]>(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    return drawnSlopeSides(terrain, gridSlopeSides(this.gridType()));
  });

  /** The outline of this block's top, in pixels from the corner the block is drawn from. */
  readonly topOutline = computed<SlopePoint[]>(() => {
    const width = this.width() * this.gridSize;
    const depth = this.depth() * this.gridSize;
    const params = this.pedestalHexParams();
    if (!params) {
      return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: width, y: depth },
        { x: 0, y: depth },
      ];
    }
    return params.outline.map((corner) => ({ x: width / 2 + corner.x, y: depth / 2 + corner.y }));
  });

  /** The slope of this block, as the flat pieces its top is made of. */
  readonly slopeRoof = computed<SlopeRoof | null>(() =>
    buildSlopeRoof(this.topOutline(), this.slopeSides(), this.height() * this.gridSize, gridSlopeKind(this.gridType()))
  );

  /** Each flat piece of the slope, ready to be drawn: where it is cut, how it leans, how lit. */
  readonly slopeFaces = computed<TerrainSlopeFace[]>(() => {
    const roof = this.slopeRoof();
    if (!roof) return [];
    const bounds = this.getFloorBounds();
    const lighting = this.centerBrightness();
    const shading = this.isSurfaceShading();
    return roof.faces.map((face) => ({
      clipPath: clipPathOf(face.polygon, bounds.left, bounds.top),
      transform: leanCss(face.plane, bounds.left, bounds.top),
      brightness: slopeShadeOf(face.azimuth, shading) * lighting,
    }));
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
    return hexFloorClipPathOf(params);
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

  /**
   * The style that lays the grid over one step of a stepped hex slope, masked to that step's hexes.
   */
  terrainGridFaceStyle(face: TerrainSlopeFace): Record<string, string> {
    return this.makeTerrainGridClipStyle(face);
  }

  private makeTerrainGridClipStyle(face?: TerrainSlopeFace): Record<string, string> {
    const bounds = this.getFloorBounds();
    const clipPath = this.hexFloorClipPath();
    const style: Record<string, string> = {
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      'backface-visibility': this.isSlope() ? 'visible' : 'hidden',
      'transform-origin': face != null ? '0 0' : '',
      transform: face != null ? face.transform : 'translateZ(' + this.height() * this.gridSize + 'px)',
    };
    // A filter of its own makes a layer and flattens what is under it; at full brightness it
    // darkens nothing, so the grid is left without one.
    const brightness = face != null ? face.brightness : this.floorBrightness();
    if (brightness !== 1) style.filter = 'brightness(' + brightness + ')';
    style['clip-path'] = face != null ? face.clipPath : (clipPath ?? 'none');
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

  readonly hexWalls = computed<readonly TerrainHexWall[]>(() => {
    const params = this.pedestalHexParams();
    if (!params) return NO_HEX_WALLS;
    return hexWallsOf(params, this.width() * this.gridSize, this.depth() * this.gridSize, this.isSurfaceShading());
  });

  math = Math;

  private _initialized = false;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  /** Stops the browser starting a native drag on the terrain. */
  onDragstart(e: DragEvent) {
    e.stopPropagation();
    e.preventDefault();
  }

  /** Cancels the input handler's gesture as soon as a press starts. */
  onInputStart(_e: MouseEvent | TouchEvent) {
    this.input?.cancel();
  }

  /**
   * Opens the terrain's right-click menu, or the menu for the whole selection when the terrain is
   * part of one.
   */
  onContextMenu(e: Event) {
    e.stopPropagation();
    e.preventDefault();
    this.terrainMenu.open(this.terrain());
  }

  /** Plays the block pick-up sound when a drag or turn of the terrain starts. */
  onMove() {
    SoundEffect.play(PresetSound.blockPick);
  }

  /** Plays the block put-down sound when a drag or turn of the terrain ends. */
  onMoved() {
    SoundEffect.play(PresetSound.blockPut);
  }

  /**
   * What the slope leaves of the wall along one side of a square block: whether it stands at
   * all, and the cut that takes its top down to the slope over it.
   */
  private wallCut(side: WallSide): TerrainWallCut {
    const width = this.width() * this.gridSize;
    const depth = this.depth() * this.gridSize;
    // Each wall is drawn from one end of its side: the west end along the north and south
    // sides, the south end along the west and east ones.
    switch (side) {
      case 'north':
        return this.cutAlong({ x: 0, y: 0 }, { x: width, y: 0 });
      case 'south':
        return this.cutAlong({ x: 0, y: depth }, { x: width, y: depth });
      case 'west':
        return this.cutAlong({ x: 0, y: depth }, { x: 0, y: 0 });
      default:
        return this.cutAlong({ x: width, y: depth }, { x: width, y: 0 });
    }
  }

  readonly northWallCut = computed<TerrainWallCut>(() => this.wallCut('north'));
  readonly southWallCut = computed<TerrainWallCut>(() => this.wallCut('south'));
  readonly westWallCut = computed<TerrainWallCut>(() => this.wallCut('west'));
  readonly eastWallCut = computed<TerrainWallCut>(() => this.wallCut('east'));

  /** The same for one side of a hex block, which is drawn from the far end of its edge. */
  readonly hexWallCuts = computed<TerrainWallCut[]>(() => {
    const outline = this.topOutline();
    return outline.map((corner, index) => this.cutAlong(outline[(index + 1) % outline.length], corner));
  });

  private cutAlong(from: SlopePoint, to: SlopePoint): TerrainWallCut {
    const roof = this.slopeRoof();
    if (!roof) return WHOLE_WALL;
    const profile = slopeProfileAlong(roof, from, to);
    if (profile.every((stop) => stop.heightPx <= CUT_AWAY_PX)) return { shown: false, clipPath: null };
    const top = profile.map(
      (stop) => `${(stop.at * 100).toFixed(2)}% ${((1 - stop.heightPx / roof.heightPx) * 100).toFixed(2)}%`
    );
    return { shown: true, clipPath: `polygon(${top.join(', ')}, 100% 100%, 0% 100%)` };
  }

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
   * What the fog leaves of a face, as a mask over it.
   *
   * A hex board and a slope carry a clip of their own and are shown or hidden whole.
   */
  private fogMaskStyle(cleared: readonly boolean[], cols: number, rows: number): Record<string, string> | null {
    if (this.isHex() || this.isSlope()) return null;
    return fogMaskOf(cleared, cols, rows);
  }

  private edgeCells(cover: TerrainFogCover, side: WallSide): boolean[] {
    return sideCellIndexes(cover.cols, cover.rows, side).map((i) => cover.cleared[i]);
  }

  /**
   * The shading and the veils, worked out once for the scene rather than once a frame.
   *
   * Building them takes a gradient stop per cell and a clip path per face, and a template
   * calls a plain method on every pass of change detection. A flickering lamp ticks twenty
   * times a second, and every terrain on the board would be rebuilding all of it each time.
   */
  protected readonly topShade = computed(() => this.shadedTop(this.topFaceImage().url));
  protected readonly northShade = computed(() => this.shadedSide(this.northFaceImage().url, 'north'));
  protected readonly southShade = computed(() => this.shadedSide(this.southFaceImage().url, 'south'));
  protected readonly westShade = computed(() => this.shadedSide(this.westFaceImage().url, 'west'));
  protected readonly eastShade = computed(() => this.shadedSide(this.eastFaceImage().url, 'east'));

  /**
   * The underside of a block, which is only ever looked at on one hung off the ground.
   *
   * Shaded the way a wall is rather than the way a roof is: nothing up there lights it, and a
   * face turned away from every lamp on the table is the darkest side a block has.
   */
  protected readonly bottomShade = computed(() =>
    this.shadedFace(this.bottomFaceImage().url, faceShadeOf('bottom', this.isSurfaceShading()), 'south')
  );

  /**
   * Whether the block is drawn with an underside, which is whenever it has a floor at all.
   *
   * Asking how high it stands is the wrong question: a block may be built at a height or be
   * one of a stack, and read from either the answer is wrong for the other. One standing on
   * the table hides its own underside anyway, so there is nothing to be saved by leaving it
   * off and a whole class of see-through boxes to be had by trying.
   */
  protected readonly showsBottom = computed(() => this.hasFloor());

  protected readonly topFog = computed(() => this.topFogStyle());
  protected readonly northFog = computed(() => this.faceFogStyle('north'));
  protected readonly southFog = computed(() => this.faceFogStyle('south'));
  protected readonly westFog = computed(() => this.faceFogStyle('west'));
  protected readonly eastFog = computed(() => this.faceFogStyle('east'));

  /** The top of a block, shaded a cell at a time where it can be. */
  private shadedTop(url: string): ShadedBackground {
    const grid = topShadeGrid(this.topIsRaised(), !this.isHex() && !this.isSlope(), 1, {
      roof: () => this.topCover(),
      floor: () => this.fogCover(),
      top: () => this.topBrightness(),
      whole: () => this.centerBrightness(),
    });
    return shadedBackgroundGrid(url, grid.brightness, grid.cols, grid.rows, this.textureLayout(), this.shadeRgb());
  }

  private shadedSide(url: string, side: WallSide): ShadedBackground {
    return this.shadedFace(url, faceShadeOf(side, this.isSurfaceShading()), side);
  }

  private shadedFace(url: string, base: number, side: WallSide): ShadedBackground {
    const line = sideShadeLine(base, side, this.fogCover(), () => this.ambientBrightness());
    return shadedBackgroundGrid(url, line.brightness, line.cols, line.rows, this.textureLayout(), this.shadeRgb());
  }

  private faceFogStyle(side: WallSide): Record<string, string> | null {
    const cover = this.fogCover();
    if (!cover) return null;
    const cleared = this.edgeCells(cover, side);
    return this.fogMaskStyle(cleared, cleared.length, 1);
  }

  private topFogStyle(): Record<string, string> | null {
    const cover = this.fogCover();
    if (!cover) return null;
    return this.fogMaskStyle(cover.cleared, cover.cols, cover.rows);
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

  readonly floorBrightness = computed(() => this.centerBrightness());

  /** Whether this block's top stands above the floor, and so is lit as its own surface. */
  private readonly topIsRaised = computed(() => this.altitude() + this.height() > 0);

  /** The roof's cells, each read at the height the roof stands at. */
  private readonly topCover = computed(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    return this.visionService.terrainTopCover(terrain);
  });

  /** How brightly the top of this block is lit, read at the height it actually stands at. */
  private readonly topBrightness = computed(() => {
    const terrain = this.terrain();
    this.objectChange.versionOf(terrain.identifier)();
    const w = this.width() * this.gridSize;
    const d = this.depth() * this.gridSize;
    return this.visionService.terrainTopBrightness(
      terrain,
      terrain.location.x + w / 2,
      terrain.location.y + d / 2,
      Math.max(w, d) / 2
    );
  });

  protected wallShade(base: number): number {
    return base * this.centerBrightness();
  }

  protected shaded(url: string, brightness: number): string {
    return shadedBackgroundImage(url, brightness, this.shadeRgb());
  }

  /**
   * The colour this table paints its dark in, for the faces of a block.
   *
   * The darkness is one sheet lying on the floor, so nothing standing on the table is covered
   * by it and every face darkens itself. Doing that in black would leave a building grey
   * while the floor around it wears the table's own colour.
   */
  private readonly shadeRgb = computed(() => shadeRgbOf(this.visionService.ambientShade()?.color));

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

  private setGameTableGrid(
    gridType: GridType = GridType.SQUARE,
    gridColor: string = '#000000e6',
    gridFontColor: string = gridColor
  ) {
    if (this.gridCanvases().length < 1) return;
    const slide = this.gridSlide();

    perfCounters.bump(PERF_TERRAIN_GRID_RASTER);
    if (slide.grow === 0) perfCounters.bump(`${PERF_TERRAIN_GRID_RASTER}:unslid`);
    let drawn: HTMLCanvasElement | null = null;
    for (const gridCanvas of this.gridCanvases()) {
      const canvas = gridCanvas.nativeElement;
      // Every step of a slope shows the same stretch of grid, so the rest are copies of the first.
      if (drawn) {
        canvas.width = drawn.width;
        canvas.height = drawn.height;
        canvas.getContext('2d')?.drawImage(drawn, 0, 0);
        continue;
      }
      const render = new GridLineRender(canvas);
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
      drawn = canvas;
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

/** One flat piece of a block's slope, ready to be drawn. */
export interface TerrainSlopeFace {
  /** Where the piece is cut out of the top, in the top's own pixels. */
  clipPath: string;
  /** How it leans, as a transform over the top laid flat. */
  transform: string;
  /** How lit it is, the way it leans taken together with the light on the block. */
  brightness: number;
}

/** What a slope leaves of one wall. */
export interface TerrainWallCut {
  shown: boolean;
  clipPath: string | null;
}

const WHOLE_WALL: TerrainWallCut = { shown: true, clipPath: null };

/** Under this much of a wall is left standing, the slope has taken the whole of it. */
const CUT_AWAY_PX = 0.01;

function clipPathOf(polygon: readonly SlopePoint[], left: number, top: number): string {
  const points = polygon.map((corner) => `${(corner.x - left).toFixed(2)}px ${(corner.y - top).toFixed(2)}px`);
  return `polygon(${points.join(', ')})`;
}

/**
 * How a flat piece of a slope leans, as a transform over the top laid flat.
 *
 * It lifts each point of the piece to the height the slope stands at there and leaves it
 * where it is otherwise, so the picture over it is stretched up the slope rather than slid
 * across it, and the piece is cut where it was drawn.
 */
function leanCss(plane: { a: number; b: number; c: number }, left: number, top: number): string {
  const lift = plane.c + plane.a * left + plane.b * top;
  return `matrix3d(1,0,${plane.a.toFixed(6)},0,0,1,${plane.b.toFixed(6)},0,0,0,1,0,0,0,${lift.toFixed(3)},1)`;
}
