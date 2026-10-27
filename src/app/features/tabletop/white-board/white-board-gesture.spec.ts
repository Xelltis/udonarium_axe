import { MapScene, SceneGuideLine } from '@axe/domain/map-editor/scene';
import { addShape } from '@axe/domain/map-editor/scene-ops';
import { BoardGesture, GestureHost } from '@axe/features/tabletop/white-board/white-board-gesture';
import {
  BoardPoint,
  BoardTool,
  createBoardScene,
  freehandLayer,
  MarkBox,
  MarkRef,
  MarkStyle,
  shapeBetween,
  shapeLayer,
  SnapGuide,
} from '@axe/features/tabletop/white-board/white-board-scene';

const STYLE: MarkStyle = { color: '#123456', width: 3, fontSize: 20 };

function fakeHost(scene: MapScene) {
  const state = {
    tool: 'select' as BoardTool,
    held: [] as MarkRef[],
    selected: null as MarkRef | null,
    trimming: null as MarkBox | null,
    laying: [] as BoardPoint[],
    guides: [] as SceneGuideLine[],
    shown: [] as SnapGuide[],
    redraws: 0,
    touches: 0,
    typedAt: null as BoardPoint | null,
  };
  const host: GestureHost = {
    scene: () => scene,
    activeLayerId: () => null,
    tool: () => state.tool,
    style: () => STYLE,
    shapeKind: () => 'rect',
    filled: () => false,
    strokeWidth: () => STYLE.width,
    keepingShape: () => false,
    guiding: () => false,
    guides: () => state.guides,
    grip: () => 9,
    held: () => state.held,
    selected: () => state.selected,
    trimming: () => state.trimming,
    trimTo: (window) => (state.trimming = window),
    laying: () => state.laying,
    layTo: (points) => (state.laying = points),
    hold: (marks) => {
      state.held = marks;
      state.selected = marks.length === 1 ? marks[0] : null;
    },
    show: (guides) => (state.shown = guides),
    startTyping: (at) => (state.typedAt = at),
    redraw: () => state.redraws++,
    touched: () => state.touches++,
  };
  return { host, state };
}

describe('BoardGesture', () => {
  let scene: MapScene;

  beforeEach(() => {
    scene = createBoardScene(20, 15, 50);
  });

  it('lays a pen stroke through the points it was dragged over, and none from a tap', () => {
    const { host, state } = fakeHost(scene);
    state.tool = 'pen';
    const gesture = new BoardGesture(host);

    gesture.begin({ x: 10, y: 10 }, false);
    gesture.end({ x: 10, y: 10 });
    expect(freehandLayer(scene).strokes).toHaveLength(0);

    gesture.begin({ x: 10, y: 10 }, false);
    gesture.drag({ x: 40, y: 20 }, true);
    gesture.drag({ x: 80, y: 60 }, true);
    gesture.end({ x: 80, y: 60 });
    expect(freehandLayer(scene).strokes).toHaveLength(1);
    expect(freehandLayer(scene).strokes[0].points.slice(0, 2)).toEqual([10, 10]);
    expect(state.touches).toBe(2);
  });

  it('shows the line it would lay while the drag lasts, and lays what was shown', () => {
    const { host, state } = fakeHost(scene);
    state.tool = 'line';
    const gesture = new BoardGesture(host);

    gesture.begin({ x: 100, y: 100 }, false);
    expect(gesture.pendingMark()).toBeNull();
    gesture.drag({ x: 200, y: 150 }, true);
    expect(gesture.pendingMark()?.points).toEqual([100, 100, 200, 150]);

    gesture.end({ x: 300, y: 300 });
    expect(shapeLayer(scene).items[0].points).toEqual([100, 100, 200, 150]);
    expect(state.held).toEqual([{ kind: 'shape', id: shapeLayer(scene).items[0].id }]);
    expect(gesture.pendingMark()).toBeNull();
  });

  it('takes hold of a mark and carries it, and lets go of everything on empty sheet', () => {
    const { host, state } = fakeHost(scene);
    const rect = shapeBetween('rect', { x: 100, y: 100 }, { x: 200, y: 160 }, STYLE);
    addShape(shapeLayer(scene), rect);
    const gesture = new BoardGesture(host);

    gesture.begin({ x: 150, y: 130 }, false);
    expect(state.held).toEqual([{ kind: 'shape', id: rect.id }]);
    gesture.drag({ x: 170, y: 140 }, true);
    gesture.end({ x: 170, y: 140 });
    expect(rect.points.slice(0, 2)).toEqual([120, 110]);

    gesture.begin({ x: 500, y: 500 }, false);
    expect(state.held).toEqual([]);
    gesture.drag({ x: 520, y: 520 }, true);
    expect(gesture.band()).toEqual({ x: 500, y: 500, w: 20, h: 20 });
    gesture.end({ x: 520, y: 520 });
    expect(gesture.band()).toBeNull();
  });

  it('adds a mark to the hold with shift, and takes it out again', () => {
    const { host, state } = fakeHost(scene);
    const one = shapeBetween('rect', { x: 100, y: 100 }, { x: 140, y: 140 }, STYLE);
    const two = shapeBetween('rect', { x: 300, y: 100 }, { x: 340, y: 140 }, STYLE);
    addShape(shapeLayer(scene), one);
    addShape(shapeLayer(scene), two);
    const gesture = new BoardGesture(host);

    gesture.begin({ x: 120, y: 120 }, false);
    gesture.end({ x: 120, y: 120 });
    gesture.begin({ x: 320, y: 120 }, true);
    gesture.end({ x: 320, y: 120 });
    expect(state.held.map((mark) => mark.id)).toEqual([one.id, two.id]);

    gesture.begin({ x: 120, y: 120 }, true);
    gesture.end({ x: 120, y: 120 });
    expect(state.held.map((mark) => mark.id)).toEqual([two.id]);
  });

  it('lays out a path point by point and hands the words tool its spot', () => {
    const { host, state } = fakeHost(scene);
    state.tool = 'path';
    const gesture = new BoardGesture(host);
    gesture.begin({ x: 10, y: 10 }, false);
    gesture.begin({ x: 50, y: 60 }, false);
    expect(state.laying).toEqual([
      { x: 10, y: 10 },
      { x: 50, y: 60 },
    ]);
    gesture.drag({ x: 70, y: 80 }, false);
    expect(gesture.hover).toEqual({ x: 70, y: 80 });

    state.tool = 'text';
    gesture.begin({ x: 5, y: 6 }, false);
    expect(state.typedAt).toEqual({ x: 5, y: 6 });
  });

  it('slides a laid guide while it is dragged', () => {
    const { host, state } = fakeHost(scene);
    const guide: SceneGuideLine = { id: 'g', axis: 'x', at: 100 };
    state.guides = [guide];
    const gesture = new BoardGesture(host);

    gesture.begin({ x: 101, y: 300 }, false);
    gesture.drag({ x: 180, y: 300 }, true);
    expect(guide.at).toBe(180);
    gesture.end({ x: 180, y: 300 });
    gesture.drag({ x: 250, y: 300 }, false);
    expect(guide.at).toBe(180);
  });
});
