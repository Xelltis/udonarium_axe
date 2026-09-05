import { NgClass } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { DungeonBuildService } from '@axe/application/tabletop/dungeon-build.service';
import { FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { transientSignal } from '@axe/application/ui/transient-signal';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { isTypingTarget } from '@axe/core/input/typing-target';
import { ImageStorage } from '@axe/core/storage/image-storage';
import {
  isTextureId,
  TEXTURE_ASSET_URLS,
  TEXTURE_BASE_COLOR,
  TEXTURE_IDS,
  WALL_TEXTURE_ASSET_URLS,
  WALL_TEXTURE_BASE_COLOR,
  WALL_TEXTURE_IDS,
} from '@axe/domain/media/texture-catalog';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import {
  MAP_FUNCTION_ROLES,
  MapFunctionRole,
  MaskPaintSpec,
  TERRAIN_FACE_KEYS,
  TerrainFaceImages,
  TerrainPaintSpec,
} from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { TerrainViewState } from '@axe/domain/tabletop/terrain';
import { imageStampIdentifier, isImageStampId } from '@axe/features/map-editor/assets/image-stamp';
import { StampDef } from '@axe/features/map-editor/assets/stamp-types';
import { getStampById, STAMPS } from '@axe/features/map-editor/assets/stamps';
import { GestureKind, MapEditorGesture } from '@axe/features/map-editor/editor/map-editor-gesture';
import { MapEditorLayerDrawerComponent } from '@axe/features/map-editor/editor/map-editor-layer-drawer.component';
import { mapEditorKeyDown, mapEditorKeyUp } from '@axe/features/map-editor/editor/map-editor-shortcut';
import { MapEditorStampPickerComponent } from '@axe/features/map-editor/editor/map-editor-stamp-picker.component';
import {
  EditorTool,
  LineKind,
  MapEditorState,
  ShapeGeneratorKind,
} from '@axe/features/map-editor/editor/map-editor-state';
import { MapEditorTexturePickerComponent } from '@axe/features/map-editor/editor/map-editor-texture-picker.component';
import {
  curveAnchorAt,
  fitImageSize,
  imageCorners,
  imageHandleAt,
} from '@axe/features/map-editor/model/editor-hit-test';
import { cellCenter, pointToCell } from '@axe/features/map-editor/model/grid-cells';
import {
  cellKey,
  ImageItem,
  MapLayer,
  MapScene,
  newId,
  sceneHeightPx,
  sceneWidthPx,
  ShapeItem,
  StrokeDash,
} from '@axe/features/map-editor/model/scene';
import { isZipArchive } from '@axe/features/map-editor/model/scene-archive';
import { packSceneWithImages, unpackSceneWithImages } from '@axe/features/map-editor/model/scene-archive-images';
import { guessLineWidth, useTextMeasurer } from '@axe/features/map-editor/model/scene-geometry';
import { removeText, updateText } from '@axe/features/map-editor/model/scene-ops';
import { deserializeScene } from '@axe/features/map-editor/model/serialize';
import { generateShapePoints, regularPolygonPoints, starPoints } from '@axe/features/map-editor/model/shape-points';
import { planFunctionPaint } from '@axe/features/map-editor/model/table-apply';
import { sceneFromTable } from '@axe/features/map-editor/model/table-import';
import { imageTextureIdentifier, isImageTextureId, normalizeTextureId } from '@axe/features/map-editor/model/textures';
import { exportSceneToBlob } from '@axe/features/map-editor/render/export-image';
import { getRasterImage, loadRasterImage } from '@axe/features/map-editor/render/raster-image';
import {
  type EditorOverlay,
  type OverlayImage,
  type OverlayStamp,
  renderOverlay,
} from '@axe/features/map-editor/render/render-overlay';
import { RenderHelpers, renderScene } from '@axe/features/map-editor/render/render-scene';
import { getStampImage, loadStampImage } from '@axe/features/map-editor/render/stamp-image';
import { createImageTexturePattern } from '@axe/features/map-editor/render/texture-pattern';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

export function buildShapeKindPoints(kind: ShapeGeneratorKind): string {
  const cx = 12;
  const cy = 12;
  const r = 9;
  let flat: number[];
  if (kind === 'triangle') flat = regularPolygonPoints(cx, cy, r, 3, -Math.PI / 2);
  else if (kind === 'pentagon') flat = regularPolygonPoints(cx, cy, r, 5, -Math.PI / 2);
  else if (kind === 'hexagon') flat = regularPolygonPoints(cx, cy, r, 6, 0);
  else if (kind === 'star5') flat = starPoints(cx, cy, r, r * 0.382, 5, -Math.PI / 2);
  else if (kind === 'star6') flat = starPoints(cx, cy, r, r * 0.577, 6, -Math.PI / 2);
  else return '';
  const pairs: string[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) {
    pairs.push(`${flat[i].toFixed(2)},${flat[i + 1].toFixed(2)}`);
  }
  return pairs.join(' ');
}

const ERASER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/>' +
  '<path d="M6.0 20l4-4"/>' +
  '</svg>';

const SELECT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">' +
  '<path d="M7 2 L7 19 L11.3 15.4 L13.9 21.3 L16.6 20.1 L14 14.3 L19.5 13.8 Z"/>' +
  '</svg>';

const FILL_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 4 L4 10 L11 17 L18 10 L12 4 Z"/>' +
  '<path d="M10 4 L8 2 A 1.8 1.8 0 1 0 5.5 4.5"/>' +
  '<path d="M20.5 13 C 22 15 22.5 16 22.5 17 A 2 2 0 0 1 18.5 17 C 18.5 16 19 15 20.5 13 Z" fill="currentColor" stroke="none"/>' +
  '</svg>';

interface ToolDef {
  tool: EditorTool;
  icon: string;
  key: string;
  svg?: SafeHtml;
  /** The name to show, where the tool stands on the rail for more than itself. */
  label?: string;
  /** The tools this one stands for, so that the rail stays lit while they are in hand. */
  covers?: readonly EditorTool[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-map-editor-panel',
  templateUrl: './map-editor-panel.component.html',
  host: {
    class: 'block h-full',
    tabindex: '0',
    '(keydown)': 'onKeyDown($event)',
    '(keyup)': 'onKeyUp($event)',
  },
  providers: [MapEditorState],
  imports: [
    FormsModule,
    NgClass,
    TranslocoModule,
    MapEditorLayerDrawerComponent,
    MapEditorStampPickerComponent,
    MapEditorTexturePickerComponent,
  ],
})
export class MapEditorPanelComponent implements AfterViewInit {
  protected readonly state = inject(MapEditorState);
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly mobileDrawer = signal<'none' | 'props' | 'layers'>('none');

  protected toggleMobileDrawer(drawer: 'props' | 'layers'): void {
    this.mobileDrawer.update((current) => (current === drawer ? 'none' : drawer));
  }
  private readonly panelService = inject(PanelService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly dungeonBuild = inject(DungeonBuildService);
  private readonly rolePermission = inject(RolePermissionService);
  private readonly tabletopService = inject(TabletopService);
  private readonly objectChange = inject(ObjectChangeService);
  private readonly modalService = inject(ModalService);
  private readonly sanitizer = inject(DomSanitizer);
  protected readonly t = inject(TRANSLATE_FN);
  private readonly confirm = inject(ConfirmService);
  private readonly functionalPaint = inject(FunctionalPaintService);

  private readonly exportFn = exportSceneToBlob;
  private readonly loadImageFn = loadRasterImage;

  private readonly board = viewChild<ElementRef<HTMLCanvasElement>>('board');
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  protected readonly textEditor = viewChild<ElementRef<HTMLElement>>('textEditor');
  private readonly stage = viewChild<ElementRef<HTMLDivElement>>('stage');

  protected readonly functionRoles = MAP_FUNCTION_ROLES;

  protected setTerrainPaint(patch: Partial<TerrainPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, terrain: { ...spec.terrain, ...patch } });
  }

  protected setMaskPaint(patch: Partial<MaskPaintSpec>): void {
    const spec = this.state.functionSpec();
    this.state.setFunctionSpec({ ...spec, mask: { ...spec.mask, ...patch } });
  }

  protected readonly terrainFaces = TERRAIN_FACE_KEYS;

  protected readonly terrainModes = [
    { mode: TerrainViewState.ALL, key: 'both' },
    { mode: TerrainViewState.WALL, key: 'wall' },
    { mode: TerrainViewState.FLOOR, key: 'floor' },
  ];

  protected faceImageUrl(face: keyof TerrainFaceImages): string | null {
    const id = this.state.functionSpec().terrain.images[face];
    return id ? (this.imageStorage.get(id)?.url ?? null) : null;
  }

  /** Picks the picture one face of a painted wall wears, or takes it off again. */
  protected async chooseFaceImage(face: keyof TerrainFaceImages): Promise<void> {
    const id = await this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).catch(() => null);
    if (id === null) return;
    this.setTerrainPaint({ images: { ...this.state.functionSpec().terrain.images, [face]: id } });
  }

  protected clearFaceImage(face: keyof TerrainFaceImages): void {
    this.setTerrainPaint({ images: { ...this.state.functionSpec().terrain.images, [face]: '' } });
  }

  protected readonly wallTextureIds = WALL_TEXTURE_IDS;
  protected readonly wallTextureAssetUrls = WALL_TEXTURE_ASSET_URLS;
  protected readonly wallTextureBaseColor = WALL_TEXTURE_BASE_COLOR;
  protected readonly groundTextureIds = TEXTURE_IDS;
  protected readonly textureAssetUrls = TEXTURE_ASSET_URLS;
  protected readonly textureBaseColor = TEXTURE_BASE_COLOR;

  protected readonly faceTexturesOpen = signal<string>('');

  protected toggleFaceTextures(face: keyof TerrainFaceImages): void {
    this.faceTexturesOpen.update((held) => (held === face ? '' : face));
  }

  /** Dresses one face in a picture that ships with the room, the way the dungeons are built. */
  protected chooseFaceTexture(face: keyof TerrainFaceImages, url: string): void {
    const identifier = this.dungeonBuild.registerAsset(url);
    if (identifier.length < 1) return;
    this.setTerrainPaint({ images: { ...this.state.functionSpec().terrain.images, [face]: identifier } });
    this.faceTexturesOpen.set('');
  }

  protected readonly settingsTool: ToolDef = { tool: 'settings', icon: 'settings', key: '' };

  protected readonly tools: ToolDef[] = [
    { tool: 'select', icon: '', key: 'V', svg: this.sanitizer.bypassSecurityTrustHtml(SELECT_SVG) },
    { tool: 'cellPaint', icon: 'edit', key: 'B' },
    {
      tool: 'cellErase',
      icon: '',
      key: 'E',
      svg: this.sanitizer.bypassSecurityTrustHtml(ERASER_SVG),
    },
    { tool: 'fill', icon: '', key: 'G', svg: this.sanitizer.bypassSecurityTrustHtml(FILL_SVG) },
    { tool: 'freehand', icon: 'gesture', key: 'F' },
    { tool: 'line', icon: 'show_chart', key: 'L' },
    { tool: 'shape', icon: 'category', key: 'R' },
    { tool: 'polygon', icon: 'polyline', key: 'P' },
    { tool: 'text', icon: 'title', key: 'T' },
    { tool: 'stamp', icon: 'approval', key: 'S' },
    { tool: 'image', icon: 'image', key: 'I' },
    {
      tool: 'functionPaint',
      icon: 'block',
      key: 'K',
      label: 'feature.mapEditor.tools.function',
      covers: ['functionErase'],
    },
  ];

  protected readonly functionTools: EditorTool[] = ['functionPaint', 'functionErase'];

  protected toolLabelKey(def: ToolDef): string {
    return def.label ?? 'feature.mapEditor.tools.' + def.tool;
  }

  protected isToolInHand(def: ToolDef): boolean {
    const held = this.state.tool();
    return held === def.tool || (def.covers?.includes(held) ?? false);
  }

  protected readonly dashKinds: StrokeDash[] = ['solid', 'dashed', 'dotted', 'dashdot', 'longdash'];
  protected readonly lineKinds: LineKind[] = ['straight', 'polyline', 'curve', 'closedCurve'];

  protected readonly shapeKinds: ShapeGeneratorKind[] = [
    'rect',
    'ellipse',
    'triangle',
    'pentagon',
    'hexagon',
    'star5',
    'star6',
    'balloon',
  ];

  protected readonly gridTypeOptions: { type: GridType; label: string }[] = [
    { type: GridType.SQUARE, label: 'gridSquare' },
    { type: GridType.HEX_VERTICAL, label: 'gridHexV' },
    { type: GridType.HEX_HORIZONTAL, label: 'gridHexH' },
  ];

  protected readonly GridType = GridType;

  private readonly shortcutToTool = new Map<string, EditorTool>(this.tools.map((d) => [d.key, d.tool]));
  private readonly toolKeys = new Set(this.shortcutToTool.keys());

  private readonly renderTick = signal(0);
  private readonly pendingStamps = new Set<string>();
  private readonly pendingImages = new Set<string>();

  /** The gesture under way, holding values only between press and release. */
  private readonly gesture = new MapEditorGesture();

  protected readonly cursorCell = signal<{ col: number; row: number } | null>(null);
  protected readonly spacePan = signal(false);
  protected readonly panning = signal(false);
  protected readonly draftCount = signal(0);
  protected readonly editingText = signal<{
    x: number;
    y: number;
    layerId: string | null;
    itemId: string | null;
  } | null>(null);
  protected readonly textDraft = signal('');
  protected readonly busy = signal(false);
  protected readonly notice = transientSignal('', 2500);
  protected readonly errorNotice = transientSignal('', 2500);
  protected readonly exportScale = signal(1);

  private pendingTextFocus = false;
  private pendingTextInitial = '';

  protected readonly isGameMaster = computed(() => {
    this.objectChange.trackMyCursor();
    return PeerCursor.isMyselfGameMaster;
  });

  protected readonly widthPx = computed(() => {
    this.state.sceneTick();
    return sceneWidthPx(this.state.current);
  });

  protected readonly heightPx = computed(() => {
    this.state.sceneTick();
    return sceneHeightPx(this.state.current);
  });

  protected readonly sceneInfo = computed(() => {
    this.state.sceneTick();
    const s = this.state.current;
    return { cols: s.cols, rows: s.rows, cellPx: s.cellPx };
  });

  protected readonly layerThumbnails = computed<Map<string, string>>(() => {
    this.state.sceneTick();
    this.renderTick();
    const map = new Map<string, string>();
    for (const layer of this.state.layersTopFirst()) {
      const url = this.renderLayerThumb(layer);
      if (url) map.set(layer.id, url);
    }
    return map;
  });

  protected readonly canvasCursor = computed(() => {
    if (this.spacePan()) return this.panning() ? 'grabbing' : 'grab';
    return this.state.tool() === 'select' ? 'default' : 'crosshair';
  });

  protected readonly canFinishDraft = computed(() => {
    const n = this.draftCount();
    const tool = this.state.tool();
    if (tool === 'polygon') return n >= 3;
    return n >= 2;
  });

  constructor() {
    const stopMeasuring = useTextMeasurer((text, fontSize, bold, italic) => {
      const ctx = this.board()?.nativeElement.getContext('2d');
      if (!ctx) return guessLineWidth(text, fontSize);
      ctx.save();
      ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px sans-serif`;
      const width = ctx.measureText(text).width;
      ctx.restore();
      return width;
    });
    inject(DestroyRef).onDestroy(stopMeasuring);
    queueMicrotask(() => (this.panelService.title = this.t('feature.mapEditor.title')));
    effect(() => {
      this.state.sceneTick();
      this.renderTick();
      this.draftTick();
      this.draw();
    });
    effect(() => {
      const el = this.textEditor()?.nativeElement;
      if (!this.pendingTextFocus || !el) return;
      this.pendingTextFocus = false;
      this.focusTextEditor(el);
    });
  }

  ngAfterViewInit(): void {
    this.draw();
  }

  private readonly draftSignal = signal(0);
  private draftTick(): number {
    return this.draftSignal();
  }
  private bumpDraft(): void {
    this.draftSignal.update((v) => v + 1);
    this.draftCount.set(this.gesture.draftPoints.length / 2);
  }

  protected shapeKindSvg(kind: ShapeGeneratorKind): SafeHtml {
    let inner: string;
    if (kind === 'rect') {
      inner = '<rect x="4" y="6" width="16" height="12" fill="none" stroke="currentColor" stroke-width="2"/>';
    } else if (kind === 'ellipse') {
      inner = '<ellipse cx="12" cy="12" rx="8" ry="6" fill="none" stroke="currentColor" stroke-width="2"/>';
    } else {
      const pts = buildShapeKindPoints(kind);
      inner = `<polygon points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/>`;
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">${inner}</svg>`
    );
  }

  protected lineKindSvg(kind: LineKind): SafeHtml {
    let inner: string;
    if (kind === 'straight') {
      inner = '<line x1="4" y1="18" x2="20" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    } else if (kind === 'curve') {
      inner =
        '<path d="M3 18 C 7 4 13 22 21 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>';
    } else if (kind === 'closedCurve') {
      inner =
        '<path d="M12 4 C 17 2 21 6 19 10 C 18 12 21 14 18 17 C 15 20 9 21 6 17 C 3 13 7 12 5 9 C 3 6 8 5 12 4 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>';
    } else {
      inner =
        '<polyline points="3,18 9,8 15,14 21,5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">${inner}</svg>`
    );
  }

  private buildHelpers(ctx: CanvasRenderingContext2D): RenderHelpers {
    const defById = new Map(STAMPS.map((d) => [d.id, d]));
    return {
      texturePattern: (fill, cellPx) => {
        if (isImageTextureId(fill.textureId)) {
          const url = this.imageStorage.get(imageTextureIdentifier(fill.textureId))?.url;
          if (!url) return null;
          const image = getRasterImage(url);
          if (!image) {
            this.schedulePendingImage(url);
            return null;
          }
          return createImageTexturePattern(ctx, image, cellPx, fill.scale, fill.rotation);
        }
        const id = normalizeTextureId(fill.textureId);
        if (!isTextureId(id)) return null;
        const url = TEXTURE_ASSET_URLS[id];
        const image = getRasterImage(url);
        if (!image) {
          this.schedulePendingImage(url);
          return null;
        }
        return createImageTexturePattern(ctx, image, cellPx, fill.scale, fill.rotation);
      },
      stampImage: (item) => {
        if (isImageStampId(item.stampId)) {
          const url = this.imageStorage.get(imageStampIdentifier(item.stampId))?.url;
          if (!url) return null;
          const image = getRasterImage(url);
          if (!image) this.schedulePendingImage(url);
          return image;
        }
        const def = defById.get(item.stampId);
        if (!def) return null;
        const image = getStampImage(def, item.size, item.color);
        if (!image) this.schedulePending(def, item.size, item.color);
        return image;
      },
      rasterImage: (item) => {
        const url = this.imageStorage.get(item.imageIdentifier)?.url;
        if (!url) return null;
        const image = getRasterImage(url);
        if (!image) this.schedulePendingImage(url);
        return image;
      },
    };
  }

  private schedulePending(def: StampDef, size: number, color: string | null): void {
    const key = def.id + '|' + size + '|' + (color ?? '');
    if (this.pendingStamps.has(key)) return;
    this.pendingStamps.add(key);
    loadStampImage(def, size, color)
      .then(() => {
        this.pendingStamps.delete(key);
        this.renderTick.update((v) => v + 1);
      })
      .catch(() => this.pendingStamps.delete(key));
  }

  private previewStampImage(stampId: string, size: number): HTMLImageElement | null {
    if (isImageStampId(stampId)) {
      const url = this.imageStorage.get(imageStampIdentifier(stampId))?.url;
      if (!url) return null;
      const image = getRasterImage(url);
      if (!image) this.schedulePendingImage(url);
      return image;
    }
    const def = getStampById(stampId);
    if (!def) return null;
    const image = getStampImage(def, size, this.state.stampColor());
    if (!image) this.schedulePending(def, size, this.state.stampColor());
    return image;
  }

  private schedulePendingImage(url: string): void {
    if (this.pendingImages.has(url)) return;
    this.pendingImages.add(url);
    this.loadImageFn(url)
      .then(() => {
        this.pendingImages.delete(url);
        this.renderTick.update((v) => v + 1);
      })
      .catch(() => this.pendingImages.delete(url));
  }

  private draw(): void {
    const canvas = this.board()?.nativeElement;
    if (!canvas) return;
    const scene = this.state.current;
    const w = sceneWidthPx(scene);
    const h = sceneHeightPx(scene);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const helpers = this.buildHelpers(ctx);
    renderScene(ctx, scene, helpers, { hideTextId: this.editingText()?.itemId ?? undefined, drawFunctionLayers: true });
    this.drawOverlay(ctx);
  }

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    renderOverlay(ctx, this.state.current, this.overlayState());
  }

  /**
   * Gathers what the draft needs before the drawing starts.
   *
   * Images are loaded here; starting a load from inside the drawing would run it every frame.
   */
  private overlayState(): EditorOverlay {
    const state = this.state;
    const tool = state.tool();
    // The tool settings are read only while drawing. Every one read is another thing that
    // triggers a repaint, and switching tools would redraw the whole map.
    const drafting = !!this.gesture.draftStart || !!this.gesture.draftCurrent || this.gesture.draftPoints.length > 0;
    const isLine = drafting && (tool === 'line' || tool === 'polygon');
    const isErase = tool === 'cellErase';
    return {
      tool,
      lineKind: isLine ? state.lineKind() : 'straight',
      shapeKind: drafting && tool === 'shape' ? state.shapeKind() : 'rect',
      multiClickLine: isLine && this.multiClickLine(),
      hover: this.gesture.lastMove,
      panning: this.panning(),
      vectorErase: isErase && this.isVectorEraseTarget(),
      eraserSize: isErase ? state.eraserSize() : 0,
      draftStart: this.gesture.draftStart,
      draftCurrent: this.gesture.draftCurrent,
      draftPoints: this.gesture.draftPoints,
      freehandPoints: this.gesture.freehandPoints,
      selection: state.selection(),
      selectedImage: this.selectedImageItem(),
      selectedCurve: this.selectedCurveItem(),
      stamp: this.overlayStamp(),
      image: this.overlayImage(),
      measureLabel: {
        cells: (n: string) => this.t('feature.mapEditor.measure.cells', { n }),
        angle: (deg: number) => this.t('feature.mapEditor.measure.angle', { deg }),
      },
    };
  }

  private overlayStamp(): OverlayStamp | null {
    // The tool is read first; reading a setting first would repaint the board for changes made while another tool was selected.
    if (this.state.tool() !== 'stamp' || !this.gesture.lastMove) return null;
    const stampId = this.state.stampId();
    if (!stampId) return null;
    const size = this.state.stampSize();
    const image = this.previewStampImage(stampId, size);
    if (!image) return null;
    return {
      image,
      size,
      center: this.stampCenter(this.gesture.lastMove.x, this.gesture.lastMove.y),
      rotation: this.state.stampRotation(),
      flipX: this.state.stampFlipX(),
      flipY: this.state.stampFlipY(),
    };
  }

  private overlayImage(): OverlayImage | null {
    if (this.state.tool() !== 'image' || !this.gesture.lastMove) return null;
    const pendingId = this.state.pendingImageId();
    if (!pendingId) return null;
    const url = this.imageStorage.get(pendingId)?.url;
    if (!url) return null;
    const image = getRasterImage(url);
    if (!image) {
      this.schedulePendingImage(url);
      return null;
    }
    const size = fitImageSize(
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      this.state.current.cellPx
    );
    return { image, at: this.gesture.lastMove, size };
  }

  private selectedImageItem(): ImageItem | null {
    if (this.state.tool() !== 'select') return null;
    const sel = this.state.selection();
    if (!sel) return null;
    const layer = this.state.current.layers.find((l) => l.id === sel.layerId);
    if (!layer || layer.kind !== 'image') return null;
    return layer.items.find((i) => i.id === sel.itemId) ?? null;
  }

  private selectedCurveItem(): ShapeItem | null {
    if (this.state.tool() !== 'select') return null;
    const sel = this.state.selection();
    if (!sel) return null;
    const layer = this.state.current.layers.find((l) => l.id === sel.layerId);
    if (!layer || layer.kind !== 'shape') return null;
    const item = layer.items.find((i) => i.id === sel.itemId);
    if (!item || (item.shape !== 'curve' && item.shape !== 'closedCurve')) return null;
    return item;
  }

  protected setTool(tool: EditorTool): void {
    if (this.editingText()) this.commitTextEdit();
    this.cancelDraft();
    this.state.tool.set(tool);
  }

  protected setLineKind(kind: LineKind): void {
    this.cancelDraft();
    this.state.lineKind.set(kind);
  }

  private multiClickLine(): boolean {
    const kind = this.state.lineKind();
    return kind === 'polyline' || kind === 'curve' || kind === 'closedCurve';
  }

  private toScene(event: PointerEvent): { x: number; y: number } {
    const canvas = this.board()!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const zoom = this.state.zoom();
    return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
  }

  private stampCenter(x: number, y: number): { x: number; y: number } {
    if (this.state.snapEnabled()) {
      const scene = this.state.current;
      const cell = pointToCell(scene.gridType, x, y, scene.cellPx);
      return cellCenter(scene.gridType, cell.col, cell.row, scene.cellPx);
    }
    return { x, y };
  }

  /**
   * The gesture this tool makes.
   *
   * The tool name alone does not decide it: a line either drags out or places points by
   * its kind, and the eraser depends on what it is erasing. The branching lives only here.
   */
  private gestureKindOf(tool: EditorTool): GestureKind {
    switch (tool) {
      case 'select':
        return 'select';
      case 'cellPaint':
        return 'paint';
      case 'functionPaint':
      case 'functionErase':
        return 'paint';
      case 'cellErase':
        return this.isVectorEraseTarget() ? 'vectorErase' : 'paint';
      case 'fill':
        return 'fill';
      case 'shape':
        return 'box';
      case 'line':
        return this.state.lineKind() === 'straight' ? 'box' : 'path';
      case 'polygon':
        return 'path';
      case 'stamp':
        return 'stamp';
      case 'image':
        return 'image';
      case 'freehand':
        return 'freehand';
      case 'text':
        return 'text';
      default:
        return 'none';
    }
  }

  /** The gesture from the press while one is under way, and the current tool's otherwise. */
  private currentKind(): GestureKind {
    return this.gesture.dragging ? this.gesture.kind : this.gestureKindOf(this.state.tool());
  }

  protected onPointerDown(event: PointerEvent): void {
    const canvas = this.board()!.nativeElement;
    if (event.button === 1 || (event.button === 0 && this.spacePan())) {
      event.preventDefault();
      canvas.setPointerCapture(event.pointerId);
      this.panning.set(true);
      this.gesture.panLast = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;
    if (this.editingText()) {
      this.commitTextEdit();
      return;
    }
    canvas.setPointerCapture(event.pointerId);

    const pos = this.toScene(event);
    this.gesture.lastPointerScene = pos;
    this.gesture.dragging = true;
    this.gesture.kind = this.gestureKindOf(this.state.tool());

    switch (this.gesture.kind) {
      case 'select':
        return this.selectDown(pos);
      case 'vectorErase':
        return this.vectorEraseDown(pos);
      case 'paint':
        return this.paintDown(pos);
      case 'fill':
        return this.fillDown(pos);
      case 'box':
        return this.boxDown(pos);
      case 'path':
        return this.pathDown(pos);
      case 'stamp':
        return this.stampDown(pos);
      case 'image':
        return this.imageDown(pos);
      case 'freehand':
        return this.freehandDown(pos);
      case 'text':
        return this.textDown(pos);
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.panning() && this.gesture.panLast) {
      event.preventDefault();
      const container = this.stage()?.nativeElement;
      if (container) {
        container.scrollLeft -= event.clientX - this.gesture.panLast.x;
        container.scrollTop -= event.clientY - this.gesture.panLast.y;
      }
      this.gesture.panLast = { x: event.clientX, y: event.clientY };
      return;
    }

    const pos = this.toScene(event);
    const scene = this.state.current;
    this.cursorCell.set(pointToCell(scene.gridType, pos.x, pos.y, scene.cellPx));
    this.gesture.lastMove = pos;

    const kind = this.currentKind();
    if (kind === 'stamp' || kind === 'image') {
      this.bumpDraft();
      return;
    }
    if (!this.gesture.dragging) {
      this.previewHover(pos, kind);
      return;
    }

    switch (kind) {
      case 'select':
        return this.selectMove(pos);
      case 'vectorErase':
        return this.eraseVectorAlong(pos);
      case 'paint':
        return this.paintAt(pos, this.state.tool());
      case 'box':
        return this.boxMove(pos);
      case 'freehand':
        return this.freehandMove(pos);
    }
  }

  protected onPointerUp(event: PointerEvent): void {
    this.board()!.nativeElement.releasePointerCapture?.(event.pointerId);
    if (this.panning()) {
      this.panning.set(false);
      this.gesture.panLast = null;
      return;
    }

    switch (this.gesture.kind) {
      case 'select':
        this.selectUp();
        break;
      case 'paint':
      case 'vectorErase':
        this.paintUp();
        break;
      case 'box':
        this.boxUp();
        break;
      case 'freehand':
        this.freehandUp();
        break;
    }
    this.gesture.dragging = false;
  }

  /** The preview between presses, showing where the next point or the next fill would go. */
  private previewHover(pos: { x: number; y: number }, kind: GestureKind): void {
    if (kind === 'path') this.gesture.draftCurrent = { x: pos.x, y: pos.y };
    if (kind === 'paint' || kind === 'vectorErase' || kind === 'fill' || kind === 'path') this.bumpDraft();
  }

  private selectDown(pos: { x: number; y: number }): void {
    const selImage = this.selectedImageItem();
    if (selImage) {
      const handle = imageHandleAt(selImage, pos.x, pos.y);
      if (handle !== -1) {
        const opposite = imageCorners(selImage)[(handle + 2) % 4];
        this.gesture.imageResize = { item: selImage, anchorX: opposite.x, anchorY: opposite.y };
        this.state.beginGesture();
        this.bumpDraft();
        return;
      }
    }
    const selCurve = this.selectedCurveItem();
    if (selCurve) {
      const anchor = curveAnchorAt(selCurve, pos.x, pos.y);
      if (anchor !== -1) {
        this.gesture.curveDrag = { index: anchor };
        this.state.beginGesture();
        this.bumpDraft();
        return;
      }
    }
    this.state.selection.set(this.state.hitTest(pos.x, pos.y));
    this.gesture.lastMoveStored = pos;
    this.gesture.selectionMoved = false;
    this.bumpDraft();
  }

  private selectMove(pos: { x: number; y: number }): void {
    if (this.gesture.imageResize) {
      this.resizeImageTo(pos.x, pos.y);
      this.bumpDraft();
      return;
    }
    if (this.gesture.curveDrag) {
      const snapped = this.state.snapPoint(pos.x, pos.y);
      this.state.updateSelectedShapePointLive(this.gesture.curveDrag.index, snapped.x, snapped.y);
      this.bumpDraft();
      return;
    }
    if (this.state.selection() && this.gesture.lastMoveStored) {
      this.state.moveSelection(pos.x - this.gesture.lastMoveStored.x, pos.y - this.gesture.lastMoveStored.y);
      this.gesture.selectionMoved = true;
    }
    this.gesture.lastMoveStored = pos;
    this.bumpDraft();
  }

  private selectUp(): void {
    if (this.gesture.imageResize) {
      this.state.endGesture();
      this.gesture.imageResize = null;
      this.bumpDraft();
      return;
    }
    if (this.gesture.curveDrag) {
      this.state.endGesture();
      this.gesture.curveDrag = null;
      this.bumpDraft();
      return;
    }
    if (!this.gesture.dragging) return;
    if (this.gesture.selectionMoved) this.state.endGesture();
    this.gesture.lastMoveStored = null;
    this.gesture.selectionMoved = false;
  }

  private vectorEraseDown(pos: { x: number; y: number }): void {
    this.gesture.vectorErasing = true;
    this.gesture.lastErasePx = null;
    this.state.beginGesture();
    this.eraseVectorAlong(pos);
  }

  private paintDown(pos: { x: number; y: number }): void {
    this.gesture.vectorErasing = false;
    this.state.beginGesture();
    this.gesture.lastPaintedCell = null;
    this.gesture.lastPaintPx = null;
    this.paintAt(pos, this.state.tool());
  }

  private paintUp(): void {
    if (!this.gesture.dragging) return;
    this.state.endGesture();
    this.gesture.lastPaintedCell = null;
    this.gesture.lastPaintPx = null;
  }

  private fillDown(pos: { x: number; y: number }): void {
    const scene = this.state.current;
    const cell = pointToCell(scene.gridType, pos.x, pos.y, scene.cellPx);
    this.state.floodFillAt(cell.col, cell.row);
    this.gesture.dragging = false;
  }

  private boxDown(pos: { x: number; y: number }): void {
    const snapped = this.state.snapPoint(pos.x, pos.y);
    this.gesture.draftStart = { x: snapped.x, y: snapped.y };
    this.gesture.draftCurrent = { x: snapped.x, y: snapped.y };
    this.bumpDraft();
  }

  private boxMove(pos: { x: number; y: number }): void {
    this.gesture.draftCurrent = this.state.snapPoint(pos.x, pos.y);
    this.bumpDraft();
  }

  private boxUp(): void {
    const from = this.gesture.draftStart;
    const to = this.gesture.draftCurrent;
    if (!from || !to) return;

    const w = Math.abs(to.x - from.x);
    const h = Math.abs(to.y - from.y);
    // Anything the size of a point was a misfire, and a press alone should not scatter small shapes.
    if (w > 2 || h > 2) {
      if (this.state.tool() === 'line') {
        this.state.addShapeItem('line', [from.x, from.y, to.x, to.y], null);
      } else {
        this.commitShape(Math.min(from.x, to.x), Math.min(from.y, to.y), w, h);
      }
    }
    this.gesture.draftStart = null;
    this.gesture.draftCurrent = null;
    this.bumpDraft();
  }

  private pathDown(pos: { x: number; y: number }): void {
    const snapped = this.state.snapPoint(pos.x, pos.y);
    this.gesture.draftPoints.push(snapped.x, snapped.y);
    this.gesture.draftCurrent = { x: pos.x, y: pos.y };
    this.bumpDraft();
  }

  private stampDown(pos: { x: number; y: number }): void {
    const center = this.stampCenter(pos.x, pos.y);
    this.state.placeStamp(center.x, center.y, this.stampLayerName());
    this.gesture.dragging = false;
  }

  private imageDown(pos: { x: number; y: number }): void {
    this.gesture.dragging = false;
    void this.placeImageAt(pos.x, pos.y);
  }

  private freehandDown(pos: { x: number; y: number }): void {
    this.state.beginGesture();
    this.gesture.freehandPoints = [pos.x, pos.y];
    this.bumpDraft();
  }

  private freehandMove(pos: { x: number; y: number }): void {
    this.gesture.freehandPoints.push(pos.x, pos.y);
    this.bumpDraft();
  }

  private freehandUp(): void {
    if (!this.gesture.dragging) return;
    this.state.addFreehand(this.gesture.freehandPoints);
    this.gesture.freehandPoints = [];
    this.bumpDraft();
  }

  private textDown(pos: { x: number; y: number }): void {
    const snapped = this.state.snapPoint(pos.x, pos.y);
    this.gesture.dragging = false;
    this.startTextEdit(snapped.x, snapped.y, null, null, '');
  }

  private resizeImageTo(px: number, py: number): void {
    const anchor = this.gesture.imageResize;
    if (!anchor) return;
    const w = Math.max(8, Math.abs(px - anchor.anchorX));
    const h = Math.max(8, Math.abs(py - anchor.anchorY));
    const cx = px >= anchor.anchorX ? anchor.anchorX + w / 2 : anchor.anchorX - w / 2;
    const cy = py >= anchor.anchorY ? anchor.anchorY + h / 2 : anchor.anchorY - h / 2;
    this.state.updateSelectedImageLive({ x: cx, y: cy, w, h });
  }

  protected onDoubleClick(): void {
    const tool = this.state.tool();
    const hasDraft = this.gesture.draftPoints.length > 0;
    if ((tool === 'polygon' || (tool === 'line' && this.multiClickLine())) && hasDraft) {
      this.commitDraftPolyline();
      return;
    }
    if (tool !== 'text' && tool !== 'select') return;
    const pos = this.gesture.lastPointerScene;
    if (!pos) return;
    const sel = this.state.hitTest(pos.x, pos.y);
    if (!sel) return;
    const layer = this.state.current.layers.find((l) => l.id === sel.layerId);
    if (!layer || layer.kind !== 'text') return;
    const item = layer.items.find((i) => i.id === sel.itemId);
    if (!item) return;
    this.state.fontSize.set(item.fontSize);
    this.state.textColor.set(item.color);
    this.state.textBold.set(item.bold);
    this.state.textItalic.set(item.italic);
    this.startTextEdit(item.x, item.y, layer.id, item.id, item.text);
  }

  private startTextEdit(x: number, y: number, layerId: string | null, itemId: string | null, text: string): void {
    this.pendingTextFocus = true;
    this.pendingTextInitial = text;
    this.textDraft.set(text);
    this.editingText.set({ x, y, layerId, itemId });
  }

  private focusTextEditor(el: HTMLElement): void {
    el.textContent = this.pendingTextInitial;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }

  protected onTextInput(event: Event): void {
    const el = event.target as HTMLElement;
    this.textDraft.set(el.innerText);
  }

  protected onTextEditorKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.cancelTextEdit();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.commitTextEdit();
    }
  }

  protected commitTextEdit(): void {
    const editing = this.editingText();
    if (!editing) return;
    const text = this.textDraft().replace(/^\s+|\s+$/g, '');
    if (editing.itemId) {
      const layer = this.state.current.layers.find((l) => l.id === editing.layerId);
      if (layer && layer.kind === 'text') {
        if (!text) {
          this.state.applyCommitted(() => removeText(layer, editing.itemId!));
        } else {
          this.state.applyCommitted(() =>
            updateText(layer, editing.itemId!, {
              text,
              fontSize: this.state.fontSize(),
              color: this.state.textColor(),
              bold: this.state.textBold(),
              italic: this.state.textItalic(),
            })
          );
        }
      }
    } else if (text) {
      this.state.addTextItem(editing.x, editing.y, text);
    }
    this.editingText.set(null);
    this.textDraft.set('');
  }

  protected cancelTextEdit(): void {
    this.editingText.set(null);
    this.textDraft.set('');
  }

  protected finishDraft(): void {
    this.commitDraftPolyline();
  }

  protected cancelDraftPublic(): void {
    this.cancelDraft();
  }

  protected deleteSelectionPublic(): void {
    if (!this.state.selection()) return;
    this.state.deleteSelection();
    this.bumpDraft();
  }

  private eraseVectorAlong(pos: { x: number; y: number }): void {
    const radius = this.state.eraserSize();
    const from = this.gesture.lastErasePx ?? pos;
    const dist = Math.hypot(pos.x - from.x, pos.y - from.y);
    const step = Math.max(1, radius / 2);
    const samples = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      this.state.eraseAt(from.x + (pos.x - from.x) * t, from.y + (pos.y - from.y) * t, radius);
    }
    this.gesture.lastErasePx = pos;
  }

  private paintAt(pos: { x: number; y: number }, tool: EditorTool): void {
    const cellPx = this.state.current.cellPx;
    const from = this.gesture.lastPaintPx ?? pos;
    const dist = Math.hypot(pos.x - from.x, pos.y - from.y);
    const step = Math.max(1, cellPx / 3);
    const samples = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= samples; i += 1) {
      const t = i / samples;
      this.paintSampleAt(from.x + (pos.x - from.x) * t, from.y + (pos.y - from.y) * t, tool);
    }
    this.gesture.lastPaintPx = pos;
  }

  private paintSampleAt(x: number, y: number, tool: EditorTool): void {
    const scene = this.state.current;
    const { col, row } = pointToCell(scene.gridType, x, y, scene.cellPx);
    if (col < 0 || row < 0 || col >= scene.cols || row >= scene.rows) return;
    const key = cellKey(col, row);
    if (key === this.gesture.lastPaintedCell) return;
    this.gesture.lastPaintedCell = key;
    if (tool === 'functionPaint') this.state.paintFunctionCell(col, row);
    else if (tool === 'functionErase') this.state.eraseFunctionCellAt(col, row);
    else if (tool === 'cellPaint') this.state.paintCell(col, row);
    else this.state.eraseCellAt(col, row);
  }

  private commitDraftPolyline(): void {
    const tool = this.state.tool();
    if (tool === 'polygon' && this.gesture.draftPoints.length >= 6) {
      this.state.addShapeItem(
        'polygon',
        this.gesture.draftPoints.slice(),
        this.state.currentFill(),
        this.shapeLayerName()
      );
    } else if (tool === 'line' && this.state.lineKind() === 'polyline' && this.gesture.draftPoints.length >= 4) {
      this.state.addShapeItem('polyline', this.gesture.draftPoints.slice(), null, this.shapeLayerName());
    } else if (tool === 'line' && this.state.lineKind() === 'curve' && this.gesture.draftPoints.length >= 4) {
      this.state.addShapeItem('curve', this.gesture.draftPoints.slice(), null, this.shapeLayerName());
    } else if (tool === 'line' && this.state.lineKind() === 'closedCurve' && this.gesture.draftPoints.length >= 6) {
      this.state.addShapeItem(
        'closedCurve',
        this.gesture.draftPoints.slice(),
        this.state.currentFill(),
        this.shapeLayerName()
      );
    }
    this.gesture.draftPoints = [];
    this.gesture.draftCurrent = null;
    this.bumpDraft();
  }

  private commitShape(x: number, y: number, w: number, h: number): void {
    const kind = this.state.shapeKind();
    const fill = this.state.currentFill();
    const name = this.shapeLayerName();
    if (kind === 'rect' || kind === 'ellipse') {
      this.state.addShapeItem(kind, [x, y, w, h], fill, name);
      return;
    }
    const points = generateShapePoints(kind, x, y, w, h);
    if (points.length >= 6) this.state.addShapeItem('polygon', points, fill, name);
  }

  private shapeLayerName(): string {
    const tool = this.state.tool();
    let label: string;
    if (tool === 'polygon') {
      label = this.t('feature.mapEditor.tools.polygon');
    } else if (tool === 'line' && this.multiClickLine()) {
      label = this.t('feature.mapEditor.props.lineKinds.' + this.state.lineKind());
    } else {
      label = this.t('feature.mapEditor.props.shapeKinds.' + this.state.shapeKind());
    }
    this.shapeLayerCounter += 1;
    return label + ' ' + this.shapeLayerCounter;
  }

  private imageLayerName(): string {
    this.imageLayerCounter += 1;
    return this.t('feature.mapEditor.layers.kinds.image') + ' ' + this.imageLayerCounter;
  }

  private stampLayerName(): string {
    this.stampLayerCounter += 1;
    return this.t('feature.mapEditor.layers.kinds.stamp') + ' ' + this.stampLayerCounter;
  }

  private shapeLayerCounter = 0;
  private imageLayerCounter = 0;
  private stampLayerCounter = 0;

  protected async chooseImage(): Promise<void> {
    const id = await this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: false }).catch(() => null);
    if (id) this.state.pendingImageId.set(id);
  }

  protected pendingImageUrl(): string | null {
    const id = this.state.pendingImageId();
    return id ? (this.imageStorage.get(id)?.url ?? null) : null;
  }

  private async placeImageAt(x: number, y: number): Promise<void> {
    const id = this.state.pendingImageId();
    if (!id) return;
    const url = this.imageStorage.get(id)?.url;
    const cellPx = this.state.current.cellPx;
    let naturalW = 4 * cellPx;
    let naturalH = 4 * cellPx;
    if (url) {
      try {
        const image = await this.loadImageFn(url);
        naturalW = image.naturalWidth || image.width || naturalW;
        naturalH = image.naturalHeight || image.height || naturalH;
      } catch {
        naturalW = 4 * cellPx;
        naturalH = 4 * cellPx;
      }
    }
    const fit = fitImageSize(naturalW, naturalH, this.state.current.cellPx);
    const item: ImageItem = {
      id: newId(),
      imageIdentifier: id,
      x,
      y,
      w: fit.w,
      h: fit.h,
      rotation: 0,
      opacity: 1,
    };
    this.state.placeImage(item, this.imageLayerName());
  }

  private cancelDraft(): void {
    this.gesture.draftPoints = [];
    this.gesture.draftStart = null;
    this.gesture.draftCurrent = null;
    this.gesture.freehandPoints = [];
    this.bumpDraft();
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (mapEditorKeyUp(event.code)) this.spacePan.set(false);
  }

  protected onKeyDown(event: KeyboardEvent): void {
    const action = mapEditorKeyDown(event.key, event.code, {
      typing: isTypingTarget(event.target),
      chord: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      alt: event.altKey,
      hasSelection: this.state.selection() !== null,
      toolKeys: this.toolKeys,
    });
    if (!action) return;
    if (action.preventDefault) event.preventDefault();

    switch (action.command) {
      case 'panStart':
        this.spacePan.set(true);
        return;
      case 'undo':
        this.state.undo();
        return;
      case 'redo':
        this.state.redo();
        return;
      case 'deleteSelection':
        this.state.deleteSelection();
        this.bumpDraft();
        return;
      case 'cancelDraft':
        this.cancelDraft();
        this.cancelTextEdit();
        return;
      case 'commitDraft':
        this.commitDraftPolyline();
        return;
      case 'pickTool': {
        const tool = this.shortcutToTool.get(action.shortcut ?? '');
        if (tool) this.setTool(tool);
        return;
      }
      default:
        return;
    }
  }

  protected onWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const before = this.state.zoom();
    const delta = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const after = Math.max(0.25, Math.min(3, before * delta));
    if (after === before) return;
    const container = this.stage()?.nativeElement;
    const canvas = this.board()?.nativeElement;
    if (!container || !canvas) {
      this.applyZoom(after);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offsetX = canvasRect.left - containerRect.left + container.scrollLeft;
    const offsetY = canvasRect.top - containerRect.top + container.scrollTop;
    const sceneX = (event.clientX - canvasRect.left) / before;
    const sceneY = (event.clientY - canvasRect.top) / before;
    this.applyZoom(after);
    const scene = this.state.current;
    canvas.style.width = sceneWidthPx(scene) * after + 'px';
    canvas.style.height = sceneHeightPx(scene) * after + 'px';
    container.scrollLeft = offsetX + sceneX * after - (event.clientX - containerRect.left);
    container.scrollTop = offsetY + sceneY * after - (event.clientY - containerRect.top);
  }

  private applyZoom(z: number): void {
    this.state.zoom.set(z);
    this.draftSignal.update((v) => v + 1);
  }

  protected readonly lastBackgroundColor = signal('#ece6d9');

  protected readonly canvasBackground = computed(() => {
    this.state.sceneTick();
    return this.state.current.background === 'transparent'
      ? 'repeating-conic-gradient(#e5e7eb 0% 25%, #ffffff 0% 50%) 0 0 / 16px 16px'
      : null;
  });

  protected backgroundTransparent(): boolean {
    return this.state.current.background === 'transparent';
  }

  protected backgroundColorValue(): string {
    const bg = this.state.current.background;
    return bg === 'transparent' ? this.lastBackgroundColor() : bg;
  }

  protected setBackgroundColor(color: string): void {
    this.lastBackgroundColor.set(color);
    this.state.setBackground(color);
  }

  protected toggleBackgroundTransparent(transparent: boolean): void {
    if (transparent) {
      const bg = this.state.current.background;
      if (bg !== 'transparent') this.lastBackgroundColor.set(bg);
      this.state.setBackground('transparent');
    } else {
      this.state.setBackground(this.lastBackgroundColor());
    }
  }

  protected setFillMode(mode: 'solid' | 'texture'): void {
    this.state.fillMode.set(mode);
  }

  protected zoomIn(): void {
    this.state.zoom.update((z) => Math.min(3, z + 0.25));
    this.draftSignal.update((v) => v + 1);
  }
  protected zoomOut(): void {
    this.state.zoom.update((z) => Math.max(0.25, z - 0.25));
    this.draftSignal.update((v) => v + 1);
  }
  protected zoomReset(): void {
    this.state.zoom.set(1);
    this.draftSignal.update((v) => v + 1);
  }

  protected onResizeCols(value: number): void {
    const cols = Math.max(1, Math.min(100, Math.round(value)));
    this.state.resize(cols, this.state.current.rows);
  }
  protected onResizeRows(value: number): void {
    const rows = Math.max(1, Math.min(100, Math.round(value)));
    this.state.resize(this.state.current.cols, rows);
  }
  protected onCellPx(value: number): void {
    this.state.setCellPx(Math.max(16, Math.min(256, Math.round(value))));
  }

  private renderLayerThumb(layer: MapLayer): string {
    if (typeof document === 'undefined') return '';
    const scene = this.state.current;
    const w = sceneWidthPx(scene);
    const h = sceneHeightPx(scene);
    if (w <= 0 || h <= 0) return '';
    const maxDim = 48;
    const scale = Math.min(maxDim / w, maxDim / h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const single: MapScene = { ...scene, gridVisible: false, background: 'transparent', layers: [layer] };
    ctx.scale(scale, scale);
    renderScene(ctx, single, this.buildHelpers(ctx), { drawGrid: false, drawFunctionLayers: true });
    try {
      return canvas.toDataURL();
    } catch {
      return '';
    }
  }

  private isVectorEraseTarget(): boolean {
    const layer = this.state.activeLayer();
    return !!layer && !layer.locked && layer.kind !== 'cell';
  }

  protected async save(): Promise<void> {
    const archive = await packSceneWithImages(this.state.current, this.imageStorage);
    const blob = new Blob([archive.slice()], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'map.zip';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  protected triggerLoad(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const buffer = new Uint8Array(await file.arrayBuffer());
    if (isZipArchive(buffer)) {
      const scene = await unpackSceneWithImages(buffer, this.imageStorage, () =>
        this.objectChange.notifyCollectionChanged('image-tag')
      );
      if (scene) this.state.loadScene(scene);
      else this.errorNotice.show(this.t('feature.mapEditor.actions.loadError'));
      return;
    }
    const scene = deserializeScene(new TextDecoder().decode(buffer));
    if (!scene) {
      this.errorNotice.show(this.t('feature.mapEditor.actions.loadError'));
      return;
    }
    this.state.loadScene(scene);
  }

  protected async saveImage(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.exportFn(this.state.current, STAMPS, {
        scale: this.exportScale(),
        drawGrid: false,
        resolveImageUrl: (id) => this.imageStorage.get(id)?.url ?? null,
      });
      await this.imageStorage.addAsync(blob);
      this.notice.show(this.t('feature.mapEditor.actions.savedImage'));
    } catch {
      this.errorNotice.show(this.t('feature.mapEditor.actions.exportError'));
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Opens ready to paint one kind of function on the table that is out.
   *
   * A scene with nothing drawn on it has nothing to lose, so the table is read in without
   * asking. One that has been worked on is left exactly as it stands: the brush is handed
   * over and reading the table in stays the game master's own decision.
   */
  beginFunctionPaint(role: MapFunctionRole): void {
    const snapshot = this.state.isUntouched ? this.functionalPaint.snapshot() : null;
    if (snapshot) this.state.loadScene(sceneFromTable(snapshot));
    this.state.functionRole.set(role);
    this.state.tool.set('functionPaint');
  }

  /**
   * Brings the table that is out into the editor.
   *
   * The floor arrives as a picture and only what the editor painted arrives as cells, so
   * whatever a person placed by hand stays on the table, out of reach and out of the way.
   */
  protected async importTable(): Promise<void> {
    if (this.busy()) return;
    const snapshot = this.functionalPaint.snapshot();
    if (!snapshot) {
      this.errorNotice.show(this.t('feature.mapEditor.actions.importTableNoTable'));
      return;
    }
    if (!(await this.confirm.ask(this.t('feature.mapEditor.actions.importTableConfirm')))) return;

    this.state.loadScene(sceneFromTable(snapshot));
    this.notice.show(this.t('feature.mapEditor.actions.importTableDone'));
  }

  /**
   * Lays what was painted on the table, and leaves the floor as it is.
   *
   * Baking the picture again to add a closed cell would cost the floor its quality and its
   * identity both, and neither has anything to do with what was painted.
   */
  protected applyFunctions(): boolean {
    const snapshot = this.functionalPaint.snapshot();
    if (!snapshot) {
      this.errorNotice.show(this.t('feature.mapEditor.actions.importTableNoTable'));
      return false;
    }
    const plan = planFunctionPaint(this.state.current, snapshot);
    if (!plan) {
      this.errorNotice.show(this.t('feature.mapEditor.actions.applyFunctionsGridMismatch'));
      return false;
    }
    if (!this.functionalPaint.apply(plan)) {
      this.errorNotice.show(this.t('feature.mapEditor.actions.importTableNoTable'));
      return false;
    }
    return true;
  }

  protected applyFunctionsOnly(): void {
    if (this.busy()) return;
    if (this.applyFunctions()) this.notice.show(this.t('feature.mapEditor.actions.applyFunctionsDone'));
  }

  protected async setAsTable(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const blob = await this.exportFn(this.state.current, STAMPS, {
        scale: this.exportScale(),
        drawGrid: false,
        resolveImageUrl: (id) => this.imageStorage.get(id)?.url ?? null,
      });
      const file = await this.imageStorage.addAsync(blob);
      const table = this.tabletopService.currentTable;
      const scene = this.state.current;
      table.imageIdentifier = file.identifier;
      table.width = scene.cols;
      table.height = scene.rows;
      table.gridSize = scene.cellPx;
      table.gridType = scene.gridType;
      this.applyFunctions();
      this.notice.show(this.t('feature.mapEditor.actions.setTableDone'));
    } catch {
      this.errorNotice.show(this.t('feature.mapEditor.actions.exportError'));
    } finally {
      this.busy.set(false);
    }
  }

  protected zoomPercent(): number {
    return Math.round(this.state.zoom() * 100);
  }
}
