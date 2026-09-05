export type { EditorTool, LineKind, ShapeGeneratorKind } from '@axe/features/map-editor/model/editor-tool';
import { Injectable, signal } from '@angular/core';
import {
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  FunctionSpec,
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

  get current(): MapScene {
    return this.scene;
  }

  bump(): void {
    this.tick.update((v) => v + 1);
  }

  private refreshHistoryFlags(): void {
    this.canUndo.set(this.history.canUndo());
    this.canRedo.set(this.history.canRedo());
  }

  beginGesture(): void {}

  endGesture(): void {
    this.history.commit(this.scene);
    this.refreshHistoryFlags();
  }

  applyCommitted(fn: (scene: MapScene) => void): void {
    fn(this.scene);
    this.bump();
    this.endGesture();
  }

  undo(): void {
    const snapshot = this.history.undo();
    if (!snapshot) return;
    this.scene = snapshot;
    this.bump();
    this.refreshHistoryFlags();
  }

  redo(): void {
    const snapshot = this.history.redo();
    if (!snapshot) return;
    this.scene = snapshot;
    this.bump();
    this.refreshHistoryFlags();
  }

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

  currentShadow(): ShapeShadow | null {
    if (!this.shadowEnabled()) return null;
    return {
      color: this.shadowColor(),
      blur: this.shadowBlur(),
      offsetX: this.shadowOffsetX(),
      offsetY: this.shadowOffsetY(),
    };
  }

  layersTopFirst(): MapLayer[] {
    return this.scene.layers.slice().reverse();
  }

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

  activeLayer(): MapLayer | null {
    const id = this.activeLayerId();
    if (!id) return null;
    return this.scene.layers.find((l) => l.id === id) ?? null;
  }

  setActiveLayer(id: string | null): void {
    this.activeLayerId.set(id);
    this.bump();
  }

  private autoLayerName(kind: LayerKind): string {
    this.layerCounter += 1;
    return kind + ' ' + this.layerCounter;
  }

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
    const active = this.activeLayer();
    if (active && active.kind === 'function' && active.role === role && !active.locked) return active;

    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (layer.kind === 'function' && layer.role === role && layer.visible && !layer.locked) return layer;
    }

    const created = createLayer('function', role) as FunctionLayer;
    created.role = role;
    addLayer(this.scene, created);
    this.activeLayerId.set(created.id);
    this.bump();
    return created;
  }

  paintFunctionCell(col: number, row: number): void {
    const layer = this.ensureFunctionLayerFor(this.functionRole());
    layer.spec = { ...this.functionSpec() };
    setFunctionCell(layer, col, row);
    this.bump();
  }

  eraseFunctionCellAt(col: number, row: number): void {
    const role = this.functionRole();
    const active = this.activeLayer();
    const layer =
      active && active.kind === 'function' && active.role === role && !active.locked
        ? active
        : [...this.scene.layers]
            .reverse()
            .find(
              (held): held is FunctionLayer =>
                held.kind === 'function' && held.role === role && held.visible && !held.locked
            );
    if (!layer) return;
    eraseFunctionCell(layer, col, row);
    this.bump();
  }

  paintCell(col: number, row: number): void {
    const layer = this.ensureLayerFor('cell') as CellLayer;
    setCell(layer, col, row, this.currentFill());
    this.bump();
  }

  eraseCellAt(col: number, row: number): void {
    const layer = this.topmostCellLayer();
    if (!layer) return;
    eraseCell(layer, col, row);
    this.bump();
  }

  floodFillAt(col: number, row: number): void {
    const layer = this.ensureLayerFor('cell') as CellLayer;
    this.applyCommitted(() => floodFill(this.scene, layer, col, row, this.currentFill()));
  }

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

  addEmptyLayer(kind: LayerKind, name: string): MapLayer {
    const created = createLayer(kind, name);
    this.applyCommitted((scene) => addLayer(scene, created));
    this.activeLayerId.set(created.id);
    return created;
  }

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

  placeImage(item: ImageItem, layerName: string): void {
    const layer = this.createNamedLayer('image', layerName) as ImageLayer;
    this.applyCommitted(() => addImage(layer, { ...item, id: item.id || newId() }));
  }

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

  loadScene(scene: MapScene): void {
    this.scene = scene;
    this.history.reset(this.scene);
    this.activeLayerId.set(null);
    this.selection.set(null);
    this.bump();
    this.refreshHistoryFlags();
  }

  resize(cols: number, rows: number): void {
    this.applyCommitted(() => resizeScene(this.scene, cols, rows));
  }

  setCellPx(cellPx: number): void {
    this.applyCommitted(() => {
      this.scene.cellPx = cellPx;
    });
  }

  setBackground(color: string): void {
    this.applyCommitted(() => {
      this.scene.background = color;
    });
  }

  setGridColor(color: string): void {
    this.applyCommitted(() => {
      this.scene.gridColor = color;
    });
  }

  toggleGrid(): void {
    this.applyCommitted(() => {
      this.scene.gridVisible = !this.scene.gridVisible;
    });
  }

  setGridType(gridType: GridType): void {
    this.applyCommitted(() => {
      this.scene.gridType = gridType;
    });
  }

  private findLayerById(id: string): MapLayer | undefined {
    return this.scene.layers.find((l) => l.id === id);
  }

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

  updateSelectedStamp(patch: Partial<StampItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'stamp') return;
    this.applyCommitted(() => updateStamp(layer, sel.itemId, patch));
  }

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

  updateSelectedFreehand(patch: Partial<FreehandStroke>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'freehand') return;
    this.applyCommitted(() => updateStroke(layer, sel.itemId, patch));
  }

  updateSelectedImage(patch: Partial<ImageItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'image') return;
    this.applyCommitted(() => updateImage(layer, sel.itemId, patch));
  }

  updateSelectedImageLive(patch: Partial<ImageItem>): void {
    const sel = this.selection();
    if (!sel) return;
    const layer = this.findLayerById(sel.layerId);
    if (!layer || layer.kind !== 'image') return;
    updateImage(layer, sel.itemId, patch);
    this.bump();
  }

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

  hitTest(x: number, y: number): Selection | null {
    for (let i = this.scene.layers.length - 1; i >= 0; i -= 1) {
      const layer = this.scene.layers[i];
      if (!layer.visible || layer.locked) continue;
      const itemId = this.hitInLayer(layer, x, y);
      if (itemId) return { layerId: layer.id, itemId };
    }
    return null;
  }

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

  snap(v: number): number {
    if (this.snapEnabled()) {
      const step = this.scene.cellPx / 2;
      return Math.round(v / step) * step;
    }
    return Math.round(v);
  }

  snapPoint(x: number, y: number): { x: number; y: number } {
    if (!this.snapEnabled()) return { x: Math.round(x), y: Math.round(y) };
    if (this.scene.gridType === GridType.SQUARE) {
      return { x: this.snap(x), y: this.snap(y) };
    }
    const cell = pointToCell(this.scene.gridType, x, y, this.scene.cellPx);
    return cellCenter(this.scene.gridType, cell.col, cell.row, this.scene.cellPx);
  }
}
