import { NgClass } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
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
import { AnimatedImageService } from '@axe/application/media/animated-image.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { downloadBlob } from '@axe/core/util/download-blob';
import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import {
  clampBoardPitch,
  MAX_BOARD_PITCH,
  MIN_BOARD_PITCH,
  setBoardHeightKeepingFoot,
  WhiteBoard,
} from '@axe/domain/tabletop/white-board';
import { ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import { SceneHistory } from '@axe/features/map-editor/model/history';
import {
  createLayer,
  ImageLayer,
  MapLayer,
  MapScene,
  SceneGuideLine,
  sceneHeightPx,
  sceneWidthPx,
  StrokeDash,
  TextAlign,
  TextItem,
} from '@axe/features/map-editor/model/scene';
import {
  addImage,
  addLayer,
  addShape,
  addText,
  moveLayer,
  removeLayer,
  updateText,
} from '@axe/features/map-editor/model/scene-ops';
import { deserializeScene } from '@axe/features/map-editor/model/serialize';
import { getRasterImage, warmRasterImages } from '@axe/features/map-editor/render/raster-image';
import { renderScene } from '@axe/features/map-editor/render/render-scene';
import { detachFromBoard, standingOn } from '@axe/features/tabletop/white-board/white-board-contents';
import { BoardGesture } from '@axe/features/tabletop/white-board/white-board-gesture';
import { BoardKeeper } from '@axe/features/tabletop/white-board/white-board-keeper';
import {
  LayerDrawerAction,
  WhiteBoardLayerDrawerComponent,
} from '@axe/features/tabletop/white-board/white-board-layer-drawer.component';
import { hangablePictureIds } from '@axe/features/tabletop/white-board/white-board-live-pictures';
import {
  drawBand,
  drawFreehand,
  drawGuides,
  drawHold,
  drawJoints,
  drawLaying,
  drawPending,
  drawTrimWindow,
  gripAt,
  Ink,
} from '@axe/features/tabletop/white-board/white-board-painter';
import {
  BOARD_ZOOMS,
  clampZoom,
  fitZoom,
  RULER_WIDTH,
  RulerTick,
  rulerTicks,
  scrollKeepingPoint,
  ZOOM_STEP,
} from '@axe/features/tabletop/white-board/white-board-rulers';
import {
  addJoint,
  AlignEdge,
  alignMarks,
  BOARD_SHAPES,
  BOARD_TOOLS,
  BoardPoint,
  BoardTool,
  boxAround,
  boxOf,
  centreOnSheet,
  CHEQUER_CLASS,
  clearSheet,
  copyMark,
  createBoardScene,
  cropMark,
  fadeMark,
  fileUnder,
  flipMark,
  GRAPH_SPACINGS,
  groupLayers,
  groupNames,
  guessLineWidth,
  imageLayer,
  isTypingKey,
  jointedShape,
  LayerGroup,
  MARK_SHADOW,
  MarkBox,
  MarkRef,
  MarkStyle,
  MarkStyleChange,
  marksWithin,
  markUnder,
  NaturalSize,
  newGuide,
  noteAt,
  outlineFor,
  overlaysWanted,
  pathThrough,
  pictureOf,
  removeMark,
  renameGroup,
  restack,
  restyleMark,
  ruleBoard,
  shapeLayer,
  sheetGuides,
  sheetHolding,
  showGroup,
  SnapGuide,
  snapTo,
  spreadMarks,
  stickerAt,
  textLayer,
  turnMark,
  uncropMark,
  useTextMeasurer,
  wordsAt,
  wordsOf,
} from '@axe/features/tabletop/white-board/white-board-scene';
import { BoardKeyAction, boardKeyDown } from '@axe/features/tabletop/white-board/white-board-shortcuts';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { TranslocoModule } from '@jsverse/transloco';

/** How long the drawing has to settle before the board keeps a picture of it. */
/** How big a sticker goes down, in the board's own pixels. */
const STICKER_SIZE = 120;
const SELECT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">' +
  '<path d="M7 2 L7 19 L11.3 15.4 L13.9 21.3 L16.6 20.1 L14 14.3 L19.5 13.8 Z"/></svg>';

const ERASER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M20 20H7L3 16l10-10 7 7-2.5 2.5"/><path d="M6.0 20l4-4"/></svg>';

const TOOL_ICONS: Record<BoardTool, string> = {
  select: '',
  hand: 'pan_tool',
  pen: 'edit',
  marker: 'border_color',
  eraser: '',
  line: 'show_chart',
  arrow: 'north_east',
  shape: 'category',
  path: 'polyline',
  text: 'title',
  note: 'sticky_note_2',
  sticker: 'image',
};

const TOOL_SVG: Partial<Record<BoardTool, string>> = { select: SELECT_SVG, eraser: ERASER_SVG };

/** How near a corner counts as taking hold of it, in the sheet's own pixels at full size. */

/** How far a copy is set down from what it was copied off, so both can be seen. */
const DUPLICATE_OFFSET = 16;

/** How far one press of the turn buttons takes a mark round. */
const TURN_STEP = 15;

const MIN_SIDE = 1;
const MAX_SIDE = 40;

@Component({
  selector: 'white-board-editor',
  templateUrl: './white-board-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule, NgClass, WhiteBoardLayerDrawerComponent],
})
export class WhiteBoardEditorComponent {
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly animatedImage = inject(AnimatedImageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tabletopService = inject(TabletopService);
  private readonly panelService = inject(PanelService);
  protected readonly t = inject(TRANSLATE_FN);
  protected readonly isCompact = inject(ViewportService).isCompact;
  protected readonly drawer = signal<'none' | 'props' | 'layers'>('none');

  protected toggleDrawer(which: 'props' | 'layers'): void {
    this.drawer.update((open) => (open === which ? 'none' : which));
  }

  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('board');

  private readonly sanitizer = inject(DomSanitizer);

  /** Laid out the way the map editor lays its tools out, since a reader learns one of them once. */
  readonly tools: { tool: BoardTool; icon: string; svg?: SafeHtml }[] = BOARD_TOOLS.map((tool) => ({
    tool,
    icon: TOOL_ICONS[tool],
    svg: TOOL_SVG[tool] ? this.sanitizer.bypassSecurityTrustHtml(TOOL_SVG[tool]!) : undefined,
  }));
  readonly tool = signal<BoardTool>('pen');
  readonly color = signal('#1a1a1a');
  readonly strokeWidth = signal(4);
  readonly fontSize = signal(24);
  readonly bold = signal(false);
  readonly italic = signal(false);
  readonly align = signal<TextAlign>('left');
  readonly underline = signal(false);
  readonly strike = signal(false);
  /** How thick the line round the letters is, against their own size, so it holds under zoom. */
  readonly outlineWidth = signal(0);
  readonly outlineColor = signal('#ffffff');
  readonly wordShadow = signal(false);
  readonly dash = signal<StrokeDash>('solid');

  /**
   * Ink settings reach what is already down as well as what is next.
   *
   * A line drawn in the wrong colour would otherwise be a line to be rubbed out and drawn again,
   * which is not how anything else works.
   */
  protected setInk(change: MarkStyleChange): void {
    if (change.color !== undefined) this.color.set(change.color);
    if (change.width !== undefined) this.strokeWidth.set(change.width);
    if (change.fontSize !== undefined) this.fontSize.set(change.fontSize);
    if (change.bold !== undefined) this.bold.set(change.bold);
    if (change.italic !== undefined) this.italic.set(change.italic);
    if (change.align !== undefined) this.align.set(change.align);
    if (change.dash !== undefined) this.dash.set(change.dash);
    if (change.filled !== undefined) this.filled.set(change.filled);
    if (change.fillColor) this.fillColor.set(change.fillColor);
    if (change.shadow !== undefined) {
      this.shadowed.set(change.shadow);
      this.wordShadow.set(change.shadow);
    }
    if (change.underline !== undefined) this.underline.set(change.underline);
    if (change.strike !== undefined) this.strike.set(change.strike);
    if (change.outlineWidth !== undefined) this.outlineWidth.set(change.outlineWidth);
    if (change.outline) this.outlineColor.set(change.outline);

    const held = this.held();
    if (held.length < 1) return;
    for (const mark of held) restyleMark(this.scene, mark, change);
    this.touched();
  }

  readonly spacings = GRAPH_SPACINGS;
  readonly zooms = BOARD_ZOOMS;
  /**
   * How big the sheet is shown, against its own size.
   *
   * Squeezed into the width of the panel a sheet loses its ruling: a hairline drawn a pixel
   * wide and then shrunk by half is a pixel of nothing. Shown at its own size it is legible,
   * and the panel scrolls, which is what the map editor does and what a board must not do
   * worse than.
   */
  readonly zoom = signal(1);
  readonly turnStep = TURN_STEP;

  protected zoomPercent(): number {
    return Math.round(this.zoom() * 100);
  }

  protected zoomIn(): void {
    this.zoomAbout(this.zoom() * ZOOM_STEP, null);
  }

  protected zoomOut(): void {
    this.zoomAbout(this.zoom() / ZOOM_STEP, null);
  }

  protected zoomTo(value: number | string): void {
    this.zoomAbout(Number(value), null);
  }

  /** Big enough to fill the panel and no bigger, which is what anyone means by fit. */
  protected zoomToFit(): void {
    const stage = this.stageRef()?.nativeElement;
    if (!stage) return;
    this.zoomAbout(fitZoom(stage, this.sceneWidth, this.sceneHeight), null);
  }

  /**
   * Changes the size, keeping the point under the pointer under the pointer.
   *
   * Zooming about the corner of the sheet walks whatever is being worked on off the screen,
   * so what is under the cursor is what stays put, the way it does in anything else.
   */
  private zoomAbout(next: number, at: { x: number; y: number } | null): void {
    const stage = this.stageRef()?.nativeElement;
    const was = this.zoom();
    const now = clampZoom(next);
    if (Math.abs(now - was) < 0.0001) return;

    if (!stage) {
      this.zoom.set(now);
      return;
    }
    const scroll = scrollKeepingPoint(stage, stage.getBoundingClientRect(), at, was, now);

    this.zoom.set(now);
    queueMicrotask(() => {
      stage.scrollLeft = scroll.scrollLeft;
      stage.scrollTop = scroll.scrollTop;
    });
  }

  protected onWheel(event: WheelEvent): void {
    if (!event.ctrlKey && !event.metaKey) return;
    event.preventDefault();
    const by = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.zoomAbout(this.zoom() * by, { x: event.clientX, y: event.clientY });
  }
  readonly shapes = BOARD_SHAPES;
  readonly dashes: readonly StrokeDash[] = ['solid', 'dashed', 'dotted', 'dashdot', 'longdash'];
  readonly alignments: readonly TextAlign[] = ['left', 'center', 'right'];
  readonly shapeKind = signal<ShapeGeneratorKind>('rect');
  readonly filled = signal(false);
  /** The points set down for a path so far, which is not a mark until it is finished. */
  readonly laying = signal<BoardPoint[]>([]);
  readonly curved = signal(false);
  readonly fillColor = signal('#ffd54f');
  readonly shadowed = signal(false);
  readonly noteColor = signal('#fff59d');
  readonly snapping = signal(false);
  /** Lines drawn off the other marks, which is the only guide there is once the paper is plain. */
  readonly guiding = signal(true);
  readonly showRulers = signal(true);
  readonly rulerWidth = RULER_WIDTH;

  /** The numbers written along a ruler, spaced so they stay apart at whatever size the sheet is. */
  protected ticks(axis: 'x' | 'y'): RulerTick[] {
    return rulerTicks(axis === 'x' ? this.sceneWidth : this.sceneHeight, this.zoom());
  }
  /** The lines shown this instant, which last only as long as the drag that raised them. */
  readonly showing = signal<SnapGuide[]>([]);
  readonly activeLayerId = signal<string | null>(null);

  protected readonly typing = signal<BoardPoint | null>(null);
  protected typedText = '';

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly selected = signal<MarkRef | null>(null);
  /** Everything held. One mark is the common case; a dragged out box takes several. */
  readonly held = signal<MarkRef[]>([]);

  private history = new SceneHistory(createBoardScene(4, 3, 50));
  private clipboard: MarkRef[] = [];
  private panFrom: { x: number; y: number } | null = null;
  private keepingShape = false;
  private retyping: MarkRef | null = null;
  private wantsCaret = false;
  private wordsWere = '';
  protected readonly wordBoxRef = viewChild<ElementRef<HTMLElement>>('wordBox');
  private board: WhiteBoard | null = null;
  private readonly keeper = new BoardKeeper(
    {
      board: () => this.board,
      scene: () => this.scene,
      canvas: () => this.canvasRef()?.nativeElement ?? null,
      drawBare: () => this.redraw(undefined, true, true),
      redraw: () => void this.redraw(),
    },
    this.imageStorage
  );
  private scene: MapScene = createBoardScene(4, 3, 50);
  private readonly gesture = new BoardGesture({
    scene: () => this.scene,
    activeLayerId: () => this.activeLayerId(),
    tool: () => this.tool(),
    style: () => this.style(),
    shapeKind: () => this.shapeKind(),
    filled: () => this.filled(),
    strokeWidth: () => this.strokeWidth(),
    keepingShape: () => this.keepingShape,
    guiding: () => this.guiding(),
    guides: () => this.guides,
    grip: () => this.handleSlack(),
    held: () => this.held(),
    selected: () => this.selected(),
    trimming: () => this.trimming(),
    trimTo: (window) => this.trimming.set(window),
    laying: () => this.laying(),
    layTo: (points) => this.laying.set(points),
    hold: (marks) => this.hold(marks),
    show: (guides) => this.showing.set(guides),
    startTyping: (at) => this.startTyping(at, ''),
    redraw: (pending) => void this.redraw(pending),
    touched: () => this.touched(),
  });

  readonly minPitch = MIN_BOARD_PITCH;
  readonly maxPitch = MAX_BOARD_PITCH;
  readonly minSide = MIN_SIDE;
  readonly maxSide = MAX_SIDE;

  /** Bumped by hand, since the board's own values are not signals. */
  protected readonly revision = signal(0);

  /** The board's name, which also titles this panel. */
  get name(): string {
    this.revision();
    return this.board?.name ?? '';
  }
  set name(value: string) {
    if (!this.board) return;
    this.board.name = value;
    this.panelService.title = value;
    this.settingChanged();
  }

  /**
   * How many grid cells wide the board is.
   *
   * A new width is held within the allowed sides, and the drawing surface grows or shrinks with it.
   */
  get width(): number {
    this.revision();
    return this.board?.width ?? 1;
  }
  set width(value: number) {
    if (this.board) this.board.width = clampSide(value);
    this.resized();
  }

  /**
   * How many grid cells deep the board is.
   *
   * A new height keeps the board's bottom edge where it stands on the table, and the drawing surface
   * grows or shrinks with it.
   */
  get height(): number {
    this.revision();
    return this.board?.height ?? 1;
  }
  set height(value: number) {
    if (this.board) setBoardHeightKeepingFoot(this.board, clampSide(value), this.tabletopService.gridSize());
    this.resized();
  }

  /** How far the board is tilted up off the table, in degrees held within the board's pitch limits. */
  get pitch(): number {
    this.revision();
    return this.board?.pitch ?? 0;
  }
  set pitch(value: number) {
    if (this.board) this.board.pitch = clampBoardPitch(value);
    this.settingChanged();
  }

  /** How far the board is turned on the table, in whole degrees. */
  get rotate(): number {
    this.revision();
    return this.board?.rotate ?? 0;
  }
  set rotate(value: number) {
    if (this.board) this.board.rotate = Math.round(Number(value)) % 360;
    this.settingChanged();
  }

  /** How much the board's face shows, as 0 to 100; a change is sent to the room at once. */
  get opacityPercent(): number {
    this.revision();
    return Math.round((this.board?.opacity ?? 1) * 100);
  }
  set opacityPercent(value: number) {
    if (!this.board) return;
    this.board.opacity = Math.min(100, Math.max(0, Math.round(Number(value)))) / 100;
    this.board.update();
    this.settingChanged();
  }

  /**
   * Whether the board itself shows at all.
   *
   * A board with no face is a sheet of marks hanging in the air over the table, which is what
   * anyone wants when the drawing is meant to sit over the map rather than beside it. The
   * face it had is remembered, so turning it back on does not lose the colour it was.
   */
  get isSeeThrough(): boolean {
    this.revision();
    return (this.board?.opacity ?? 1) <= 0;
  }
  set isSeeThrough(value: boolean) {
    if (!this.board) return;
    if (value) {
      this.faceWas = this.board.opacity > 0 ? this.board.opacity : this.faceWas;
      this.opacityPercent = 0;
      return;
    }
    this.opacityPercent = Math.round(this.faceWas * 100);
  }

  private faceWas = 1;

  readonly chequer = CHEQUER_CLASS;

  /** How much of the board's own face shows, which is what the chequer shows through. */
  get faceOpacity(): number {
    this.revision();
    return this.board?.opacity ?? 1;
  }

  /** The colour of the board's face. */
  get boardColor(): string {
    this.revision();
    return this.board?.color ?? '#f4f1e8';
  }
  set boardColor(value: string) {
    if (this.board) this.board.color = value;
    this.settingChanged();
  }

  /** Whether the board casts a shadow on the table. */
  get isDropShadow(): boolean {
    this.revision();
    return this.board?.isDropShadow ?? true;
  }
  set isDropShadow(value: boolean) {
    if (this.board) this.board.isDropShadow = value;
    this.settingChanged();
  }

  /** The sheets the board is made of, topmost first, gathered into their bundles. */
  get groups(): LayerGroup[] {
    this.revision();
    return groupLayers(this.scene);
  }

  /** The board's sheets, topmost first, as the layer drawer counts them. */
  get layers(): MapLayer[] {
    this.revision();
    return [...this.scene.layers].reverse();
  }

  /** The names of the bundles sheets are filed under, offered when filing a sheet in the layer drawer. */
  get groupNames(): string[] {
    this.revision();
    return groupNames(this.scene);
  }

  protected onLayerAction(action: LayerDrawerAction): void {
    switch (action.kind) {
      case 'addSheet':
        this.addSheet();
        break;
      case 'makeGroup':
        this.makeGroup();
        break;
      case 'toggleGroup':
        this.toggleGroup(action.group);
        break;
      case 'renameGroup':
        this.renameGroup(action.group, action.name);
        break;
      case 'chooseLayer':
        this.chooseLayer(action.layer);
        break;
      case 'toggleLayer':
        this.toggleLayer(action.layer);
        break;
      case 'toggleLock':
        this.toggleLock(action.layer);
        break;
      case 'renameLayer':
        this.renameLayer(action.layer, action.name);
        break;
      case 'raiseLayer':
        this.raiseLayer(action.layer);
        break;
      case 'lowerLayer':
        this.lowerLayer(action.layer);
        break;
      case 'setLayerOpacity':
        this.setLayerOpacity(action.layer, action.opacity);
        break;
      case 'fileLayer':
        this.fileLayer(action.layer, action.group);
        break;
      case 'clearSheet':
        this.clearSheet(action.layer);
        break;
      case 'dropLayer':
        this.dropLayer(action.layer);
        break;
      case 'takeOff':
        this.takeOff(action.object);
        break;
    }
  }

  protected toggleGroup(group: LayerGroup): void {
    if (group.name.length < 1) {
      this.toggleLayer(group.layers[0]);
      return;
    }
    showGroup(this.scene, group.name, !group.layers.some((layer) => layer.visible));
    this.touched();
  }

  /** Files the sheet being worked on under a bundle of its own, for the rest to join. */
  protected makeGroup(): void {
    const layer = this.scene.layers.find((entry) => entry.id === this.activeLayerId()) ?? this.scene.layers.at(-1);
    if (!layer) return;
    const taken = new Set(groupNames(this.scene));
    let name = this.t('feature.whiteBoard.editor.groupName');
    for (let n = 2; taken.has(name); n++) name = `${this.t('feature.whiteBoard.editor.groupName')} ${n}`;
    fileUnder(layer, name);
    this.touched();
  }

  protected fileLayer(layer: MapLayer, group: string): void {
    fileUnder(layer, group);
    this.touched();
  }

  protected renameGroup(group: LayerGroup, name: string): void {
    if (group.name.length < 1) return;
    renameGroup(this.scene, group.name, name);
    this.touched();
  }

  /**
   * Names a sheet.
   *
   * A stack of sheets called shape, shape and shape is no better than no stack at all. Cleared
   * back to nothing, a sheet falls back to being named after what it holds.
   */
  protected renameLayer(layer: MapLayer, name: string): void {
    layer.name = name;
    this.touched();
  }

  protected chooseLayer(layer: MapLayer): void {
    this.activeLayerId.set(layer.id);
    this.settingChanged();
  }

  protected addSheet(): void {
    const sheet = createLayer('freehand', '');
    addLayer(this.scene, sheet);
    this.activeLayerId.set(sheet.id);
    this.touched();
  }

  protected toggleLayer(layer: MapLayer): void {
    layer.visible = !layer.visible;
    this.touched();
  }

  /** A sheet held shut keeps what is on it out of reach, so the sheet above can be worked on. */
  protected toggleLock(layer: MapLayer): void {
    layer.locked = !layer.locked;
    if (layer.locked) this.hold(this.held().filter((mark) => sheetHolding(this.scene, mark) !== layer));
    this.touched();
  }

  protected setLayerOpacity(layer: MapLayer, opacity: number): void {
    layer.opacity = Math.min(1, Math.max(0, opacity));
    this.touched();
  }

  protected raiseLayer(layer: MapLayer): void {
    moveLayer(this.scene, layer.id, 1);
    this.touched();
  }

  protected lowerLayer(layer: MapLayer): void {
    moveLayer(this.scene, layer.id, -1);
    this.touched();
  }

  protected dropLayer(layer: MapLayer): void {
    removeLayer(this.scene, layer.id);
    if (this.activeLayerId() === layer.id) this.activeLayerId.set(null);
    this.touched();
  }

  /** Ruled like graph paper, which is what anyone drawing a plan on a board wants under it. */
  get isRuled(): boolean {
    this.revision();
    return this.scene.gridVisible;
  }
  set isRuled(value: boolean) {
    this.scene.gridVisible = value;
    this.touched();
  }

  /** The ruled grid's spacing in board pixels; changing it keeps the board the same size. */
  get spacing(): number {
    this.revision();
    return this.scene.cellPx;
  }
  set spacing(value: number) {
    ruleBoard(this.scene, this.sceneWidth, this.sceneHeight, Number(value));
    this.touched();
  }

  /** Whether the board is locked in place on the table. */
  get isLock(): boolean {
    this.revision();
    return this.board?.isLock ?? false;
  }
  set isLock(value: boolean) {
    if (this.board) this.board.isLock = value;
    this.settingChanged();
  }

  /** What is standing on the board, so it can be taken off without hunting for it. */
  get standing(): TabletopObject[] {
    this.revision();
    const board = this.board;
    if (!board) return [];
    return standingOn(board, [
      ...this.tabletopService.characters,
      ...this.tabletopService.terrains,
      ...this.tabletopService.tableMasks,
      ...this.tabletopService.textNotes,
      ...this.tabletopService.cards,
      ...this.tabletopService.diceSymbols,
    ]);
  }

  protected takeOff(object: TabletopObject): void {
    if (!this.board || !boardSurfaceOf(object)) return;
    detachFromBoard(this.board, object);
    this.settingChanged();
  }

  private settingChanged(): void {
    this.revision.update((value) => value + 1);
  }

  /** A wider board is a wider sheet to write on, so the drawing is given the new room. */
  private resized(): void {
    const board = this.board;
    if (!board) return;
    const grid = this.tabletopService.gridSize();
    ruleBoard(this.scene, board.width * grid, board.height * grid, this.scene.cellPx || grid);
    this.settingChanged();
    this.touched();
  }

  constructor() {
    effect(() => {
      const box = this.wordBoxRef()?.nativeElement;
      if (!this.wantsCaret || !box) return;
      this.wantsCaret = false;
      box.textContent = this.wordsWere;
      box.focus();
      const range = document.createRange();
      range.selectNodeContents(box);
      range.collapse(false);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
    // The canvas measures what it will actually draw, which is the only honest measurement.
    const stopMeasuring = useTextMeasurer((text, fontSize, bold, italic) => {
      const ctx = this.canvasRef()?.nativeElement.getContext('2d');
      if (!ctx) return guessLineWidth(text, fontSize);
      ctx.save();
      ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px sans-serif`;
      const width = ctx.measureText(text).width;
      ctx.restore();
      return width;
    });
    this.destroyRef.onDestroy(() => {
      this.keeper.putDown();
      stopMeasuring();
    });
  }

  /**
   * Points the editor at a board, just after the panel opens.
   *
   * The board's saved drawing is loaded, or a blank sheet of its size when it has none or the drawing
   * cannot be read. That drawing becomes the bottom of the undo stack, and the panel is titled and
   * drawn on the next microtask.
   */
  bindToBoard(board: WhiteBoard): void {
    this.board = board;
    const grid = this.tabletopService.gridSize();
    this.scene =
      (board.scene ? deserializeScene(board.scene) : null) ?? createBoardScene(board.width, board.height, grid);
    // The board as it stands is the bottom of the undo stack. Left unset, the first thing
    // undone would go back to the blank sheet the editor was built with, four squares by three.
    this.history.reset(this.scene);
    this.refreshHistory();
    queueMicrotask(() => {
      this.panelService.title = board.name;
      void this.redraw();
    });
  }

  /** How wide the drawing surface is, in board pixels. */
  get sceneWidth(): number {
    return sceneWidthPx(this.scene);
  }

  /** How tall the drawing surface is, in board pixels. */
  get sceneHeight(): number {
    return sceneHeightPx(this.scene);
  }

  /** Sets down what has been laid out so far, or throws it away if it goes nowhere. */
  protected finishPath(keep = true): void {
    const points = this.laying();
    this.laying.set([]);
    if (!keep || points.length < 2) {
      void this.redraw();
      return;
    }
    const made = pathThrough(points, this.style(), this.curved());
    if (!made) return;
    addShape(shapeLayer(this.scene, this.activeLayerId()), made);
    this.tool.set('select');
    this.hold([{ kind: 'shape', id: made.id }]);
    this.touched();
  }

  protected choose(tool: BoardTool): void {
    if (this.typing()) this.commitText();
    if (this.tool() === 'path' && tool !== 'path') this.finishPath();
    this.tool.set(tool);
    this.panning.set(tool === 'hand');
    if (tool === 'sticker') this.pickSticker();
  }

  /** Fills the panel with what is held, which is how anyone looks closely at one thing. */
  protected zoomToHeld(): void {
    const stage = this.stageRef()?.nativeElement;
    const box = boxAround(this.scene, this.held());
    if (!stage || !box) return;
    this.zoomTo(fitZoom(stage, Math.max(1, box.w), Math.max(1, box.h)));
    stage.scrollLeft = (box.x + box.w / 2) * this.zoom() - stage.clientWidth / 2;
    stage.scrollTop = (box.y + box.h / 2) * this.zoom() - stage.clientHeight / 2;
  }

  /** Sweeps one sheet, which is not the same as sweeping the board and starting again. */
  protected clearSheet(layer: MapLayer): void {
    clearSheet(layer);
    this.hold([]);
    this.touched();
  }

  /** The window over the picture being trimmed, in the picture's own drawn pixels. */
  readonly trimming = signal<MarkBox | null>(null);

  protected startTrim(): void {
    const one = this.selected();
    const box = one?.kind === 'image' ? boxOf(this.scene, one) : null;
    if (!box) return;
    // The window starts as the whole picture, and is pulled inwards from there.
    this.trimming.set({ x: 0, y: 0, w: box.w, h: box.h });
    void this.redraw();
  }

  protected async finishTrim(keep: boolean): Promise<void> {
    const window = this.trimming();
    const one = this.selected();
    this.trimming.set(null);
    if (!keep || !window || one?.kind !== 'image') {
      void this.redraw();
      return;
    }
    const picture = pictureOf(this.scene, one);
    const whole = picture ? await this.shapeOf(picture.imageIdentifier) : undefined;
    cropMark(this.scene, one, window, { w: whole?.x ?? 1, h: whole?.y ?? 1 });
    this.touched();
  }

  protected async untrim(): Promise<void> {
    const one = this.selected();
    if (one?.kind !== 'image') return;
    const picture = pictureOf(this.scene, one);
    const whole = picture ? await this.shapeOf(picture.imageIdentifier) : undefined;
    uncropMark(this.scene, one, { w: whole?.x ?? 1, h: whole?.y ?? 1 });
    this.touched();
  }

  protected isTrimmed(): boolean {
    this.revision();
    const one = this.selected();
    return one?.kind === 'image' && !!pictureOf(this.scene, one)?.crop;
  }

  protected flipHeld(way: 'across' | 'down'): void {
    for (const mark of this.held()) flipMark(this.scene, mark, way);
    this.touched();
  }

  protected fadeHeld(opacity: number): void {
    for (const mark of this.held()) fadeMark(this.scene, mark, opacity);
    this.touched();
  }

  /** How solid the picture in hand is, so the slider knows where to sit. */
  protected heldOpacity(): number {
    this.revision();
    const one = this.selected();
    if (one?.kind !== 'image') return 1;
    for (const layer of this.scene.layers) {
      if (layer.kind !== 'image') continue;
      const item = layer.items.find((entry) => entry.id === one.id);
      if (item) return Number.isFinite(item.opacity) ? item.opacity : 1;
    }
    return 1;
  }

  protected holdsPicture(): boolean {
    return this.held().some((mark) => mark.kind === 'image');
  }

  /** Where on the board a pointer landed, whatever size the canvas is being shown at. */
  private pointOf(event: PointerEvent): BoardPoint {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const box = canvas.getBoundingClientRect();
    const scale = box.width / this.sceneWidth || 1;
    const at = { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
    // Snapped only where the reader asked for it, and never for a pen, which would step.
    if (!this.snapping() || this.gesture.isPenning()) return at;
    return snapTo(at, this.scene.cellPx);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.board) return;
    // The hand, the middle button, or the space bar held down all slide the sheet rather
    // than marking it. On a touch screen the hand is the only one of the three there is.
    if (event.button === 1 || this.panning()) {
      this.panFrom = { x: event.clientX, y: event.clientY };
      this.sliding.set(true);
      event.preventDefault();
      return;
    }
    // Words being typed are written down before the click is dealt with, so that opening a
    // second box cannot be undone by the first one letting go of the caret afterwards.
    if (this.typing()) {
      this.commitText();
      return;
    }
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    const at = this.pointOf(event);

    this.gesture.begin(at, event.shiftKey);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.board) return;
    if (this.panFrom) {
      this.slideBy(event.clientX - this.panFrom.x, event.clientY - this.panFrom.y);
      this.panFrom = { x: event.clientX, y: event.clientY };
      return;
    }
    this.gesture.drag(this.pointOf(event), event.buttons > 0);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.board) return;
    if (this.panFrom) {
      this.panFrom = null;
      this.sliding.set(false);
      return;
    }
    this.gesture.end(this.pointOf(event));
  }

  private style(): MarkStyle {
    return {
      color: this.color(),
      width: this.strokeWidth(),
      fontSize: this.fontSize(),
      fillColor: this.fillColor(),
      dash: this.dash(),
      shadow: this.tool() === 'text' || this.tool() === 'note' ? this.wordShadow() : this.shadowed(),
      outline: this.outlineColor(),
      outlineWidth: this.outlineWidth(),
      underline: this.underline(),
      strike: this.strike(),
    };
  }

  private wordStyle(): TextItem {
    return { bold: this.bold(), italic: this.italic(), align: this.align() } as TextItem;
  }

  private hold(marks: MarkRef[]): void {
    this.held.set(marks);
    this.selected.set(marks.length === 1 ? marks[0] : null);
    this.settingChanged();
  }

  /** A handle has to stay big enough to hit however far the sheet is zoomed out. */
  private handleSlack(): number {
    return gripAt(this.zoom());
  }

  protected removeSelected(): void {
    const marks = this.held();
    if (marks.length < 1) return;
    for (const mark of marks) removeMark(this.scene, mark);
    this.hold([]);
    this.touched();
  }

  protected alignHeld(edge: AlignEdge): void {
    alignMarks(this.scene, this.held(), edge);
    this.touched();
  }

  protected centreHeld(way: 'across' | 'down' | 'both'): void {
    centreOnSheet(this.scene, this.held(), way);
    this.touched();
  }

  protected spreadHeld(along: 'x' | 'y'): void {
    spreadMarks(this.scene, this.held(), along);
    this.touched();
  }

  protected holdEverything(): void {
    this.hold(marksWithin(this.scene, { x: -1e6, y: -1e6, w: 2e6, h: 2e6 }));
  }

  /** Copies set down a little off the first, and already in hand, since that is what is next. */
  protected duplicateSelected(): void {
    const made = this.held()
      .map((mark) => copyMark(this.scene, mark, DUPLICATE_OFFSET))
      .filter((mark): mark is MarkRef => mark !== null);
    if (made.length > 0) this.hold(made);
    this.touched();
  }

  protected copySelected(): void {
    this.clipboard = this.held();
  }

  protected pasteCopied(): void {
    const made = this.clipboard
      .map((mark) => copyMark(this.scene, mark, DUPLICATE_OFFSET))
      .filter((mark): mark is MarkRef => mark !== null);
    if (made.length < 1) return;
    this.hold(made);
    this.touched();
  }

  protected bringForward(): void {
    for (const mark of this.held()) restack(this.scene, mark, 1);
    this.touched();
  }

  protected sendBackward(): void {
    for (const mark of this.held()) restack(this.scene, mark, -1);
    this.touched();
  }

  protected turnSelected(degrees: number): void {
    for (const mark of this.held()) turnMark(this.scene, mark, degrees);
    this.touched();
  }

  protected undo(): void {
    const back = this.history.undo();
    if (!back) return;
    this.scene = back;
    this.selected.set(null);
    this.afterHistory();
  }

  protected redo(): void {
    const forward = this.history.redo();
    if (!forward) return;
    this.scene = forward;
    this.selected.set(null);
    this.afterHistory();
  }

  private afterHistory(): void {
    this.refreshHistory();
    this.settingChanged();
    void this.redraw();
    this.keeper.keepPicture();
  }

  private refreshHistory(): void {
    this.canUndo.set(this.history.canUndo());
    this.canRedo.set(this.history.canRedo());
  }

  readonly panning = signal(false);
  /** Whether the sheet is being slid this instant, which is what changes the hand's shape. */
  readonly sliding = signal(false);
  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stage');

  private slideBy(dx: number, dy: number): void {
    const stage = this.stageRef()?.nativeElement;
    if (!stage) return;
    stage.scrollLeft -= dx;
    stage.scrollTop -= dy;
  }

  protected onKeyUp(event: KeyboardEvent): void {
    if (isTypingKey(event.target, event.isComposing)) return;
    this.keepingShape = event.shiftKey;
    // Letting go of the space bar gives the sheet back to whatever tool was chosen, unless
    // the chosen tool is the hand, which does not answer to the space bar at all.
    if (event.key === ' ') this.panning.set(this.tool() === 'hand');
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (isTypingKey(event.target, event.isComposing)) return;

    this.keepingShape = event.shiftKey;
    const action = boardKeyDown(event.key, {
      chord: event.ctrlKey || event.metaKey,
      shift: event.shiftKey,
      laying: this.laying().length > 0,
    });
    if (!action) return;
    event.preventDefault();
    this.run(action);
  }

  private run(action: BoardKeyAction): void {
    switch (action.command) {
      case 'panStart':
        this.panning.set(true);
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'finishPath':
        this.finishPath(true);
        break;
      case 'dropPath':
        this.finishPath(false);
        break;
      case 'deleteSelection':
        this.removeSelected();
        break;
      case 'zoomReset':
        this.zoomTo(1);
        break;
      case 'zoomIn':
        this.zoomIn();
        break;
      case 'zoomOut':
        this.zoomOut();
        break;
      case 'zoomFit':
        this.zoomToFit();
        break;
      case 'selectAll':
        this.holdEverything();
        break;
      case 'duplicate':
        this.duplicateSelected();
        break;
      case 'copy':
        this.copySelected();
        break;
      case 'paste':
        this.pasteCopied();
        break;
      case 'bringForward':
        this.bringForward();
        break;
      case 'sendBackward':
        this.sendBackward();
        break;
      case 'pickTool':
        this.choose(action.tool);
        break;
    }
  }

  /** Words already written are typed over rather than written again. */
  protected onDoubleClick(event: PointerEvent): void {
    if (this.tool() === 'path') {
      this.finishPath();
      return;
    }
    const at = this.pointOf(event);
    const held = this.selected();
    if (held && jointedShape(this.scene, held) && addJoint(this.scene, held, at, this.handleSlack()) !== null) {
      this.touched();
      return;
    }
    const mark = markUnder(this.scene, at);
    const words = mark ? wordsOf(this.scene, mark) : null;
    if (!words) return;
    // The words already written are picked up along with how they were written, so retyping
    // them does not quietly restyle them.
    this.fontSize.set(words.fontSize);
    this.color.set(words.color);
    this.bold.set(words.bold);
    this.italic.set(words.italic);
    this.underline.set(!!words.underline);
    this.strike.set(!!words.strike);
    this.wordShadow.set(!!words.shadow);
    this.outlineWidth.set(words.outline ? Math.round((words.outline.width / words.fontSize) * 100) : 0);
    if (words.outline) this.outlineColor.set(words.outline.color);
    this.retyping = mark;
    this.startTyping({ x: words.x, y: words.y }, words.text);
  }

  /** Puts the box on the sheet and the caret in it, since nobody opens one meaning to wait. */
  private startTyping(at: BoardPoint, words: string): void {
    this.typedText = words;
    this.wordsWere = words;
    this.wantsCaret = true;
    this.typing.set(at);
    void this.redraw();
  }

  /** The decoration the words will carry, shown on the box they are being typed into. */
  protected typedStroke(): string {
    const line = outlineFor(this.style());
    return line ? `${line.width * this.zoom()}px ${line.color}` : '';
  }

  protected typedRules(): string {
    const rules = [this.underline() ? 'underline' : '', this.strike() ? 'line-through' : ''].filter(Boolean);
    return rules.length > 0 ? rules.join(' ') : 'none';
  }

  protected typedShadow(): string {
    if (!this.wordShadow()) return 'none';
    const shadow = MARK_SHADOW;
    const zoom = this.zoom();
    return `${shadow.offsetX * zoom}px ${shadow.offsetY * zoom}px ${shadow.blur * zoom}px ${shadow.color}`;
  }

  protected onTypedInput(event: Event): void {
    this.typedText = (event.target as HTMLElement).innerText;
  }

  /**
   * The keys the word box answers to itself.
   *
   * Escape and enter both mean something to an input method while it is composing, so the box
   * hears them only once the letters have been settled on.
   */
  protected onTypedKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dropTyping();
      return;
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      event.stopPropagation();
      this.commitText();
    }
  }

  /** Thrown away rather than written down, which is what escape means everywhere. */
  private dropTyping(): void {
    this.typing.set(null);
    this.typedText = '';
    this.retyping = null;
    void this.redraw();
  }

  protected commitText(): void {
    const at = this.typing();
    const words = this.typedText.replace(/\s+$/, '');
    const over = this.retyping;
    this.typing.set(null);
    this.typedText = '';
    this.retyping = null;

    if (over) {
      const sheet = sheetHolding(this.scene, over);
      if (words.length < 1) removeMark(this.scene, over);
      else if (sheet?.kind === 'text') updateText(sheet, over.id, { text: words });
      this.touched();
      return;
    }
    if (!at || words.length < 1) return;
    const marks = this.wordStyle();
    const written = {
      ...(this.tool() === 'note'
        ? noteAt(at, words, this.style(), this.noteColor())
        : wordsAt(at, words, this.style())),
      bold: marks.bold,
      italic: marks.italic,
      align: marks.align,
    };
    addText(textLayer(this.scene, this.activeLayerId()), written);
    this.tool.set('select');
    this.selected.set({ kind: 'text', id: written.id });
    this.touched();
  }

  /**
   * A picture on the clipboard is stuck straight onto the sheet.
   *
   * Cropping a screenshot and pressing the two keys is how a picture gets into a deck; going
   * out to a file, saving it, and coming back through a picker is not.
   */
  protected async onPaste(event: ClipboardEvent): Promise<void> {
    const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'));
    if (files.length < 1) return;
    event.preventDefault();
    const stuck: MarkRef[] = [];
    for (const file of files) {
      const image = await this.imageStorage.addAsync(file);
      const made = stickerAt(
        { x: this.sceneWidth / 2, y: this.sceneHeight / 2 },
        image.identifier,
        STICKER_SIZE,
        await this.shapeOf(image.identifier),
        this.sheetSize()
      );
      addImage(imageLayer(this.scene, this.activeLayerId()), made);
      stuck.push({ kind: 'image', id: made.id });
    }
    // Whatever has just been stuck on is what wants moving next, so it comes up already held.
    this.tool.set('select');
    this.hold(stuck);
    this.touched();
  }

  /** The board as a picture, for anyone who wants it in a deck rather than on the table. */
  protected async saveAsPicture(): Promise<void> {
    const sheet = document.createElement('canvas');
    sheet.width = this.sceneWidth;
    sheet.height = this.sceneHeight;
    const ctx = sheet.getContext('2d');
    if (!ctx) return;
    // The sheet under the marks is white, as it is on the board, not the transparency of a canvas.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    await this.paintMarks(ctx, false);
    const blob = await new Promise<Blob | null>((keep) => sheet.toBlob(keep, 'image/png'));
    if (!blob) return;
    downloadBlob(blob, `${this.board?.name || 'whiteboard'}.png`);
  }

  private pickSticker(): void {
    this.modalService.open<string>(FileSelecterComponent, { isAllowedEmpty: true }).then(async (identifier) => {
      if (!identifier) return;
      const at = { x: this.sceneWidth / 2, y: this.sceneHeight / 2 };
      const made = stickerAt(at, identifier, STICKER_SIZE, await this.shapeOf(identifier), this.sheetSize());
      addImage(imageLayer(this.scene, this.activeLayerId()), made);
      this.tool.set('select');
      this.hold([{ kind: 'image', id: made.id }]);
      this.touched();
    });
  }

  private sheetSize(): NaturalSize {
    return { w: this.sceneWidth, h: this.sceneHeight };
  }

  /** How wide and how tall the picture actually is, so it is not stuck up squashed. */
  private async shapeOf(identifier: string): Promise<BoardPoint | undefined> {
    const url = this.imageStorage.get(identifier)?.url;
    if (!url) return undefined;
    await warmRasterImages([url]);
    const image = getRasterImage(url);
    return image ? { x: image.naturalWidth, y: image.naturalHeight } : undefined;
  }

  /** The guide lines pulled onto the board from its rulers, empty when there are none. */
  get guides(): SceneGuideLine[] {
    this.revision();
    return this.scene.guides ?? [];
  }

  /** A guide is pulled off a ruler onto the sheet, and pulled back onto the ruler to be rid of it. */
  protected startGuide(axis: 'x' | 'y', event: PointerEvent): void {
    const at = this.pointOf(event);
    const guide = newGuide(axis, axis === 'x' ? at.x : at.y);
    this.scene.guides = [...this.guides, guide];
    this.gesture.dragGuide(guide);
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    void this.redraw();
  }

  protected dropGuide(guide: SceneGuideLine): void {
    this.scene.guides = this.guides.filter((entry) => entry.id !== guide.id);
    this.touched();
  }

  protected clearGuides(): void {
    this.scene.guides = [];
    this.touched();
  }

  protected clearBoard(): void {
    this.scene.layers = [];
    this.touched();
  }

  /**
   * Everything on the sheet, onto whichever canvas is asked for.
   *
   * A picture that moves is left out of the one the board wears, because the board hangs
   * that one over the top where it can go on moving. Every other canvas - the sheet being
   * drawn on, a picture saved to a file - takes the lot, standing still.
   */
  private async paintMarks(ctx: CanvasRenderingContext2D, ruled: boolean, hangingLeftOut = false): Promise<void> {
    const items = this.scene.layers
      .filter((layer): layer is ImageLayer => layer.kind === 'image')
      .flatMap((layer) => layer.items);
    const urls = items
      .map((item) => this.imageStorage.get(item.imageIdentifier)?.url)
      .filter((url): url is string => !!url);
    if (urls.length > 0) await warmRasterImages(urls);

    // What is left out has to be exactly what the board hangs, so the reading is waited for
    // here rather than asked about again below, where a picture still being read answers "still".
    const moving = new Set<string>();
    if (hangingLeftOut) {
      const read = await Promise.all(
        items.map(async (item) => [item.imageIdentifier, await this.animatedImage.probe(item.imageIdentifier)] as const)
      );
      for (const [identifier, animated] of read) if (animated) moving.add(identifier);
    }
    const hung = hangablePictureIds(hangingLeftOut ? this.scene : null, (identifier) => moving.has(identifier));

    renderScene(
      ctx,
      this.scene,
      {
        texturePattern: () => null,
        stampImage: () => null,
        rasterImage: (item) => {
          if (hung.has(item.id)) return null;
          const url = this.imageStorage.get(item.imageIdentifier)?.url;
          return url ? getRasterImage(url) : null;
        },
      },
      // Words being typed over are shown in the box, so drawing them underneath as well
      // would leave the old and the new overlapping.
      { drawGrid: ruled, hideTextId: this.retyping?.kind === 'text' ? this.retyping.id : undefined }
    );
  }

  /**
   * Draws the board as it stands, plus the stroke still under the pen.
   *
   * The ruling, the guides and the hold are for whoever is drawing, not part of what is
   * drawn, so a bare pass leaves them all off when the picture the board wears is taken.
   * Whether the paper is ruled says nothing about whether any of the rest is wanted.
   */
  private async redraw(pending?: number[], bare = false, hangingLeftOut = false): Promise<void> {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return;
    canvas.width = this.sceneWidth;
    canvas.height = this.sceneHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wants = overlaysWanted(bare, this.scene.gridVisible);
    await this.paintMarks(ctx, wants.grid, hangingLeftOut);
    if (!wants.helpers) {
      if (pending && pending.length > 3) drawFreehand(ctx, pending, this.ink());
      return;
    }

    const zoom = this.zoom();
    const bendable = this.selected();
    const jointed = bendable ? jointedShape(this.scene, bendable) : null;
    const box = jointed ? null : boxAround(this.scene, this.held());
    const window = this.trimming();
    if (box && window) drawTrimWindow(ctx, box, window, zoom);
    else if (box) drawHold(ctx, box, zoom);
    if (jointed) drawJoints(ctx, jointed.points, zoom);

    const standing = this.guiding() ? sheetGuides(this.scene) : [];
    const laid: SnapGuide[] = this.guides.map((guide) => ({
      axis: guide.axis,
      at: guide.at,
      from: 0,
      to: guide.axis === 'x' ? this.sceneHeight : this.sceneWidth,
    }));
    drawGuides(ctx, [...standing, ...laid], 'rgba(70,130,220,0.35)', zoom);
    drawGuides(ctx, this.showing(), '#e0457b', zoom);

    const laying = this.laying();
    if (laying.length > 0) drawLaying(ctx, laying, this.gesture.hover, this.ink());
    const band = this.gesture.band();
    if (band) drawBand(ctx, band, zoom);
    const dragging = this.gesture.pendingMark();
    if (dragging) drawPending(ctx, dragging, this.ink());
    if (pending && pending.length > 3) drawFreehand(ctx, pending, this.ink());
  }

  private ink(): Ink {
    return { color: this.color(), width: this.strokeWidth() };
  }

  /** Kept once the drawing settles, since a single stroke is a hundred changes on its own. */
  private touched(): void {
    this.history.commit(this.scene);
    this.refreshHistory();
    void this.redraw();
    this.keeper.keepPicture();
  }
}

function clampSide(value: number): number {
  const side = Math.round(Number(value));
  if (!Number.isFinite(side)) return MIN_SIDE;
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, side));
}
