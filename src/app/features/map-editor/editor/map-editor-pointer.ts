import { curveAnchorAt, imageCorners, imageHandleAt } from '@axe/domain/map-editor/editor-hit-test';
import { cellCenter, pointToCell } from '@axe/domain/map-editor/grid-cells';
import { cellKey, ImageItem, ShapeItem } from '@axe/domain/map-editor/scene';
import { generateShapePoints } from '@axe/domain/map-editor/shape-points';
import { GestureKind, MapEditorGesture } from '@axe/features/map-editor/editor/map-editor-gesture';
import { EditorTool, MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';

/** A point of the map, in the map's own pixels. */
export interface ScenePoint {
  readonly x: number;
  readonly y: number;
}

/** What the gestures on the board ask of the panel they are made in. */
export interface MapEditorPointerHost {
  /** Says what is drawn over the map changed, so the board is drawn again. */
  draftChanged(): void;
  /** Starts typing new text at a point of the map. */
  startText(x: number, y: number): void;
  /** Places the picture in hand at a point of the map. */
  placeImage(x: number, y: number): void;
  /** The name of the layer the next shape goes on. */
  shapeLayerName(): string;
  /** The name of the layer the next stamp goes on. */
  stampLayerName(): string;
}

/**
 * What a press, a drag and a release on the board do with each tool: pick and carry, paint and
 * erase, drag out a box, place the points of a path, draw freehand, raise the ground.
 *
 * It is handed points of the map; the panel turns the pointer's events into those and keeps the
 * dragging of the view to itself. What is half drawn is kept on the gesture, which the panel draws
 * from.
 */
export class MapEditorPointer {
  constructor(
    private readonly state: MapEditorState,
    private readonly gesture: MapEditorGesture,
    private readonly host: MapEditorPointerHost
  ) {}

  /** Starts the gesture of the tool in hand at a point. A tool that finishes on the press ends it at once. */
  down(pos: ScenePoint): void {
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
      case 'relief':
        return this.reliefDown(pos);
    }
  }

  /** Carries the gesture under way to a point, or between presses shows where the next one would land. */
  move(pos: ScenePoint): void {
    this.gesture.lastMove = pos;

    const kind = this.currentKind();
    if (kind === 'stamp' || kind === 'image') {
      this.host.draftChanged();
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
      case 'relief':
        return this.reliefMove(pos);
    }
  }

  /** Ends the gesture under way, keeping what it made as one step of the history. */
  up(): void {
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
      case 'relief':
        this.state.endGesture();
        break;
    }
    this.gesture.dragging = false;
  }

  /** The image picked with the select tool, whose corners can be dragged; null otherwise. */
  selectedImageItem(): ImageItem | null {
    if (this.state.tool() !== 'select') return null;
    const sel = this.state.selection();
    if (!sel) return null;
    const layer = this.state.current.layers.find((l) => l.id === sel.layerId);
    if (!layer || layer.kind !== 'image') return null;
    return layer.items.find((i) => i.id === sel.itemId) ?? null;
  }

  /** The curve picked with the select tool, whose anchors can be dragged; null otherwise. */
  selectedCurveItem(): ShapeItem | null {
    if (this.state.tool() !== 'select') return null;
    const sel = this.state.selection();
    if (!sel) return null;
    const layer = this.state.current.layers.find((l) => l.id === sel.layerId);
    if (!layer || layer.kind !== 'shape') return null;
    const item = layer.items.find((i) => i.id === sel.itemId);
    if (!item || (item.shape !== 'curve' && item.shape !== 'closedCurve')) return null;
    return item;
  }

  /** Whether the kind of line in hand is made by placing points rather than dragging one out. */
  multiClickLine(): boolean {
    const kind = this.state.lineKind();
    return kind === 'polyline' || kind === 'curve' || kind === 'closedCurve';
  }

  /** Where a stamp pressed at a point lands: the middle of the cell under it while snapping is on. */
  stampCenter(x: number, y: number): { x: number; y: number } {
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
      case 'relief':
        return 'relief';
      default:
        return 'none';
    }
  }

  /** The gesture from the press while one is under way, and the current tool's otherwise. */
  currentKind(): GestureKind {
    return this.gesture.dragging ? this.gesture.kind : this.gestureKindOf(this.state.tool());
  }

  /** The preview between presses, showing where the next point or the next fill would go. */
  private previewHover(pos: { x: number; y: number }, kind: GestureKind): void {
    if (kind === 'path') this.gesture.draftCurrent = { x: pos.x, y: pos.y };
    if (kind === 'paint' || kind === 'vectorErase' || kind === 'fill' || kind === 'path') this.host.draftChanged();
  }

  private selectDown(pos: { x: number; y: number }): void {
    const selImage = this.selectedImageItem();
    if (selImage) {
      const handle = imageHandleAt(selImage, pos.x, pos.y);
      if (handle !== -1) {
        const opposite = imageCorners(selImage)[(handle + 2) % 4];
        this.gesture.imageResize = { item: selImage, anchorX: opposite.x, anchorY: opposite.y };
        this.host.draftChanged();
        return;
      }
    }
    const selCurve = this.selectedCurveItem();
    if (selCurve) {
      const anchor = curveAnchorAt(selCurve, pos.x, pos.y);
      if (anchor !== -1) {
        this.gesture.curveDrag = { index: anchor };
        this.host.draftChanged();
        return;
      }
    }
    this.state.selection.set(this.state.hitTest(pos.x, pos.y));
    this.gesture.lastMoveStored = pos;
    this.gesture.selectionMoved = false;
    this.host.draftChanged();
  }

  private selectMove(pos: { x: number; y: number }): void {
    if (this.gesture.imageResize) {
      this.resizeImageTo(pos.x, pos.y);
      this.host.draftChanged();
      return;
    }
    if (this.gesture.curveDrag) {
      const snapped = this.state.snapPoint(pos.x, pos.y);
      this.state.updateSelectedShapePointLive(this.gesture.curveDrag.index, snapped.x, snapped.y);
      this.host.draftChanged();
      return;
    }
    if (this.state.selection() && this.gesture.lastMoveStored) {
      this.state.moveSelection(pos.x - this.gesture.lastMoveStored.x, pos.y - this.gesture.lastMoveStored.y);
      this.gesture.selectionMoved = true;
    }
    this.gesture.lastMoveStored = pos;
    this.host.draftChanged();
  }

  private selectUp(): void {
    if (this.gesture.imageResize) {
      this.state.endGesture();
      this.gesture.imageResize = null;
      this.host.draftChanged();
      return;
    }
    if (this.gesture.curveDrag) {
      this.state.endGesture();
      this.gesture.curveDrag = null;
      this.host.draftChanged();
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
    this.eraseVectorAlong(pos);
  }

  private paintDown(pos: { x: number; y: number }): void {
    this.gesture.vectorErasing = false;
    this.gesture.lastPaintedCell = null;
    this.gesture.lastPaintPx = null;
    this.paintAt(pos, this.state.tool());
  }

  private reliefDown(pos: { x: number; y: number }): void {
    this.state.beginReliefStroke(pos.x, pos.y);
    this.gesture.lastPaintPx = pos;
  }

  /** Lays the next dab of the relief brush once the pointer is a quarter of the brush's reach on. */
  private reliefMove(pos: { x: number; y: number }): void {
    const last = this.gesture.lastPaintPx;
    const gap = (this.state.reliefBrush().radius * this.state.current.cellPx) / 4;
    if (last && Math.hypot(pos.x - last.x, pos.y - last.y) < gap) return;
    this.state.dabReliefAt(pos.x, pos.y);
    this.gesture.lastPaintPx = pos;
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
    this.host.draftChanged();
  }

  private boxMove(pos: { x: number; y: number }): void {
    this.gesture.draftCurrent = this.state.snapPoint(pos.x, pos.y);
    this.host.draftChanged();
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
    this.host.draftChanged();
  }

  private pathDown(pos: { x: number; y: number }): void {
    const snapped = this.state.snapPoint(pos.x, pos.y);
    this.gesture.draftPoints.push(snapped.x, snapped.y);
    this.gesture.draftCurrent = { x: pos.x, y: pos.y };
    this.host.draftChanged();
  }

  private stampDown(pos: { x: number; y: number }): void {
    const center = this.stampCenter(pos.x, pos.y);
    this.state.placeStamp(center.x, center.y, this.host.stampLayerName());
    this.gesture.dragging = false;
  }

  private imageDown(pos: { x: number; y: number }): void {
    this.gesture.dragging = false;
    this.host.placeImage(pos.x, pos.y);
  }

  private freehandDown(pos: { x: number; y: number }): void {
    this.gesture.freehandPoints = [pos.x, pos.y];
    this.host.draftChanged();
  }

  private freehandMove(pos: { x: number; y: number }): void {
    this.gesture.freehandPoints.push(pos.x, pos.y);
    this.host.draftChanged();
  }

  private freehandUp(): void {
    if (!this.gesture.dragging) return;
    this.state.addFreehand(this.gesture.freehandPoints);
    this.gesture.freehandPoints = [];
    this.host.draftChanged();
  }

  private textDown(pos: { x: number; y: number }): void {
    const snapped = this.state.snapPoint(pos.x, pos.y);
    this.gesture.dragging = false;
    this.host.startText(snapped.x, snapped.y);
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

  /** Makes a shape of the points placed so far, where there are enough for the tool in hand, and clears them. */
  commitDraftPolyline(): void {
    const tool = this.state.tool();
    if (tool === 'polygon' && this.gesture.draftPoints.length >= 6) {
      this.state.addShapeItem(
        'polygon',
        this.gesture.draftPoints.slice(),
        this.state.currentFill(),
        this.host.shapeLayerName()
      );
    } else if (tool === 'line' && this.state.lineKind() === 'polyline' && this.gesture.draftPoints.length >= 4) {
      this.state.addShapeItem('polyline', this.gesture.draftPoints.slice(), null, this.host.shapeLayerName());
    } else if (tool === 'line' && this.state.lineKind() === 'curve' && this.gesture.draftPoints.length >= 4) {
      this.state.addShapeItem('curve', this.gesture.draftPoints.slice(), null, this.host.shapeLayerName());
    } else if (tool === 'line' && this.state.lineKind() === 'closedCurve' && this.gesture.draftPoints.length >= 6) {
      this.state.addShapeItem(
        'closedCurve',
        this.gesture.draftPoints.slice(),
        this.state.currentFill(),
        this.host.shapeLayerName()
      );
    }
    this.gesture.draftPoints = [];
    this.gesture.draftCurrent = null;
    this.host.draftChanged();
  }

  private commitShape(x: number, y: number, w: number, h: number): void {
    const kind = this.state.shapeKind();
    const fill = this.state.currentFill();
    const name = this.host.shapeLayerName();
    if (kind === 'rect' || kind === 'ellipse') {
      this.state.addShapeItem(kind, [x, y, w, h], fill, name);
      return;
    }
    const points = generateShapePoints(kind, x, y, w, h);
    if (points.length >= 6) this.state.addShapeItem('polygon', points, fill, name);
  }

  /** Throws away whatever is half drawn. */
  cancelDraft(): void {
    this.gesture.draftPoints = [];
    this.gesture.draftStart = null;
    this.gesture.draftCurrent = null;
    this.gesture.freehandPoints = [];
    this.host.draftChanged();
  }

  /** Whether the eraser would work on shapes rather than cells, by the layer that is active. */
  isVectorEraseTarget(): boolean {
    const layer = this.state.activeLayer();
    return !!layer && !layer.locked && layer.kind !== 'cell';
  }
}
