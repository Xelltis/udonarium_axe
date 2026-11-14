import { NgClass } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { closeWhenOffTheTable } from '@axe/application/ui/close-when-off-the-table';
import { ModalService } from '@axe/application/ui/modal.service';
import { PanelService } from '@axe/application/ui/panel.service';
import { ShortcutScopeService } from '@axe/application/ui/shortcut-scope.service';
import { ViewportService } from '@axe/application/ui/viewport.service';
import { capturePointer } from '@axe/core/input/pointer-capture';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { clamp } from '@axe/core/util/clamp';
import { downloadBlob } from '@axe/core/util/download-blob';
import { ShapeGeneratorKind } from '@axe/domain/map-editor/editor-tool';
import { SceneHistory } from '@axe/domain/map-editor/history';
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
} from '@axe/domain/map-editor/scene';
import {
  addImage,
  addLayer,
  addShape,
  addText,
  moveLayer,
  removeLayer,
  updateText,
} from '@axe/domain/map-editor/scene-ops';
import { deserializeScene } from '@axe/domain/map-editor/serialize';
import { boardSurfaceOf, TabletopObject } from '@axe/domain/tabletop/tabletop-object';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { AnimatedImageService } from '@axe/features/tabletop/white-board/animated-image.service';
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
import { BoardSettings } from '@axe/features/tabletop/white-board/white-board-settings';
import { BoardKeyAction, boardKeyDown } from '@axe/features/tabletop/white-board/white-board-shortcuts';
import { BoardStage } from '@axe/features/tabletop/white-board/white-board-stage';
import {
  WhiteBoardWordBoxComponent,
  WordBoxLook,
} from '@axe/features/tabletop/white-board/white-board-word-box.component';
import { getRasterImage, warmRasterImages } from '@axe/infrastructure/map-editor/raster-image';
import { renderScene } from '@axe/infrastructure/map-editor/render-scene';
import { FileSelecterComponent } from '@axe/ui/components/file-selecter/file-selecter.component';
import { KeepTouchDirective } from '@axe/ui/directives/keep-touch.directive';
import { TranslocoModule } from '@jsverse/transloco';

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

/** How far a copy is set down from what it was copied off, so both can be seen. */
const DUPLICATE_OFFSET = 16;

/** How far one press of the turn buttons takes a mark round. */
const TURN_STEP = 15;

/** The kinds of piece that can stand on a board, which the layer drawer lists so they can be taken off. */
const STANDING_ALIASES = ['character', 'terrain', 'table-mask', 'text-note', 'card', 'dice-symbol'] as const;

@Component({
  selector: 'white-board-editor',
  templateUrl: './white-board-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslocoModule,
    NgClass,
    WhiteBoardLayerDrawerComponent,
    WhiteBoardWordBoxComponent,
    KeepTouchDirective,
  ],
})
export class WhiteBoardEditorComponent {
  private readonly modalService = inject(ModalService);
  private readonly imageStorage = inject(ImageStorage);
  private readonly animatedImage = inject(AnimatedImageService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly tabletopService = inject(TabletopService);
  private readonly panelService = inject(PanelService);
  private readonly objectChange = inject(ObjectChangeService);
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
  readonly turnStep = TURN_STEP;
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
  /** The lines shown this instant, which last only as long as the drag that raised them. */
  readonly showing = signal<SnapGuide[]>([]);
  readonly activeLayerId = signal<string | null>(null);

  /** Where the words being typed start on the sheet, or null while none are. */
  protected readonly typing = signal<BoardPoint | null>(null);
  /** What the word box holds, as it last reported. */
  protected typedText = '';
  /** The words the word box opened with: those being typed over, or none. */
  protected wordsWere = '';

  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  /** Everything held. One mark is the common case; a dragged out box takes several. */
  readonly held = signal<MarkRef[]>([]);
  /** The one mark held, which is what can be retyped, trimmed or bent; nothing while several or none are. */
  readonly selected = computed<MarkRef | null>(() => {
    const held = this.held();
    return held.length === 1 ? held[0] : null;
  });

  private history = new SceneHistory(createBoardScene(4, 3, 50));
  private clipboard: MarkRef[] = [];
  private keepingShape = false;
  private retyping: MarkRef | null = null;
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
    guides: () => this.scene.guides ?? [],
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

  /** Bumped by hand, since neither the board's own values nor the drawing are signals. */
  protected readonly revision = signal(0);

  private readonly stageRef = viewChild<ElementRef<HTMLElement>>('stageBox');

  /** How the sheet is shown: its zoom, its scroll, its rulers and whether it is being slid. */
  protected readonly stage = new BoardStage({
    element: () => this.stageRef()?.nativeElement ?? null,
    sheetWidth: () => this.sceneWidth(),
    sheetHeight: () => this.sceneHeight(),
    afterDraw: (then) => afterNextRender(then, { injector: this.injector }),
  });

  /** The board's own settings, as the form in the side column reads and writes them. */
  protected readonly settings = new BoardSettings({
    board: () => this.board,
    gridSize: () => this.tabletopService.gridSize(),
    track: () => void this.revision(),
    retitle: (name) => (this.panelService.title = name),
    changed: () => this.settingChanged(),
    resized: () => this.resized(),
  });

  /** The sheets the board is made of, topmost first, gathered into their bundles. */
  protected readonly groups = computed<LayerGroup[]>(() => {
    this.revision();
    return groupLayers(this.scene);
  });

  /** How many sheets the board has, as the layer drawer counts them. */
  protected readonly layerCount = computed(() => {
    this.revision();
    return this.scene.layers.length;
  });

  /** The names of the bundles sheets are filed under, offered when filing a sheet in the layer drawer. */
  protected readonly groupNames = computed<string[]>(() => {
    this.revision();
    return groupNames(this.scene);
  });

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
    layer.opacity = clamp(opacity, 0, 1);
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
    ruleBoard(this.scene, this.sceneWidth(), this.sceneHeight(), Number(value));
    this.touched();
  }

