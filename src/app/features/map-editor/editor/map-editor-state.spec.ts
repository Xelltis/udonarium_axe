import { GridType } from '@axe/domain/tabletop/game-table';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { sampleCurvePoints } from '@axe/features/map-editor/model/curve-geometry';
import {
  CellLayer,
  DEFAULT_SCENE_BACKGROUND,
  DEFAULT_SCENE_GRID_COLOR,
  FreehandLayer,
  FunctionLayer,
  ImageItem,
  ImageLayer,
  ShapeLayer,
  StampLayer,
  TextLayer,
} from '@axe/features/map-editor/model/scene';

describe('MapEditorState', () => {
  let state: MapEditorState;

  beforeEach(() => {
    state = new MapEditorState();
  });

  it('starts on the select tool with snapping on', () => {
    expect(state.tool()).toBe('select');
    expect(state.snapEnabled()).toBe(true);
    expect(state.zoom()).toBe(1);
  });

  it('makes a layer when there is none and reuses one of the same kind', () => {
    const first = state.ensureLayerFor('cell');
    expect(first.kind).toBe('cell');
    expect(state.current.layers.length).toBe(1);

    const again = state.ensureLayerFor('cell');
    expect(again).toBe(first);
    expect(state.current.layers.length).toBe(1);
  });

  it('makes a new layer rather than using a locked one', () => {
    const locked = state.ensureLayerFor('cell');
    locked.locked = true;
    locked.visible = false;
    const created = state.ensureLayerFor('cell');
    expect(created).not.toBe(locked);
    expect(state.current.layers.length).toBe(2);
  });

  it('undoes a whole painting gesture in one step', () => {
    state.beginGesture();
    state.paintCell(0, 0);
    state.paintCell(1, 0);
    state.paintCell(2, 0);
    state.endGesture();

    const layer = state.current.layers[0] as CellLayer;
    expect(Object.keys(layer.cells).length).toBe(3);
    expect(state.canUndo()).toBe(true);

    state.undo();
    expect(state.current.layers.length).toBe(0);
  });

  it('commits a flood fill and can undo it', () => {
    state.floodFillAt(0, 0);
    const layer = state.current.layers[0] as CellLayer;
    expect(Object.keys(layer.cells).length).toBe(state.current.cols * state.current.rows);
    expect(state.canUndo()).toBe(true);
  });

  it('keeps the undo and redo flags in step as it goes back and forth', () => {
    state.beginGesture();
    state.paintCell(0, 0);
    state.endGesture();
    expect(state.canUndo()).toBe(true);
    expect(state.canRedo()).toBe(false);

    state.undo();
    expect(state.canUndo()).toBe(false);
    expect(state.canRedo()).toBe(true);

    state.redo();
    expect(state.canRedo()).toBe(false);
    const layer = state.current.layers[0] as CellLayer;
    expect(Object.keys(layer.cells).length).toBe(1);
  });

  it('takes a retexture of a painted layer back on its own, without the painting with it', () => {
    state.beginGesture();
    state.paintFunctionCell(0, 0);
    state.endGesture();
    const painted = state.current.layers[0] as FunctionLayer;
    const first = painted.spec.terrain.name;

    state.setFunctionSpec({ ...state.functionSpec(), terrain: { ...state.functionSpec().terrain, name: '石壁' } });
    expect((state.current.layers[0] as FunctionLayer).spec.terrain.name).toBe('石壁');

    state.undo();

    expect((state.current.layers[0] as FunctionLayer).spec.terrain.name).toBe(first);
    expect(Object.keys((state.current.layers[0] as FunctionLayer).cells)).toEqual(['0,0']);
  });

  it('names a layer it starts for a painted cell rather than calling it by its role', () => {
    state.functionRole.set('terrain');
    state.beginGesture();
    state.paintFunctionCell(0, 0);
    state.endGesture();

    // Two layers of wall in different stone read as two 'terrain' rows in the drawer otherwise.
    expect(state.current.layers[0].name).not.toBe('terrain');
  });

  it('clears the history for a new scene', () => {
    state.beginGesture();
    state.paintCell(0, 0);
    state.endGesture();
    expect(state.canUndo()).toBe(true);

    state.newScene(10, 8, 50, '#000000');
    expect(state.canUndo()).toBe(false);
    expect(state.current.cols).toBe(10);
    expect(state.current.rows).toBe(8);
    expect(state.current.cellPx).toBe(50);
    expect(state.current.layers.length).toBe(0);
  });

  it('commits a resize', () => {
    state.resize(5, 5);
    expect(state.current.cols).toBe(5);
    expect(state.current.rows).toBe(5);
    expect(state.canUndo()).toBe(true);
  });

  it('hit tests and deletes a stamp', () => {
    state.stampId.set('door-single');
    state.stampSize.set(64);
    state.placeStamp(100, 100, 'スタンプ 1');
    const layer = state.current.layers.find((l) => l.kind === 'stamp') as StampLayer;
    expect(layer.items.length).toBe(1);

    const hit = state.hitTest(100, 100);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe(layer.items[0].id);

    expect(state.hitTest(400, 400)).toBeNull();

    state.selection.set(hit);
    state.deleteSelection();
    expect(layer.items.length).toBe(0);
    expect(state.selection()).toBeNull();
  });

  it('gives a new scene a paper colour you can see', () => {
    expect(state.current.background).toBe(DEFAULT_SCENE_BACKGROUND);
    expect(state.current.gridColor).toBe(DEFAULT_SCENE_GRID_COLOR);
  });

  it('hit tests, moves and deletes a freehand stroke', () => {
    state.freehandWidth.set(4);
    state.addFreehand([0, 0, 100, 0]);
    const layer = state.current.layers.find((l) => l.kind === 'freehand') as FreehandLayer;
    expect(layer.strokes.length).toBe(1);

    const hit = state.hitTest(50, 1);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe(layer.strokes[0].id);
    expect(state.hitTest(50, 200)).toBeNull();

    state.selection.set(hit);
    state.moveSelection(5, 7);
    expect(layer.strokes[0].points).toEqual([5, 7, 105, 7]);

    state.deleteSelection();
    expect(layer.strokes.length).toBe(0);
    expect(state.selection()).toBeNull();
  });

  it('recolours and rewidths the selected stroke', () => {
    state.addFreehand([0, 0, 100, 0]);
    const layer = state.current.layers.find((l) => l.kind === 'freehand') as FreehandLayer;
    state.selection.set({ layerId: layer.id, itemId: layer.strokes[0].id });
    state.updateSelectedFreehand({ color: '#123456', width: 12 });
    expect(layer.strokes[0].color).toBe('#123456');
    expect(layer.strokes[0].width).toBe(12);
  });

  it('erases part of a stroke and keeps the rest as separate pieces', () => {
    state.addFreehand([0, 0, 20, 0, 40, 0, 60, 0, 80, 0]);
    const layer = state.current.layers.find((l) => l.kind === 'freehand') as FreehandLayer;
    state.setActiveLayer(layer.id);
    state.eraseAt(40, 0, 5);
    const strokes = layer.strokes;
    expect(strokes.length).toBe(2);
    expect(strokes[0].points).toEqual([0, 0, 20, 0]);
    expect(strokes[1].points).toEqual([60, 0, 80, 0]);
  });

  it('erases nothing from far away', () => {
    state.addFreehand([0, 0, 100, 0]);
    const layer = state.current.layers.find((l) => l.kind === 'freehand') as FreehandLayer;
    state.setActiveLayer(layer.id);
    state.eraseAt(500, 500, 16);
    expect(layer.strokes.length).toBe(1);
    expect(layer.strokes[0].points).toEqual([0, 0, 100, 0]);
  });

  it('erases a stamp or anything else that is not a stroke whole', () => {
    state.stampId.set('door-single');
    state.stampSize.set(64);
    state.placeStamp(100, 100, 'スタンプ 1');
    const layer = state.current.layers.find((l) => l.kind === 'stamp') as StampLayer;
    state.setActiveLayer(layer.id);
    state.eraseAt(100, 100, 8);
    expect(layer.items.length).toBe(0);
  });

  it('leaves the cell layers alone', () => {
    const cell = state.ensureLayerFor('cell');
    state.setActiveLayer(cell.id);
    expect(() => state.eraseAt(0, 0, 16)).not.toThrow();
  });

  it('rounds to half a cell while snapping is on', () => {
    state.snapEnabled.set(true);
    expect(state.snap(40)).toBe(32);
    expect(state.snap(50)).toBe(64);
    state.snapEnabled.set(false);
    expect(state.snap(40.4)).toBe(40);
  });

  it('moves a rectangle without resizing it', () => {
    state.addShapeItem('rect', [10, 20, 30, 40], { type: 'solid', color: '#fff' });
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    const item = layer.items[0];
    state.selection.set({ layerId: layer.id, itemId: item.id });
    state.moveSelection(5, 7);
    expect(layer.items[0].points).toEqual([15, 27, 30, 40]);
  });

  it('gives each shape its own layer', () => {
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'rect 1');
    state.addShapeItem('rect', [20, 20, 10, 10], { type: 'solid', color: '#fff' }, 'rect 2');
    const shapeLayers = state.current.layers.filter((l) => l.kind === 'shape');
    expect(shapeLayers.length).toBe(2);
  });

  it('always adds a new layer, so a scene can hold several of the same kind', () => {
    state.addEmptyLayer('cell', 'セル 1');
    state.addEmptyLayer('cell', 'セル 2');
    const cellLayers = state.current.layers.filter((l) => l.kind === 'cell');
    expect(cellLayers.length).toBe(2);
    expect(state.canUndo()).toBe(true);
  });

  it('gives each stamp its own layer', () => {
    state.stampId.set('door-single');
    state.placeStamp(10, 10, 'スタンプ 1');
    state.placeStamp(20, 20, 'スタンプ 2');
    const stampLayers = state.current.layers.filter((l) => l.kind === 'stamp');
    expect(stampLayers.length).toBe(2);
  });

  it('reorders the layers from a list given top first, and can undo it', () => {
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'a');
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'b');
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'c');
    const beforeBottomFirst = state.current.layers.map((l) => l.name);
    expect(beforeBottomFirst).toEqual(['a', 'b', 'c']);

    const topFirst = state.layersTopFirst().map((l) => l.id);
    const moved = [topFirst[2], topFirst[0], topFirst[1]];
    state.reorderLayersTopFirst(moved);

    expect(state.layersTopFirst().map((l) => l.name)).toEqual(['a', 'c', 'b']);
    state.undo();
    expect(state.current.layers.map((l) => l.name)).toEqual(['a', 'b', 'c']);
  });

  it('does nothing when the list does not name every layer', () => {
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'a');
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' }, 'b');
    const before = state.current.layers.map((l) => l.id);
    state.reorderLayersTopFirst([before[0]]);
    expect(state.current.layers.map((l) => l.id)).toEqual(before);
  });

  it('moves an anchor of the selected curve', () => {
    state.addShapeItem('curve', [0, 0, 10, 10, 20, 0], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    state.selection.set({ layerId: layer.id, itemId: layer.items[0].id });
    state.updateSelectedShapePointLive(1, 15, 25);
    expect(layer.items[0].points).toEqual([0, 0, 15, 25, 20, 0]);
  });

  it('ignores an anchor index out of range', () => {
    state.addShapeItem('curve', [0, 0, 10, 10], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    state.selection.set({ layerId: layer.id, itemId: layer.items[0].id });
    state.updateSelectedShapePointLive(5, 99, 99);
    expect(layer.items[0].points).toEqual([0, 0, 10, 10]);
  });

  it('commits a change of grid type', () => {
    state.setGridType(GridType.HEX_VERTICAL);
    expect(state.current.gridType).toBe(GridType.HEX_VERTICAL);
    expect(state.canUndo()).toBe(true);
  });

  it('snaps to the centre of a hex', () => {
    state.setGridType(GridType.HEX_VERTICAL);
    state.snapEnabled.set(true);
    const p = state.snapPoint(100, 100);
    expect(Number.isFinite(p.x)).toBe(true);
    expect(Number.isFinite(p.y)).toBe(true);
    state.snapEnabled.set(false);
    expect(state.snapPoint(40.4, 50.6)).toEqual({ x: 40, y: 51 });
  });

  it('carries the dash pattern into the stroke', () => {
    state.strokeDash.set('dashed');
    expect(state.currentStroke().dash).toBe('dashed');
    state.addShapeItem('line', [0, 0, 10, 0], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].stroke!.dash).toBe('dashed');
  });

  it('gives a committed item a shadow only while shadows are on', () => {
    expect(state.currentShadow()).toBeNull();
    state.shadowEnabled.set(true);
    state.shadowBlur.set(10);
    const shadow = state.currentShadow();
    expect(shadow).not.toBeNull();
    expect(shadow!.blur).toBe(10);
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' });
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].shadow!.blur).toBe(10);
  });

  it('leaves a committed item without one when they are off', () => {
    state.shadowEnabled.set(false);
    state.addShapeItem('rect', [0, 0, 10, 10], { type: 'solid', color: '#fff' });
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].shadow).toBeNull();
  });

  it('hit tests, moves and deletes a polyline', () => {
    state.strokeWidth.set(4);
    state.addShapeItem('polyline', [0, 0, 100, 0, 100, 100], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items.length).toBe(1);
    expect(layer.items[0].shape).toBe('polyline');
    expect(layer.items[0].fill).toBeNull();

    const hit = state.hitTest(50, 1);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe(layer.items[0].id);
    expect(state.hitTest(50, 200)).toBeNull();

    state.selection.set(hit);
    state.moveSelection(5, 7);
    expect(layer.items[0].points).toEqual([5, 7, 105, 7, 105, 107]);

    state.deleteSelection();
    expect(layer.items.length).toBe(0);
  });

  it('takes hold of Japanese words by their right half as well', () => {
    state.fontSize.set(20);
    state.addTextItem(100, 50, 'あいうえお');
    const layer = state.current.layers.find((l) => l.kind === 'text') as TextLayer;
    const id = layer.items[0].id;

    expect(state.hitTest(190, 60)?.itemId).toBe(id);
    expect(state.hitTest(210, 60)).toBeNull();
  });

  it('takes hold of a rectangle dragged out backwards', () => {
    state.snapEnabled.set(false);
    state.addShapeItem('rect', [100, 80, -60, -30], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;

    expect(state.hitTest(50, 60)?.itemId).toBe(layer.items[0].id);
    expect(state.hitTest(120, 60)).toBeNull();
  });

  it('reaches a little past half a wide line, and no further', () => {
    state.snapEnabled.set(false);
    state.strokeWidth.set(20);
    state.addShapeItem('polyline', [0, 0, 100, 0], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;

    expect(state.hitTest(50, 12)?.itemId).toBe(layer.items[0].id);
    expect(state.hitTest(50, 13)).toBeNull();
  });

  it('hit tests a curve along the spline rather than the chord', () => {
    state.snapEnabled.set(false);
    state.strokeWidth.set(4);
    state.addShapeItem('curve', [0, 0, 50, 100, 100, 0, 150, 100], null);
    const layer = state.current.layers.find((l) => l.kind === 'shape') as ShapeLayer;
    expect(layer.items[0].shape).toBe('curve');

    const sampled = sampleCurvePoints(layer.items[0].points, false);
    let bestIdx = 0;
    let bestBulge = -Infinity;
    for (let i = 2; i + 1 < sampled.length; i += 2) {
      const t = sampled[i] / 150;
      const chordY = 0 + t * 0;
      const bulge = Math.abs(sampled[i + 1] - chordY);
      if (bulge > bestBulge && sampled[i] > 5 && sampled[i] < 145) {
        bestBulge = bulge;
        bestIdx = i;
      }
    }
    expect(bestBulge).toBeGreaterThan(20);
    const hit = state.hitTest(sampled[bestIdx], sampled[bestIdx + 1]);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe(layer.items[0].id);
    expect(state.hitTest(75, 300)).toBeNull();
  });

  it('keeps the cell clipping when updating an image', () => {
    const item: ImageItem = { id: '', imageIdentifier: 'img', x: 50, y: 50, w: 40, h: 30, rotation: 0, opacity: 1 };
    state.placeImage(item, '画像 1');
    const layer = state.current.layers.find((l) => l.kind === 'image') as ImageLayer;
    state.selection.set({ layerId: layer.id, itemId: layer.items[0].id });
    state.updateSelectedImage({ clipToCells: true });
    expect(layer.items[0].clipToCells).toBe(true);
  });

  it('hit tests, moves and deletes an image', () => {
    const item: ImageItem = { id: '', imageIdentifier: 'img', x: 100, y: 100, w: 80, h: 60, rotation: 0, opacity: 1 };
    state.placeImage(item, '画像 1');
    const layer = state.current.layers.find((l) => l.kind === 'image') as ImageLayer;
    expect(layer.items.length).toBe(1);

    const hit = state.hitTest(100, 100);
    expect(hit).not.toBeNull();
    expect(hit!.itemId).toBe(layer.items[0].id);
    expect(state.hitTest(500, 500)).toBeNull();

    state.selection.set(hit);
    state.moveSelection(10, 20);
    expect(layer.items[0].x).toBe(110);
    expect(layer.items[0].y).toBe(120);
    expect(layer.items[0].w).toBe(80);

    state.deleteSelection();
    expect(layer.items.length).toBe(0);
    expect(state.selection()).toBeNull();
  });

  it('takes a prefixed image id and passes it through to the current fill', () => {
    state.fillMode.set('texture');
    state.textureId.set('image:abc123');
    state.textureScale.set(2);
    state.textureRotation.set(45);
    const fill = state.currentFill();
    expect(fill).toEqual({ type: 'texture', textureId: 'image:abc123', scale: 2, rotation: 45 });
  });
});
