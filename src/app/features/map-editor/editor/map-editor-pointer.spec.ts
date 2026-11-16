import { CellLayer, FreehandLayer, ShapeLayer, StampLayer } from '@axe/domain/map-editor/scene';
import { MapEditorGesture } from '@axe/features/map-editor/editor/map-editor-gesture';
import { MapEditorPointer, MapEditorPointerHost } from '@axe/features/map-editor/editor/map-editor-pointer';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';

describe('MapEditorPointer', () => {
  let state: MapEditorState;
  let gesture: MapEditorGesture;
  let pointer: MapEditorPointer;
  let host: { [Name in keyof MapEditorPointerHost]: ReturnType<typeof vi.fn> };

  const layersOf = <T>(kind: string): T[] => state.current.layers.filter((layer) => layer.kind === kind) as T[];

  beforeEach(() => {
    state = new MapEditorState();
    state.snapEnabled.set(false);
    gesture = new MapEditorGesture();
    host = {
      draftChanged: vi.fn(),
      startText: vi.fn(),
      placeImage: vi.fn(),
      shapeLayerName: vi.fn(() => '図形 1'),
      stampLayerName: vi.fn(() => 'スタンプ 1'),
    };
    pointer = new MapEditorPointer(state, gesture, host as unknown as MapEditorPointerHost);
  });

  describe('the select tool', () => {
    beforeEach(() => {
      state.stampId.set('door-single');
      state.placeStamp(100, 100, 'スタンプ 1');
      state.tool.set('select');
    });

    it('picks what is under a press and carries it with the drag, as one step of the history', () => {
      pointer.down({ x: 100, y: 100 });
      expect(state.selection()).not.toBeNull();

      pointer.move({ x: 130, y: 120 });
      pointer.up();

      const stamp = layersOf<StampLayer>('stamp')[0].items[0];
      expect([stamp.x, stamp.y]).toEqual([130, 120]);
      expect(gesture.dragging).toBe(false);
      state.undo();
      expect([layersOf<StampLayer>('stamp')[0].items[0].x, layersOf<StampLayer>('stamp')[0].items[0].y]).toEqual([
        100, 100,
      ]);
    });

    it('lets go of the selection on a press where nothing is', () => {
      pointer.down({ x: 100, y: 100 });
      pointer.up();

      pointer.down({ x: 400, y: 400 });
      pointer.up();

      expect(state.selection()).toBeNull();
    });
  });

  describe('painting cells', () => {
    it('paints every cell a drag crosses, each once, and keeps the stroke as one step', () => {
      state.tool.set('cellPaint');
      const cellPx = state.current.cellPx;
      const paint = vi.spyOn(state, 'paintCell');

      pointer.down({ x: cellPx / 2, y: cellPx / 2 });
      pointer.move({ x: cellPx * 3.5, y: cellPx / 2 });
      pointer.move({ x: cellPx * 3.6, y: cellPx / 2 });
      pointer.up();

      expect(paint.mock.calls.map(([col, row]) => `${col},${row}`)).toEqual(['0,0', '1,0', '2,0', '3,0']);
      expect(Object.keys(layersOf<CellLayer>('cell')[0].cells)).toHaveLength(4);
      state.undo();
      expect(layersOf<CellLayer>('cell').flatMap((layer) => Object.keys(layer.cells))).toHaveLength(0);
    });

    it('paints nothing off the map', () => {
      state.tool.set('cellPaint');
      const paint = vi.spyOn(state, 'paintCell');

      pointer.down({ x: -50, y: -50 });
      pointer.up();

      expect(paint).not.toHaveBeenCalled();
    });

    it('fills from the cell pressed and is over with the press', () => {
      state.tool.set('fill');
      const fill = vi.spyOn(state, 'floodFillAt').mockImplementation(() => {});
      const cellPx = state.current.cellPx;

      pointer.down({ x: cellPx * 2.5, y: cellPx * 1.5 });

      expect(fill).toHaveBeenCalledWith(2, 1);
      expect(gesture.dragging).toBe(false);
    });

    it('takes the eraser to shapes where the active layer is not one of cells', () => {
      state.addShapeItem('rect', [0, 0, 40, 40], { type: 'solid', color: '#fff' }, 'rect 1');
      state.tool.set('cellErase');
      const erase = vi.spyOn(state, 'eraseAt');

      expect(pointer.isVectorEraseTarget()).toBe(true);
      pointer.down({ x: 10, y: 10 });
      pointer.move({ x: 30, y: 10 });
      pointer.up();

      expect(gesture.kind).toBe('vectorErase');
      expect(erase).toHaveBeenCalled();
    });
  });

  describe('dragging out a shape', () => {
    it('makes a rectangle from the corner pressed to the corner let go', () => {
      state.tool.set('shape');
      state.shapeKind.set('rect');

      pointer.down({ x: 10, y: 20 });
      pointer.move({ x: 110, y: 80 });
      expect(gesture.draftCurrent).toEqual({ x: 110, y: 80 });
      pointer.up();

      const item = layersOf<ShapeLayer>('shape')[0].items[0];
      expect(item.shape).toBe('rect');
      expect(item.points).toEqual([10, 20, 100, 60]);
      expect(host.shapeLayerName).toHaveBeenCalledTimes(1);
      expect(gesture.draftStart).toBeNull();
    });

    it('makes nothing of a press let go where it was made', () => {
      state.tool.set('shape');

      pointer.down({ x: 10, y: 20 });
      pointer.up();

      expect(layersOf<ShapeLayer>('shape')).toHaveLength(0);
    });

    it('drags a straight line out the same way', () => {
      state.tool.set('line');
      state.lineKind.set('straight');

      pointer.down({ x: 0, y: 0 });
      pointer.move({ x: 60, y: 40 });
      pointer.up();

      const item = layersOf<ShapeLayer>('shape')[0].items[0];
      expect(item.shape).toBe('line');
      expect(item.points).toEqual([0, 0, 60, 40]);
    });
  });

  describe('placing the points of a path', () => {
    beforeEach(() => {
      state.tool.set('polygon');
    });

    it('adds a point at each press and follows the pointer between them', () => {
      pointer.down({ x: 0, y: 0 });
      pointer.up();
      pointer.move({ x: 20, y: 5 });
      pointer.down({ x: 50, y: 0 });
      pointer.up();

      expect(gesture.draftPoints).toEqual([0, 0, 50, 0]);
      expect(pointer.currentKind()).toBe('path');
      expect(layersOf<ShapeLayer>('shape')).toHaveLength(0);
    });

    it('makes the polygon once there are three points, and clears the draft', () => {
      for (const [x, y] of [
        [0, 0],
        [50, 0],
        [50, 50],
      ]) {
        pointer.down({ x, y });
        pointer.up();
      }

      pointer.commitDraftPolyline();

      expect(layersOf<ShapeLayer>('shape')[0].items[0].points).toEqual([0, 0, 50, 0, 50, 50]);
      expect(gesture.draftPoints).toEqual([]);
    });

    it('makes nothing of too few points, and throws them away', () => {
      pointer.down({ x: 0, y: 0 });
      pointer.up();

      pointer.commitDraftPolyline();

      expect(layersOf<ShapeLayer>('shape')).toHaveLength(0);
      expect(gesture.draftPoints).toEqual([]);
    });

    it('throws the draft away when asked to, and says the board changed', () => {
      pointer.down({ x: 0, y: 0 });
      pointer.up();
      host.draftChanged.mockClear();

      pointer.cancelDraft();

      expect(gesture.draftPoints).toEqual([]);
      expect(gesture.draftCurrent).toBeNull();
      expect(host.draftChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('the tools that finish on the press', () => {
    it('places the stamp in hand on a layer the panel names', () => {
      state.tool.set('stamp');
      state.stampId.set('door-single');

      pointer.down({ x: 40, y: 60 });

      const stamp = layersOf<StampLayer>('stamp')[0].items[0];
      expect([stamp.x, stamp.y]).toEqual([40, 60]);
      expect(host.stampLayerName).toHaveBeenCalledTimes(1);
      expect(gesture.dragging).toBe(false);
    });

    it('lands a stamp in the middle of the cell while snapping is on', () => {
      state.snapEnabled.set(true);
      const cellPx = state.current.cellPx;

      expect(pointer.stampCenter(cellPx * 1.2, cellPx * 0.1)).toEqual({ x: cellPx * 1.5, y: cellPx * 0.5 });
    });

    it('asks the panel to place the picture in hand, and to start text, where it was pressed', () => {
      state.tool.set('image');
      pointer.down({ x: 5, y: 6 });
      expect(host.placeImage).toHaveBeenCalledWith(5, 6);

      state.tool.set('text');
      pointer.down({ x: 7, y: 8 });
      expect(host.startText).toHaveBeenCalledWith(7, 8);
      expect(gesture.dragging).toBe(false);
    });

    it('draws the stamp and the picture under the pointer as it moves, with nothing pressed', () => {
      state.tool.set('stamp');

      pointer.move({ x: 12, y: 34 });

      expect(gesture.lastMove).toEqual({ x: 12, y: 34 });
      expect(host.draftChanged).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps a freehand trail from the press to the release as one stroke', () => {
    state.tool.set('freehand');

    pointer.down({ x: 0, y: 0 });
    pointer.move({ x: 10, y: 5 });
    pointer.move({ x: 20, y: 0 });
    pointer.up();

    expect(layersOf<FreehandLayer>('freehand')[0].strokes[0].points).toEqual([0, 0, 10, 5, 20, 0]);
    expect(gesture.freehandPoints).toEqual([]);
  });

  it('lays a dab of the relief brush only once the pointer has gone a quarter of its reach on', () => {
    state.tool.set('relief');
    const dab = vi.spyOn(state, 'dabReliefAt').mockImplementation(() => {});
    vi.spyOn(state, 'beginReliefStroke').mockImplementation(() => {});
    const gap = (state.reliefBrush().radius * state.current.cellPx) / 4;

    pointer.down({ x: 0, y: 0 });
    pointer.move({ x: gap / 2, y: 0 });
    expect(dab).not.toHaveBeenCalled();

    pointer.move({ x: gap + 1, y: 0 });
    pointer.up();
    expect(dab).toHaveBeenCalledTimes(1);
  });

  it('goes by the tool in hand at the press for the whole drag, whatever is picked meanwhile', () => {
    state.tool.set('freehand');
    pointer.down({ x: 0, y: 0 });

    state.tool.set('shape');

    expect(pointer.currentKind()).toBe('freehand');
    pointer.up();
    expect(pointer.currentKind()).toBe('box');
  });
});