  /** What is standing on the board, so it can be taken off without hunting for it. */
  protected readonly standing = computed<TabletopObject[]>(() => {
    this.revision();
    for (const alias of STANDING_ALIASES) this.objectChange.collectionOf(alias)();
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
  });

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
    // Made a guest meanwhile, the seat may no longer write what this panel writes.
    closeWhenOffTheTable();
    inject(ShortcutScopeService).hold('whiteBoard', this.destroyRef);
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
    this.settingChanged();
    queueMicrotask(() => {
      this.panelService.title = board.name;
      void this.redraw();
    });
  }

  /** How wide the drawing surface is, in board pixels. */
  readonly sceneWidth = computed(() => {
    this.revision();
    return sceneWidthPx(this.scene);
  });

  /** How tall the drawing surface is, in board pixels. */
  readonly sceneHeight = computed(() => {
    this.revision();
    return sceneHeightPx(this.scene);
  });

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
    this.stage.panning.set(tool === 'hand');
    if (tool === 'sticker') this.pickSticker();
  }

  /** Fills the panel with what is held, which is how anyone looks closely at one thing. */
  protected zoomToHeld(): void {
    const box = boxAround(this.scene, this.held());
    if (box) this.stage.zoomOnto(box);
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

  /** Whether the one picture held has been trimmed, which is what offers to put it back whole. */
  protected readonly isTrimmed = computed(() => {
    this.revision();
    const one = this.selected();
    return one?.kind === 'image' && !!pictureOf(this.scene, one)?.crop;
  });

  protected flipHeld(way: 'across' | 'down'): void {
    for (const mark of this.held()) flipMark(this.scene, mark, way);
    this.touched();
  }

  protected fadeHeld(opacity: number): void {
    for (const mark of this.held()) fadeMark(this.scene, mark, opacity);
    this.touched();
  }

  /** How solid the picture in hand is, so the slider knows where to sit. */
  protected readonly heldOpacity = computed(() => {
    this.revision();
    const one = this.selected();
    const opacity = one ? pictureOf(this.scene, one)?.opacity : undefined;
    return opacity !== undefined && Number.isFinite(opacity) ? opacity : 1;
  });

  protected readonly holdsPicture = computed(() => this.held().some((mark) => mark.kind === 'image'));

  /** Where on the board a pointer landed, whatever size the canvas is being shown at. */
  private pointOf(event: MouseEvent): BoardPoint {
    const canvas = this.canvasRef()?.nativeElement;
    if (!canvas) return { x: 0, y: 0 };
    const box = canvas.getBoundingClientRect();
    const scale = box.width / this.sceneWidth() || 1;
    const at = { x: (event.clientX - box.left) / scale, y: (event.clientY - box.top) / scale };
    // Snapped only where the reader asked for it, and never for a pen, which would step.
    if (!this.snapping() || this.gesture.isPenning()) return at;
    return snapTo(at, this.scene.cellPx);
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.board) return;
    // The hand, the middle button, or the space bar held down all slide the sheet rather
    // than marking it. On a touch screen the hand is the only one of the three there is.
    if (event.button === 1 || this.stage.panning()) {
      this.stage.startSlide(event);
      event.preventDefault();
      return;
    }
    // Words being typed are written down before the click is dealt with, so that opening a
    // second box cannot be undone by the first one letting go of the caret afterwards.
    if (this.typing()) {
      this.commitText();
      return;
    }
    capturePointer(event.target, event.pointerId);
    const at = this.pointOf(event);

    this.gesture.begin(at, event.shiftKey);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.board) return;
    if (this.stage.slide(event)) return;
    this.gesture.drag(this.pointOf(event), event.buttons > 0);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.board) return;
    if (this.stage.endSlide()) return;
    this.gesture.end(this.pointOf(event));
  }

  private readonly style = computed<MarkStyle>(() => {
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
  });

  /** How the words being typed will look once written, for the box they are typed into. */
  protected readonly wordLook = computed<WordBoxLook>(() => ({
    fontSize: this.fontSize(),
    color: this.color(),
    bold: this.bold(),
    italic: this.italic(),
    underline: this.underline(),
    strike: this.strike(),
    shadow: this.wordShadow(),
    outline: outlineFor(this.style()),
  }));

  private wordStyle(): Pick<TextItem, 'bold' | 'italic' | 'align'> {
    return { bold: this.bold(), italic: this.italic(), align: this.align() };
  }

  private hold(marks: MarkRef[]): void {
    this.held.set(marks);
    this.settingChanged();
  }

  /** A handle has to stay big enough to hit however far the sheet is zoomed out. */
  private handleSlack(): number {
    return gripAt(this.stage.zoom());
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
    this.held.set([]);
    this.afterHistory();
  }

  protected redo(): void {
    const forward = this.history.redo();
    if (!forward) return;
    this.scene = forward;
    this.held.set([]);
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

  protected onKeyUp(event: KeyboardEvent): void {
    if (isTypingKey(event.target, event.isComposing)) return;
    this.keepingShape = event.shiftKey;
    // Letting go of the space bar gives the sheet back to whatever tool was chosen, unless
    // the chosen tool is the hand, which does not answer to the space bar at all.
    if (event.key === ' ') this.stage.panning.set(this.tool() === 'hand');
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
        this.stage.panning.set(true);
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
        this.stage.zoomTo(1);
        break;
      case 'zoomIn':
        this.stage.zoomIn();
        break;
      case 'zoomOut':
        this.stage.zoomOut();
        break;
      case 'zoomFit':
        this.stage.zoomToFit();
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
  protected onDoubleClick(event: MouseEvent): void {
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
    this.typing.set(at);
    void this.redraw();
  }

  /** Thrown away rather than written down, which is what escape means everywhere. */
  protected dropTyping(): void {
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
    this.hold([{ kind: 'text', id: written.id }]);
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
      const image = await this.imageStorage.addAsync(file, { putBack: true });
      if (!image) continue;
      const made = stickerAt(
        { x: this.sceneWidth() / 2, y: this.sceneHeight() / 2 },
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
    sheet.width = this.sceneWidth();
    sheet.height = this.sceneHeight();
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
      const at = { x: this.sceneWidth() / 2, y: this.sceneHeight() / 2 };
      const made = stickerAt(at, identifier, STICKER_SIZE, await this.shapeOf(identifier), this.sheetSize());
      addImage(imageLayer(this.scene, this.activeLayerId()), made);
      this.tool.set('select');
      this.hold([{ kind: 'image', id: made.id }]);
      this.touched();
    });
  }

  private sheetSize(): NaturalSize {
    return { w: this.sceneWidth(), h: this.sceneHeight() };
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
  protected readonly guides = computed<SceneGuideLine[]>(() => {
    this.revision();
    return this.scene.guides ?? [];
  });

  /** A guide is pulled off a ruler onto the sheet, and pulled back onto the ruler to be rid of it. */
  protected startGuide(axis: 'x' | 'y', event: PointerEvent): void {
    const at = this.pointOf(event);
    const guide = newGuide(axis, axis === 'x' ? at.x : at.y);
    this.scene.guides = [...(this.scene.guides ?? []), guide];
    this.gesture.dragGuide(guide);
    capturePointer(event.target, event.pointerId);
    this.settingChanged();
    void this.redraw();
  }

  protected dropGuide(guide: SceneGuideLine): void {
    this.scene.guides = (this.scene.guides ?? []).filter((entry) => entry.id !== guide.id);
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
    canvas.width = this.sceneWidth();
    canvas.height = this.sceneHeight();
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const wants = overlaysWanted(bare, this.scene.gridVisible);
    await this.paintMarks(ctx, wants.grid, hangingLeftOut);
    if (!wants.helpers) {
      if (pending && pending.length > 3) drawFreehand(ctx, pending, this.ink());
      return;
    }

    const zoom = this.stage.zoom();
    const bendable = this.selected();
    const jointed = bendable ? jointedShape(this.scene, bendable) : null;
    const box = jointed ? null : boxAround(this.scene, this.held());
    const window = this.trimming();
    if (box && window) drawTrimWindow(ctx, box, window, zoom);
    else if (box) drawHold(ctx, box, zoom);
    if (jointed) drawJoints(ctx, jointed.points, zoom);

    const standing = this.guiding() ? sheetGuides(this.scene) : [];
    const laid: SnapGuide[] = (this.scene.guides ?? []).map((guide) => ({
      axis: guide.axis,
      at: guide.at,
      from: 0,
      to: guide.axis === 'x' ? this.sceneHeight() : this.sceneWidth(),
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
    this.settingChanged();
    void this.redraw();
    this.keeper.keepPicture();
  }
}
