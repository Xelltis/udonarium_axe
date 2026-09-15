export type { EditorTool, LineKind, ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  FunctionSpec,
  lookKey,
  MapFunctionRole,
} from '@axe/domain/tabletop/function-paint';
import { GridType } from '@axe/domain/tabletop/game-table';
import { StampCategory } from '@axe/features/map-editor/assets/stamp-types';
import { sampleCurvePoints } from '@axe/features/map-editor/model/curve-geometry';
import type { EditorTool, LineKind, ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import { cellCenter, pointToCell } from '@axe/features/map-editor/model/grid-cells';
import { SceneHistory } from '@axe/features/map-editor/model/history';
import {
  CellLayer,
  createLayer,
  createScene,
  FillStyle,
  FreehandLayer,
  FreehandStroke,
  FunctionLayer,
  ImageItem,
  ImageLayer,
  LayerKind,
  MapLayer,
  MapScene,
  newId,
  ShapeItem,
  ShapeKind,
  ShapeLayer,
  ShapeShadow,
  StampItem,
  StampLayer,
  StrokeDash,
  StrokeStyle,
  TextAlign,
  TextItem,
  TextLayer,
} from '@axe/features/map-editor/model/scene';
import {
  imageBox,
  pointToPolylineDistance,
  pointToSegmentDistance,
  shapeBox,
  strokeSlack,
  textBox,
  within,
} from '@axe/features/map-editor/model/scene-geometry';
import {
  addImage,
  addLayer,
  addShape,
  addStamp,
  addStroke,
  addText,
  eraseCell,
  eraseFunctionCell,
  eraseStrokeAtPoint,
  floodFill,
  removeImage,
  removeShape,
  removeStamp,
  removeStroke,
  removeText,
  resizeScene,
  setCell,
  setFunctionCell,
  updateImage,
  updateStamp,
  updateStroke,
  updateText,
} from '@axe/features/map-editor/model/scene-ops';

export interface Selection {
  layerId: string;
  itemId: string;
}

@Injectable()
export class MapEditorState {
  private scene: MapScene = createScene();
  private history = new SceneHistory(this.scene);
  private layerCounter = 0;

  private readonly tick = signal(0);
  readonly sceneTick = this.tick.asReadonly();
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  readonly tool = signal<EditorTool>('select');
  readonly activeLayerId = signal<string | null>(null);

  readonly functionRole = signal<MapFunctionRole>(DEFAULT_FUNCTION_ROLE);
  readonly functionSpec = signal<FunctionSpec>({ ...DEFAULT_FUNCTION_SPEC });

  readonly fillMode = signal<'solid' | 'texture'>('solid');
  readonly solidColor = signal('#88aa66');
  readonly textureId = signal<string>('steppe');
  readonly textureScale = signal(1);
  readonly textureRotation = signal(0);

  readonly shapeKind = signal<ShapeGeneratorKind>('rect');
  readonly lineKind = signal<LineKind>('straight');

  readonly strokeColor = signal('#1a1a1a');
  readonly strokeWidth = signal(3);
  readonly strokeDash = signal<StrokeDash>('solid');
  readonly strokeFillMode = signal<'color' | 'texture'>('color');

  readonly shadowEnabled = signal(false);
  readonly shadowColor = signal('#00000080');
  readonly shadowBlur = signal(6);
  readonly shadowOffsetX = signal(2);
  readonly shadowOffsetY = signal(2);

  readonly stampCategory = signal<StampCategory>('door');
  readonly stampId = signal<string | null>(null);
  readonly stampSize = signal(64);
  readonly stampRotation = signal(0);
  readonly stampFlipX = signal(false);
  readonly stampFlipY = signal(false);
  readonly stampColor = signal<string | null>(null);

  readonly freehandColor = signal('#1a1a1a');
  readonly freehandWidth = signal(4);

  readonly eraserSize = signal(16);

  readonly fontSize = signal(20);
  readonly textColor = signal('#1a1a1a');
  readonly textBold = signal(false);
  readonly textItalic = signal(false);

  readonly pendingImageId = signal<string | null>(null);

  readonly snapEnabled = signal(true);
  readonly zoom = signal(1);

  readonly selection = signal<Selection | null>(null);

  /**
   * The scene being edited.
   *
   * Undo, redo and loading swap in a different scene object, so read it afresh each time rather
   * than holding on to it.
   */
  get current(): MapScene {
    return this.scene;
  }

  /**
   * Tells whatever draws the scene that it has changed, without recording a step in the history.
   */
  bump(): void {
    this.tick.update((v) => v + 1);
  }

  private refreshHistoryFlags(): void {
    this.canUndo.set(this.history.canUndo());
    this.canRedo.set(this.history.canRedo());
  }

  /**
   * Marks the start of a stroke or drag; it does nothing, since the step is recorded when the
   * gesture ends.
   */
  beginGesture(): void {}

  /**
   * Records the scene as it stands as one undoable step, dropping anything that could have been
   * redone.
   */
  endGesture(): void {
    this.history.commit(this.scene);
    this.refreshHistoryFlags();
  }

  /** Makes a change to the scene, redraws it and records it as one undoable step. */
  applyCommitted(fn: (scene: MapScene) => void): void {
    fn(this.scene);
    this.bump();
    this.endGesture();
  }

  /** Takes the scene back one recorded step; does nothing at the oldest step kept. */
  undo(): void {
    const snapshot = this.history.undo();
    if (!snapshot) return;
    this.scene = snapshot;
    this.bump();
    this.refreshHistoryFlags();
  }

  /** Puts back the step last undone; does nothing when there is none. */
  redo(): void {
    const snapshot = this.history.redo();
    if (!snapshot) return;
    this.scene = snapshot;
    this.bump();
    this.refreshHistoryFlags();
  }

  /**
   * The fill new cells and shapes take from the toolbar: the solid colour, or the texture with its
   * scale and rotation.
   */
  currentFill(): FillStyle {
    if (this.fillMode() === 'texture') {
      return {
        type: 'texture',
        textureId: this.textureId(),
        scale: this.textureScale(),
        rotation: this.textureRotation(),
      };
    }
    return { type: 'solid', color: this.solidColor() };
  }

  /**
   * The outline new shapes take from the toolbar, filled with the current texture when the outline
   * is set to one.
   */
  currentStroke(): StrokeStyle {
    return {
      color: this.strokeColor(),
      width: this.strokeWidth(),
      dash: this.strokeDash(),
      fill:
        this.strokeFillMode() === 'texture'
          ? {
              type: 'texture',
              textureId: this.textureId(),
              scale: this.textureScale(),
              rotation: this.textureRotation(),
            }
          : null,
    };
  }

  /** The drop shadow new shapes take from the toolbar, or null while shadows are off. */
  currentShadow(): ShapeShadow | null {
    if (!this.shadowEnabled()) return null;
    return {
      color: this.shadowColor(),
      blur: this.shadowBlur(),
      offsetX: this.shadowOffsetX(),
      offsetY: this.shadowOffsetY(),
    };
  }

  /** The layers from the topmost down, as the layer list shows them, in a new array. */
  layersTopFirst(): MapLayer[] {
    return this.scene.layers.slice().reverse();
  }

  /**
   * Puts the layers in the order given, topmost first, as one undoable step; an order that leaves a
   * layer out is ignored.
   */
  reorderLayersTopFirst(orderedIds: string[]): void {
    const byId = new Map(this.scene.layers.map((l) => [l.id, l]));
    const next = orderedIds
      .slice()
      .reverse()
      .map((id) => byId.get(id))
      .filter((l): l is MapLayer => l !== undefined);
    if (next.length !== this.scene.layers.length) return;
    this.applyCommitted((scene) => scene.layers.splice(0, scene.layers.length, ...next));
  }

  /** The layer picked in the layer list, or null when none is picked or it no longer exists. */
  activeLayer(): MapLayer | null {
    const id = this.activeLayerId();
    if (!id) return null;
    return this.scene.layers.find((l) => l.id === id) ?? null;
  }

  /**
   * Takes a layer in hand, and the brush that painted it with it.
   *
   * Choosing a layer of functions is choosing to work on what it does, so the tool that works
   * on it is put in hand as well. Without that the properties on show are some other tool's,
   * and a patch that was painted with settings of its own looks like one that cannot be
   * changed at all.
   */
  setActiveLayer(id: string | null): void {
    this.activeLayerId.set(id);
    const chosen = this.activeLayer();
    if (chosen && chosen.kind === 'function') {
      this.functionRole.set(chosen.role);
      this.functionSpec.set({ ...chosen.spec });
      if (this.tool() !== 'functionPaint' && this.tool() !== 'functionErase') this.tool.set('functionPaint');
    }
    this.bump();
  }

  /** Takes up a new brush, retexturing the function layer in hand where one is held. */
  setFunctionSpec(spec: FunctionSpec): void {
    this.functionSpec.set(spec);
    const active = this.activeLayer();
    if (active && active.kind === 'function' && active.role === this.functionRole() && !active.locked) {
      // Through the same door as every other edit of a layer: retexturing one is a step of the
      // work like any other, and one that goes round the outside is stepped over by an undo,
      // which then lands past the painting the retexture was made for.
      this.applyCommitted(() => {
        active.spec = { ...spec };
      });
    }
  }

  private autoLayerName(kind: LayerKind): string {
    this.layerCounter += 1;
    return kind + ' ' + this.layerCounter;
  }

  /**
   * The layer new work of a kind goes onto.
   *
   * That is the active layer when it is of the kind and unlocked, then the topmost visible and
   * unlocked layer of the kind, and otherwise a new layer, which becomes active. Making one is not
   * recorded as a step of its own.
   */
  ensureLayerFor(kind: LayerKind): MapLayer {
    const active = this.activeLayer();
    if (active && active.kind === kind && !active.locked) return active;

    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (layer.kind === kind && layer.visible && !layer.locked) return layer;
    }

    const created = createLayer(kind, this.autoLayerName(kind));
    addLayer(this.scene, created);
    this.activeLayerId.set(created.id);
    this.bump();
    return created;
  }

  /**
   * The cell layer erasing works on: the active layer when it is an unlocked cell layer, then the
   * topmost visible and unlocked one, or null.
   */
  topmostCellLayer(): CellLayer | null {
    const active = this.activeLayer();
    if (active && active.kind === 'cell' && !active.locked) return active;
    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (layer.kind === 'cell' && layer.visible && !layer.locked) return layer;
    }
    return null;
  }

  /** The layer a function is painted onto: one of that role, or a new one for it. */
  ensureFunctionLayerFor(role: MapFunctionRole): FunctionLayer {
    const look = lookKey(this.functionSpec());
    const active = this.activeLayer();
    if (
      active &&
      active.kind === 'function' &&
      active.role === role &&
      !active.locked &&
      lookKey(active.spec) === look
    ) {
      return active;
    }

    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (layer.kind !== 'function' || layer.role !== role) continue;
      if (!layer.visible || layer.locked) continue;
      if (lookKey(layer.spec) === look) return layer;
    }

    const created = createLayer('function', this.autoLayerName('function')) as FunctionLayer;
    created.role = role;
    created.spec = { ...this.functionSpec() };
    addLayer(this.scene, created);
    this.activeLayerId.set(created.id);
    this.bump();
    return created;
  }

  /**
   * Paints a cell with the function and look in hand, onto a matching layer or a new one; recorded
   * when the gesture ends.
   */
  paintFunctionCell(col: number, row: number): void {
    const layer = this.ensureFunctionLayerFor(this.functionRole());
    setFunctionCell(layer, col, row);
    this.bump();
  }

  /**
   * Clears a cell from every visible, unlocked function layer of the role in hand; recorded when
   * the gesture ends.
   */
  eraseFunctionCellAt(col: number, row: number): void {
    const role = this.functionRole();
    const layers = this.scene.layers.filter(
      (held): held is FunctionLayer => held.kind === 'function' && held.role === role && held.visible && !held.locked
    );
    if (layers.length < 1) return;
    for (const layer of layers) eraseFunctionCell(layer, col, row);
    this.bump();
  }

  /**
   * Paints a cell with the current fill on the cell layer for new work; recorded when the gesture
   * ends.
   */
  paintCell(col: number, row: number): void {
    const layer = this.ensureLayerFor('cell') as CellLayer;
    setCell(layer, col, row, this.currentFill());
    this.bump();
  }

  /**
   * Clears a cell from the cell layer erasing works on, doing nothing when there is none; recorded
   * when the gesture ends.
   */
  eraseCellAt(col: number, row: number): void {
    const layer = this.topmostCellLayer();
    if (!layer) return;
    eraseCell(layer, col, row);
    this.bump();
  }

  /** Flood-fills outward from a cell with the current fill, as one undoable step. */
  floodFillAt(col: number, row: number): void {
    const layer = this.ensureLayerFor('cell') as CellLayer;
    this.applyCommitted(() => floodFill(this.scene, layer, col, row, this.currentFill()));
  }

  /**
   * Adds a shape with the current outline and shadow, as one undoable step.
   *
   * Given a layer name it goes on a new layer of its own; otherwise it goes on the shape layer for
   * new work.
   */
  addShapeItem(shape: ShapeKind, points: number[], fill: FillStyle | null, layerName?: string): void {
    const layer =
      layerName !== undefined
        ? (this.createNamedLayer('shape', layerName) as ShapeLayer)
        : (this.ensureLayerFor('shape') as ShapeLayer);
    const item: ShapeItem = {
      id: '',
      shape,
      points,
      fill,
      stroke: this.currentStroke(),
      rotation: 0,
      shadow: this.currentShadow(),
    };
    this.applyCommitted(() => addShape(layer, item));
  }

  private createNamedLayer(kind: LayerKind, name: string): MapLayer {
    const created = createLayer(kind, name);
    addLayer(this.scene, created);
    this.activeLayerId.set(created.id);
    return created;
  }

  /** Adds an empty layer on top and makes it active, as one undoable step. */
  addEmptyLayer(kind: LayerKind, name: string): MapLayer {
    const created = createLayer(kind, name);
    this.applyCommitted((scene) => addLayer(scene, created));
    this.activeLayerId.set(created.id);
    return created;
  }

  /** Starts a layer for a role by hand, wearing the brush that is in hand. */
  addEmptyFunctionLayer(role: MapFunctionRole, name: string): FunctionLayer {
    const created = createLayer('function', name) as FunctionLayer;
    created.role = role;
    created.spec = { ...this.functionSpec() };
    this.applyCommitted((scene) => addLayer(scene, created));
    this.activeLayerId.set(created.id);
    this.functionRole.set(role);
    return created;
  }

  /**
   * Places the stamp in hand at a point on a new layer of its own, as one undoable step.
   *
   * Size, rotation, flips and colour come from the toolbar. Does nothing while no stamp is chosen.
   */
  placeStamp(x: number, y: number, layerName: string): void {
    const stampId = this.stampId();
    if (!stampId) return;
    const layer = this.createNamedLayer('stamp', layerName) as StampLayer;
    const item: StampItem = {
      id: '',
      stampId,
      x,
      y,
      size: this.stampSize(),
      rotation: this.stampRotation(),
      flipX: this.stampFlipX(),
      flipY: this.stampFlipY(),
      color: this.stampColor(),
    };
    this.applyCommitted(() => addStamp(layer, item));
  }

  /**
   * Places an image on a new layer of its own as one undoable step, giving it an id when it has
   * none.
   */
  placeImage(item: ImageItem, layerName: string): void {
    const layer = this.createNamedLayer('image', layerName) as ImageLayer;
    this.applyCommitted(() => addImage(layer, { ...item, id: item.id || newId() }));
  }

  /**
   * Adds a freehand stroke in the current pen colour and width, as one undoable step; a stroke of
   * fewer than two points is dropped.
   */
  addFreehand(points: number[]): void {
    if (points.length < 4) return;
    const layer = this.ensureLayerFor('freehand') as FreehandLayer;
    const stroke: FreehandStroke = {
      id: '',
      points,
      color: this.freehandColor(),
      width: this.freehandWidth(),
    };
    this.applyCommitted(() => addStroke(layer, stroke));
  }

  /**
   * Adds text at a point in the current font size, colour, weight and slant, as one undoable step.
   */
  addTextItem(x: number, y: number, text: string, align: TextAlign = 'left'): void {
    const layer = this.ensureLayerFor('text') as TextLayer;
    const item: TextItem = {
      id: '',
      x,
      y,
      text,
      fontSize: this.fontSize(),
      color: this.textColor(),
      bold: this.textBold(),
      italic: this.textItalic(),
      align,
    };
    this.applyCommitted(() => addText(layer, item));
  }

  /**
   * Starts a blank scene of the given size and background, clearing the history, the active layer
   * and the selection.
   */
  newScene(cols: number, rows: number, cellPx: number, background: string): void {
    this.scene = createScene(cols, rows, cellPx);
    this.scene.background = background;
    this.history.reset(this.scene);
    this.activeLayerId.set(null);
    this.selection.set(null);
    this.bump();
    this.refreshHistoryFlags();
  }

  /** Whether the scene is still as new, which is when reading a table over it costs nothing. */
  get isUntouched(): boolean {
    return this.scene.layers.length === 0 && !this.canUndo();
  }

  /** Opens a scene for editing, clearing the history, the active layer and the selection. */
  loadScene(scene: MapScene): void {
    this.scene = scene;
    this.history.reset(this.scene);
    this.activeLayerId.set(null);
    this.selection.set(null);
    this.bump();
    this.refreshHistoryFlags();
  }

  /** Changes the scene's size in cells, as one undoable step. */
  resize(cols: number, rows: number): void {
    this.applyCommitted(() => resizeScene(this.scene, cols, rows));
  }

  /** Changes how many pixels one cell spans, as one undoable step. */
  setCellPx(cellPx: number): void {
    this.applyCommitted(() => {
      this.scene.cellPx = cellPx;
    });
  }

  /** Changes the scene's background colour, as one undoable step. */
  setBackground(color: string): void {
    this.applyCommitted(() => {
      this.scene.background = color;
    });
  }

  /** Changes the colour the grid is drawn in, as one undoable step. */
  setGridColor(color: string): void {
    this.applyCommitted(() => {
      this.scene.gridColor = color;
    });
  }

  /** Shows or hides the grid, as one undoable step. */
  toggleGrid(): void {
    this.applyCommitted(() => {
      this.scene.gridVisible = !this.scene.gridVisible;
    });
  }

  /** Changes the scene's grid between square and hex, as one undoable step. */
  setGridType(gridType: GridType): void {
    this.applyCommitted(() => {
      this.scene.gridType = gridType;
    });
  }

  private findLayerById(id: string): MapLayer | undefined {
    return this.scene.layers.find((l) => l.id === id);
  }

  /** Removes the selected item from its layer as one undoable step, and clears the selection. */
  deleteSelection(): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer) {
      this.selection.set(null);
      return;
    }
    this.applyCommitted(() => {
      if (layer.kind === 'stamp') removeStamp(layer, sel.itemId);
      else if (layer.kind === 'text') removeText(layer, sel.itemId);
      else if (layer.kind === 'shape') removeShape(layer, sel.itemId);
      else if (layer.kind === 'freehand') removeStroke(layer, sel.itemId);
      else if (layer.kind === 'image') removeImage(layer, sel.itemId);
    });
    this.selection.set(null);
  }

  /**
   * Shifts the selected item by a distance in pixels while it is dragged; recorded when the gesture
   * ends.
   */
  moveSelection(dxPx: number, dyPx: number): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer) return;
    if (layer.kind === 'stamp') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      if (item) updateStamp(layer, sel.itemId, { x: item.x + dxPx, y: item.y + dyPx });
    } else if (layer.kind === 'text') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      if (item) updateText(layer, sel.itemId, { x: item.x + dxPx, y: item.y + dyPx });
    } else if (layer.kind === 'image') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      if (item) updateImage(layer, sel.itemId, { x: item.x + dxPx, y: item.y + dyPx });
    } else if (layer.kind === 'shape') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      if (item) {
        const moved =
          item.shape === 'rect' || item.shape === 'ellipse'
            ? [item.points[0] + dxPx, item.points[1] + dyPx, ...item.points.slice(2)]
            : item.points.map((v, idx) => (idx % 2 === 0 ? v + dxPx : v + dyPx));
        const shapeLayer = layer;
        const idx = shapeLayer.items.findIndex((i) => i.id === sel.itemId);
        if (idx !== -1) shapeLayer.items[idx] = { ...item, points: moved };
      }
    } else if (layer.kind === 'freehand') {
      const idx = layer.strokes.findIndex((s) => s.id === sel.itemId);
      if (idx !== -1) {
        const stroke = layer.strokes[idx];
        const moved = stroke.points.map((v, i) => (i % 2 === 0 ? v + dxPx : v + dyPx));
        layer.strokes[idx] = { ...stroke, points: moved };
      }
    }
    this.bump();
  }

  /** Changes the selected stamp, as one undoable step; does nothing unless a stamp is selected. */
  updateSelectedStamp(patch: Partial<StampItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'stamp') return;
    this.applyCommitted(() => updateStamp(layer, sel.itemId, patch));
  }

  /**
   * The selected item together with its layer, or null when nothing is selected or the item is
   * gone.
   */
  selectedItem(): { layer: MapLayer; item: ShapeItem | StampItem | TextItem | ImageItem | FreehandStroke } | null {
    const sel = this.selection();
    if (!sel) return null;
    const layer = this.findLayerById(sel.layerId);
    if (!layer) return null;
    if (layer.kind === 'stamp') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      return item ? { layer, item } : null;
    }
    if (layer.kind === 'text') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      return item ? { layer, item } : null;
    }
    if (layer.kind === 'shape') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      return item ? { layer, item } : null;
    }
    if (layer.kind === 'image') {
      const item = layer.items.find((i) => i.id === sel.itemId);
      return item ? { layer, item } : null;
    }
    if (layer.kind === 'freehand') {
      const item = layer.strokes.find((s) => s.id === sel.itemId);
      return item ? { layer, item } : null;
    }
    return null;
  }

  /**
   * Changes the selected freehand stroke, as one undoable step; does nothing unless a stroke is
   * selected.
   */
  updateSelectedFreehand(patch: Partial<FreehandStroke>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'freehand') return;
    this.applyCommitted(() => updateStroke(layer, sel.itemId, patch));
  }

  /** Changes the selected image, as one undoable step; does nothing unless an image is selected. */
  updateSelectedImage(patch: Partial<ImageItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'image') return;
    this.applyCommitted(() => updateImage(layer, sel.itemId, patch));
  }

  /**
   * Changes the selected image while it is dragged or resized, redrawing without recording a step.
   */
  updateSelectedImageLive(patch: Partial<ImageItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'image') return;
    updateImage(layer, sel.itemId, patch);
    this.bump();
  }

  /**
   * Moves one point of the selected shape while it is dragged, redrawing without recording a step;
   * an index past the shape's points is ignored.
   */
  updateSelectedShapePointLive(index: number, x: number, y: number): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'shape') return;
    const idx = layer.items.findIndex((i) => i.id === sel.itemId);
    if (idx === -1) return;
    const item = layer.items[idx];
    if (index < 0 || index * 2 + 1 >= item.points.length) return;
    const points = item.points.slice();
    points[index * 2] = x;
    points[index * 2 + 1] = y;
    layer.items[idx] = { ...item, points };
    this.bump();
  }

  private hitInLayer(layer: MapLayer, x: number, y: number): string | null {
    const at = { x, y };
    if (layer.kind === 'stamp') {
      for (let j = layer.items.length - 1; j >= 0; j -= 1) {
        const item = layer.items[j];
        if (Math.hypot(x - item.x, y - item.y) <= item.size / 2) return item.id;
      }
    } else if (layer.kind === 'text') {
      for (let j = layer.items.length - 1; j >= 0; j -= 1) {
        const item = layer.items[j];
        if (within(at, textBox(item), 0)) return item.id;
      }
    } else if (layer.kind === 'freehand') {
      for (let j = layer.strokes.length - 1; j >= 0; j -= 1) {
        const stroke = layer.strokes[j];
        if (pointToPolylineDistance(x, y, stroke.points) <= strokeSlack(stroke.width)) return stroke.id;
      }
    } else if (layer.kind === 'image') {
      for (let j = layer.items.length - 1; j >= 0; j -= 1) {
        const item = layer.items[j];
        if (within(at, imageBox(item), 0)) return item.id;
      }
    } else if (layer.kind === 'shape') {
      for (let j = layer.items.length - 1; j >= 0; j -= 1) {
        const item = layer.items[j];
        const slack = strokeSlack(item.stroke ? item.stroke.width : 1);
        if (item.shape === 'line') {
          const p = item.points;
          if (p.length >= 4 && pointToSegmentDistance(x, y, p[0], p[1], p[2], p[3]) <= slack) return item.id;
        } else if (item.shape === 'polyline') {
          if (pointToPolylineDistance(x, y, item.points) <= slack) return item.id;
        } else if (item.shape === 'curve') {
          if (pointToPolylineDistance(x, y, sampleCurvePoints(item.points, false)) <= slack) return item.id;
        } else {
          const box = shapeBox(item);
          if (box && within(at, box, 0)) return item.id;
        }
      }
    }
    return null;
  }

  /**
   * The item under a point, searching from the topmost layer down and skipping hidden and locked
   * layers, or null.
   */
  hitTest(x: number, y: number): Selection | null {
    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (!layer.visible || layer.locked) continue;
      const itemId = this.hitInLayer(layer, x, y);
      if (itemId) return { layerId: layer.id, itemId };
    }
    return null;
  }

  /**
   * Erases at a point on the active layer; recorded when the gesture ends.
   *
   * Freehand strokes are cut apart wherever they pass within the radius, and on other layers the
   * topmost item under the point is removed whole. Cell layers and locked layers are left alone.
   */
  eraseAt(x: number, y: number, radius: number): void {
    const layer = this.activeLayer();
    if (!layer || layer.locked || layer.kind === 'cell') return;
    if (layer.kind === 'freehand') {
      const next: FreehandStroke[] = [];
      let changed = false;
      for (const stroke of layer.strokes) {
        const parts = eraseStrokeAtPoint(stroke, x, y, radius + stroke.width / 2);
        if (!parts) {
          next.push(stroke);
          continue;
        }
        changed = true;
        for (const part of parts) next.push({ ...part, id: newId() });
      }
      if (!changed) return;
      layer.strokes.splice(0, layer.strokes.length, ...next);
      const sel = this.selection();
      if (sel && !next.some((s) => s.id === sel.itemId)) this.selection.set(null);
      this.bump();
      return;
    }
    const id = this.hitInLayer(layer, x, y);
    if (!id) return;
    if (layer.kind === 'stamp') removeStamp(layer, id);
    else if (layer.kind === 'text') removeText(layer, id);
    else if (layer.kind === 'shape') removeShape(layer, id);
    else if (layer.kind === 'image') removeImage(layer, id);
    if (this.selection()?.itemId === id) this.selection.set(null);
    this.bump();
  }

  /**
   * Rounds a coordinate to the nearest half cell while snapping is on, or to a whole pixel while it
   * is off.
   */
  snap(v: number): number {
    if (this.snapEnabled()) {
      const step = this.scene.cellPx / 2;
      return Math.round(v / step) * step;
    }
    return Math.round(v);
  }

  /**
   * Snaps a point to half cells on a square grid and to the centre of the cell under it on any
   * other, or to whole pixels while snapping is off.
   */
  snapPoint(x: number, y: number): { x: number; y: number } {
    if (!this.snapEnabled()) return { x: Math.round(x), y: Math.round(y) };
    if (this.scene.gridType === GridType.SQUARE) {
      return { x: this.snap(x), y: this.snap(y) };
    }
    const cell = pointToCell(this.scene.gridType, x, y, this.scene.cellPx);
    return cellCenter(this.scene.gridType, cell.col, cell.row, this.scene.cellPx);
  }
}
