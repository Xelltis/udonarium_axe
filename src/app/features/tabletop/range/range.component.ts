import { NgStyle } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { GameObjectInventoryService } from '@axe/application/inventory/game-object-inventory.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { PanelOption, PanelService } from '@axe/application/ui/panel.service';
import { PieceContextMenuService } from '@axe/application/ui/piece-context-menu.service';
import { sheetPanelBox } from '@axe/application/ui/sheet-panel';
import { sheetPanelTitle } from '@axe/application/ui/sheet-panel';
import { UiSignalService } from '@axe/application/ui/ui-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PresetSound, SoundEffect } from '@axe/domain/media/sound-effect';
import { cellPatternBoundingBox, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { multiAngleFontScaleFactor } from '@axe/domain/tabletop/multi-angle-font-scale';
import { RangeArea } from '@axe/domain/tabletop/range';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { ObjectPanelService } from '@axe/features/panels/object-panel.service';
import { buildRangeContextMenuModel } from '@axe/features/tabletop/range/range-context-menu';
import {
  ClipAreaCorn,
  ClipAreaHexagon,
  ClipAreaLine,
  ClipAreaPentagon,
  ClipAreaSquare,
  ClipAreaTriangle,
  RangeRender,
  RangeRenderSetting,
} from '@axe/features/tabletop/range/range-render';
import { clipAreaToPolygonCss, clipCircleCss } from '@axe/features/tabletop/range/range-render-util';
import { RangeDockingCharacterComponent } from '@axe/features/tabletop/range-docking-character/range-docking-character.component';
import { MovableOption } from '@axe/ui/directives/movable.directive';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { RotableOption } from '@axe/ui/directives/rotable.directive';
import { RotableDirective } from '@axe/ui/directives/rotable.directive';
import { SelectableDirective } from '@axe/ui/directives/selectable.directive';
import { TooltipDirective } from '@axe/ui/directives/tooltip.directive';
import { setupInputHandler, setupMovableRotableForPiece } from '@axe/ui/tabletop/setup-tabletop-piece';
import { translateZCss, Z_OFFSET_RANGE_PX } from '@axe/ui/tabletop/z-offset';

@Component({
  selector: 'range',
  templateUrl: './range.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MovableDirective, TooltipDirective, RotableDirective, SelectableDirective, NgStyle],
  host: {
    '(dragstart)': 'onDragstart($event)',
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class RangeComponent {
  private readonly tabletopActionService = inject(TabletopActionService);
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pieceContextMenu = inject(PieceContextMenuService);
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly panelService = inject(PanelService);
  private readonly objectPanels = inject(ObjectPanelService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly coordinateService = inject(CoordinateService);
  protected readonly tabletopService = inject(TabletopService);
  private readonly objectStore = inject(ObjectStore);
  private readonly inventoryService = inject(GameObjectInventoryService);
  private readonly uiSignalService = inject(UiSignalService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateFn = inject(TRANSLATE_FN);

  readonly range = input.required<RangeArea>();

  readonly gridCanvas = viewChild<ElementRef<HTMLCanvasElement>>('gridCanvas');
  readonly rangeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('rangeCanvas');

  readonly clipPath = computed<string>(() => {
    this._clipVersion();
    const range = this.range();
    switch (range.type) {
      case 'LINE':
        return clipAreaToPolygonCss(this.clipAreaLine);
      case 'CIRCLE':
        return clipCircleCss(range.length, this.gridSize);
      case 'SQUARE':
        return clipAreaToPolygonCss(this.clipAreaSquare);
      case 'TRIANGLE':
        return clipAreaToPolygonCss(this.clipAreaTriangle);
      case 'PENTAGON':
        return clipAreaToPolygonCss(this.clipAreaPentagon);
      case 'HEXAGON':
        return clipAreaToPolygonCss(this.clipAreaHexagon);
      case 'CUSTOM': {
        const hx = Math.max(this.gridSize, this.customHalfWidthPx) + this.gridSize;
        const hy = Math.max(this.gridSize, this.customHalfHeightPx) + this.gridSize;
        return `polygon(${-hx}px ${-hy}px, ${hx}px ${-hy}px, ${hx}px ${hy}px, ${-hx}px ${hy}px)`;
      }
      case 'CORN':
      default:
        return clipAreaToPolygonCss(this.clipAreaCorn);
    }
  });

  private clipAreaCorn: ClipAreaCorn = {
    clip01x: 0, // 根本始点
    clip01y: 0,
    clip02x: 100,
    clip02y: 0,
    clip03x: 100,
    clip03y: 100,
    clip04x: 0,
    clip04y: 100,
    clip05x: 0, // 先端部
    clip05y: 0,
    clip06x: 0, // 折り返し
    clip06y: 0,
    clip07x: 0,
    clip07y: 0,
    clip08x: 0,
    clip08y: 0,
    clip09x: 0,
    clip09y: 0,
  };

  private clipAreaLine: ClipAreaLine = {
    clip01x: 0, // 左下
    clip01y: 0,
    clip02x: 0, // 左上
    clip02y: -50,
    clip03x: 100, // 右上
    clip03y: -50,
    clip04x: 100, // 右下
    clip04y: 0,
  };

  private clipAreaSquare: ClipAreaSquare = {
    clip01x: 0, // 左下
    clip01y: 0,
    clip02x: 0, // 左上
    clip02y: -50,
    clip03x: 100, // 右上
    clip03y: -50,
    clip04x: 100, // 右下
    clip04y: 0,
  };

  private clipAreaTriangle: ClipAreaTriangle = {
    clip01x: 0,
    clip01y: -100,
    clip02x: 100,
    clip02y: 100,
    clip03x: -100,
    clip03y: 100,
  };

  private clipAreaPentagon: ClipAreaPentagon = {
    clip01x: 0,
    clip01y: -100,
    clip02x: 100,
    clip02y: -30,
    clip03x: 60,
    clip03y: 100,
    clip04x: -60,
    clip04y: 100,
    clip05x: -100,
    clip05y: -30,
  };

  private clipAreaHexagon: ClipAreaHexagon = {
    clip01x: 0,
    clip01y: -100,
    clip02x: 100,
    clip02y: -50,
    clip03x: 100,
    clip03y: 50,
    clip04x: 0,
    clip04y: 100,
    clip05x: -100,
    clip05y: 50,
    clip06x: -100,
    clip06y: -50,
  };

  get tableSelecter(): TableSelecter {
    return this.tabletopService.tableSelecter;
  }
  get currentTable(): GameTable {
    return this.tabletopService.currentTable;
  }

  private readonly rangeVersion = computed(() => this.objectChange.versionOf(this.range().identifier)());

  readonly name = computed(() => {
    this.rangeVersion();
    return this.range().name;
  });
  readonly width = computed(() => {
    this.rangeVersion();
    return Math.max(0, this.range().width);
  });
  readonly length = computed(() => {
    this.rangeVersion();
    return Math.max(0, this.range().length);
  });
  readonly opacity = computed(() => {
    this.rangeVersion();
    return this.range().opacity;
  });
  readonly imageFile = computed(() => {
    this.objectChange.fileVersion();
    this.rangeVersion();
    return this.range().imageFile;
  });
  readonly isLock = computed(() => {
    this.rangeVersion();
    return this.range().isLock;
  });

  readonly areaQuadrantSize = computed(() => {
    this.rangeVersion();
    if (this.range().type === 'CUSTOM') {
      const cells = parseCellPattern(this.range().cellPattern);
      const bb = cellPatternBoundingBox(cells);
      const span = Math.max(bb.width, bb.height, 1);
      return Math.ceil(span) + 1;
    }
    const w = this.width() < 1 ? 1 : this.width();
    const l = this.length() < 1 ? 1 : this.length();
    return Math.ceil(Math.sqrt(w * w + l * l)) + 1;
  });

  readonly isRotatableRangeType = computed(() => {
    this.rangeVersion();
    const range = this.range();
    if (range.type === 'CUSTOM') return range.isRotatable === true;
    return ['LINE', 'CORN', 'SQUARE', 'TRIANGLE', 'PENTAGON', 'HEXAGON'].includes(range.type);
  });

  readonly isCustomRangeType = computed(() => {
    this.rangeVersion();
    return this.range().type === 'CUSTOM';
  });

  private customHalfWidthPx = 25;
  private customHalfHeightPx = 25;

  readonly usesSingleRotateGrab = computed(() => {
    this.rangeVersion();
    return ['SQUARE', 'TRIANGLE', 'PENTAGON', 'HEXAGON', 'CUSTOM'].includes(this.range().type);
  });

  readonly rotateGrabDistancePx = computed(() => Math.max(1, this.length()) * this.gridSize);

  readonly singleRotateGrabX = 0;

  readonly singleRotateGrabY = computed(() => -Math.max(1, this.length()) * this.gridSize);

  readonly altitude = computed(() => {
    this.rangeVersion();
    return this.range().altitude;
  });

  readonly isFollowed = computed(() => {
    this.rangeVersion();
    return this.objectStore.get(this.range().followingCharacterIdentifier) != null;
  });
  readonly followingCharacter = computed(() => {
    this.rangeVersion();
    const obj = this.objectStore.get(this.range().followingCharacterIdentifier);
    return obj instanceof GameCharacter ? obj : null;
  });
  readonly elevation = this.altitude;
  readonly textShadowCss = '0px 0px 2px #fff, 0px 0px 2px #fff, 0px 0px 2px #fff';

  readonly isAltitudeIndicate = computed(() => {
    this.rangeVersion();
    return this.range().isAltitudeIndicate;
  });

  private readonly _clipVersion = signal(0);

  get gridSize(): number {
    return this.tabletopService.gridSize();
  }
  math = Math;

  viewRotateX = 50;
  readonly viewRotateZ = this.uiSignalService.tableViewRotationZ;

  readonly movableOption = signal<MovableOption>({});
  readonly rotableOption = signal<RotableOption>({});

  private _initialized = false;

  constructor() {
    // input.required<RangeArea> guarded by _initialized to avoid NG0950 during construction.
    this.objectChange.onObjectChangedFor(
      () => {
        if (!this._initialized) return [];
        const range = this.range();
        return [range.identifier, range.followingCharacterIdentifier, this.currentTable.identifier];
      },
      (e) => {
        if (!this._initialized) return;
        const range = this.range();
        if (e.identifier === range.followingCharacterIdentifier) range.following();
        this.setRange();
      },
      this.destroyRef
    );
    setupMovableRotableForPiece(this, {
      target: this.range,
      collideLayers: ['terrain'],
      transformCssOffset: translateZCss(Z_OFFSET_RANGE_PX),
      snapOrigin: () => {
        const half = this.gridSize / 2;
        const snapXY = isHexGrid(this.currentTable.gridType) ? 0 : half;
        return { x: snapXY, y: snapXY };
      },
    });
    afterNextRender(() => {
      this._initialized = true;
      this.setRange();
    });
  }

  private readonly inputRef = setupInputHandler({
    elementRef: this.elementRef,
    destroyRef: this.destroyRef,
    onStart: (e) => this.onInputStart(e),
  });

  private get input() {
    return this.inputRef.current;
  }

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
    if (this.pieceContextMenu.openForSelection(this.range(), this.gridSize, menuPosition)) return;
    const objectPosition = this.coordinateService.calcTabletopLocalCoordinate();
    const menu = buildRangeContextMenuModel(
      this.range()!,
      this.gridSize,
      objectPosition,
      this.objectStore,
      this.inventoryService,
      this.tabletopActionService,
      () => this.dockingWindowOpen(),
      (r) => this.showDetail(r),
      this.translateFn,
      (r) => this.openCellEditor(r)
    );
    const display = this.tabletopService.tabletopDisplaySettings;
    if (display.enabled()) {
      this.contextMenuService.openRadial(
        menuPosition,
        menu.actions,
        menu.radialGroups,
        this.name(),
        display.radialMenuEnabled(),
        display.radialMenuRotationSpeed(),
        multiAngleFontScaleFactor(display.multiAngleFontScale())
      );
      return;
    }
    this.contextMenuService.open(menuPosition, menu.actions, this.name());
  }

  dockingWindowOpen() {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      left: coordinate.x - 250,
      top: coordinate.y - 175,
      width: 350,
      height: 200,
    };
    option.title = this.translateFn('feature.tabletop.panel.rangeFollow');
    const component = this.panelService.open<RangeDockingCharacterComponent>(RangeDockingCharacterComponent, option);
    component.tabletopObject = this.range();
  }

  onMove() {
    SoundEffect.play(PresetSound.cardPick);
  }

  onMoved() {
    SoundEffect.play(PresetSound.cardPut);
  }

  onRotateChanged(degree: number) {
    this.setRange(degree);
  }

  private async openCellEditor(range: RangeArea): Promise<void> {
    const coordinate = this.pointerDeviceService.pointers[0];
    const option: PanelOption = {
      title: this.translateFn('feature.range.custom.editorTitle'),
      ...sheetPanelBox(coordinate, 640, 540),
    };
    const { RangeShapeEditorComponent } =
      await import('@axe/features/tabletop/range-shape-editor/range-shape-editor.component');
    const editor = this.panelService.open(RangeShapeEditorComponent, option);
    editor.initialize({
      name: range.name,
      cellPattern: range.cellPattern,
      gridType:
        range.customGridType === 'hex-vertical' || range.customGridType === 'hex-horizontal'
          ? range.customGridType
          : 'square',
      gridColor: range.gridColor,
      rangeColor: range.rangeColor,
      isRotatable: range.isRotatable,
    });
    editor.saved.subscribe((result) => {
      range.cellPattern = result.cellPattern;
      range.customGridType = result.gridType;
      range.gridColor = result.gridColor;
      range.rangeColor = result.rangeColor;
      range.isRotatable = result.isRotatable;
      if (result.name) range.name = result.name;
      this.syncLengthWidthToPattern(range);
      this.objectChange.notifyChanged(range.identifier);
      this.setRange();
    });
  }

  private syncLengthWidthToPattern(range: RangeArea): void {
    const cells = parseCellPattern(range.cellPattern);
    const bb = cellPatternBoundingBox(cells);
    const lengthEl = range.commonDataElement?.getFirstElementByName('length');
    const widthEl = range.commonDataElement?.getFirstElementByName('width');
    if (lengthEl) lengthEl.value = Math.max(1, bb.height);
    if (widthEl) widthEl.value = Math.max(1, bb.width);
  }

  private showDetail(gameObject: RangeArea) {
    const title = sheetPanelTitle(this.translateFn('feature.tabletop.panel.range'), gameObject.name);
    this.objectPanels.openSheet(gameObject, title, { width: 400, height: 300 });
  }

  private setRange(degree: number = this.range().rotate) {
    const gridCanvasRef = this.gridCanvas();
    const rangeCanvasRef = this.rangeCanvas();
    if (!gridCanvasRef || !rangeCanvasRef) return;
    if (!gridCanvasRef.nativeElement.getContext('2d')) return;
    const render = new RangeRender(gridCanvasRef.nativeElement, rangeCanvasRef.nativeElement);

    const w = this.width();
    const l = this.length();
    const setting: RangeRenderSetting = {
      areaWidth: this.areaQuadrantSize() * 2,
      areaHeight: this.areaQuadrantSize() * 2,
      range: l < 1 ? 1 : l,
      width: w < 0.1 ? 0.1 : w,
      centerX: this.range().location.x,
      centerY: this.range().location.y,
      gridSize: this.gridSize,
      type: this.range().type,
      gridColor: this.range().gridColor,
      rangeColor: this.range().rangeColor,
      fanDegree: 0.0,
      degree,
      offSetX: this.range().offSetX,
      offSetY: this.range().offSetY,
      fillOutLine: this.range().fillOutLine,
      gridType: this.currentTable.gridType,
      isDocking: this.objectStore.get(this.range().followingCharacterIdentifier) !== null,
    };

    switch (this.range().type) {
      case 'LINE':
        this.clipAreaLine = render.renderLine(setting);
        break;
      case 'CIRCLE':
        render.renderCircle(setting);
        break;
      case 'SQUARE':
        this.clipAreaSquare = render.renderSquare(setting);
        break;
      case 'TRIANGLE':
        this.clipAreaTriangle = render.renderTriangle(setting);
        break;
      case 'PENTAGON':
        this.clipAreaPentagon = render.renderPentagon(setting);
        break;
      case 'HEXAGON':
        this.clipAreaHexagon = render.renderHexagon(setting);
        break;
      case 'CUSTOM': {
        const bb = render.renderCustom(setting, {
          cellPattern: this.range().cellPattern,
          rotationDegrees: degree,
        });
        this.customHalfWidthPx = bb.halfWidthPx;
        this.customHalfHeightPx = bb.halfHeightPx;
        break;
      }
      case 'CORN':
      default:
        this.clipAreaCorn = render.renderCorn(setting);
        break;
    }

    this._clipVersion.update((v) => v + 1);
  }
}
