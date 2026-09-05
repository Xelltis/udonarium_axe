import { GridType } from '@axe/domain/tabletop/game-table';
import { DEFAULT_FUNCTION_SPEC } from '@axe/features/map-editor/model/function-layer';
import {
  CellLayer,
  createScene,
  FreehandLayer,
  FunctionLayer,
  ImageLayer,
  MapScene,
  ShapeLayer,
  StampLayer,
  TextLayer,
} from '@axe/features/map-editor/model/scene';
import { RenderHelpers, renderScene } from '@axe/features/map-editor/render/render-scene';
import { describe, expect, it } from 'vitest';

interface Call {
  method: string;
  args: unknown[];
}

interface MockCtx {
  calls: Call[];
  counts(method: string): number;
}

function createMockCtx(): CanvasRenderingContext2D & MockCtx {
  const calls: Call[] = [];
  const record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };
  const ctx: Record<string, unknown> = {
    calls,
    counts(method: string) {
      return calls.filter((c) => c.method === method).length;
    },
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'miter',
    lineCap: 'butt',
    font: '10px sans-serif',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
  };
  for (const method of [
    'clearRect',
    'fillRect',
    'strokeRect',
    'save',
    'restore',
    'translate',
    'rotate',
    'scale',
    'beginPath',
    'closePath',
    'moveTo',
    'lineTo',
    'rect',
    'ellipse',
    'arc',
    'quadraticCurveTo',
    'bezierCurveTo',
    'fill',
    'stroke',
    'fillText',
    'drawImage',
    'setLineDash',
    'clip',
  ]) {
    ctx[method] = record(method);
  }
  return ctx as unknown as CanvasRenderingContext2D & MockCtx;
}

const helpers: RenderHelpers = {
  texturePattern: () => '#abcabc',
  stampImage: () => ({}) as CanvasImageSource,
};

function sceneWith(...layers: MapScene['layers']): MapScene {
  const scene = createScene(2, 2, 10);
  scene.layers = layers;
  return scene;
}

describe('renderScene', () => {
  it('does not throw on an empty scene and clears + fills background', () => {
    const ctx = createMockCtx();
    const scene = createScene(2, 2, 10);
    scene.background = '#123456';
    expect(() => renderScene(ctx, scene, helpers)).not.toThrow();
    expect(ctx.counts('clearRect')).toBe(1);
    expect(ctx.counts('fillRect')).toBeGreaterThanOrEqual(1);
  });

  it('clears but performs no full-canvas background fillRect when background is transparent', () => {
    const ctx = createMockCtx();
    const scene = createScene(2, 2, 10);
    scene.background = 'transparent';
    renderScene(ctx, scene, helpers, { drawGrid: false });
    expect(ctx.counts('clearRect')).toBe(1);
    const bgFills = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 20 && c.args[3] === 20);
    expect(bgFills.length).toBe(0);
  });

  it('fills the full canvas when background is a color', () => {
    const ctx = createMockCtx();
    const scene = createScene(2, 2, 10);
    scene.background = '#abcdef';
    renderScene(ctx, scene, helpers, { drawGrid: false });
    const bgFills = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 20 && c.args[3] === 20);
    expect(bgFills.length).toBe(1);
  });

  it('is a graceful no-op when ctx is null-ish', () => {
    expect(() => renderScene(null as unknown as CanvasRenderingContext2D, createScene(), helpers)).not.toThrow();
  });

  it('draws cells via fillRect', () => {
    const layer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: true,
      locked: false,
      opacity: 1,
      cells: {
        '0,0': { type: 'solid', color: '#f00' },
        '1,1': { type: 'texture', textureId: 'steppe', scale: 1, rotation: 0 },
      },
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    const cellFills = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 10 && c.args[3] === 10);
    expect(cellFills.length).toBe(2);
  });

  describe('the cells painted for what they do', () => {
    function blocked(): FunctionLayer {
      return {
        id: 'f',
        kind: 'function',
        name: 'blocked',
        visible: true,
        locked: false,
        opacity: 1,
        role: 'moveBlock',
        cells: { '0,0': true, '1,1': true },
        spec: { ...DEFAULT_FUNCTION_SPEC },
      };
    }

    function cellFillsIn(ctx: ReturnType<typeof createMockCtx>): number {
      return ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 10 && c.args[3] === 10).length;
    }

    it('leaves them out of the picture unless it is asked for them', () => {
      const ctx = createMockCtx();

      renderScene(ctx, sceneWith(blocked()), helpers, { drawGrid: false });

      expect(cellFillsIn(ctx)).toBe(0);
    });

    it('draws them where the editor asks to see its workings', () => {
      const ctx = createMockCtx();

      renderScene(ctx, sceneWith(blocked()), helpers, { drawGrid: false, drawFunctionLayers: true });

      expect(cellFillsIn(ctx)).toBe(2);
    });

    it('leaves out a layer that has been hidden, asked for or not', () => {
      const ctx = createMockCtx();

      renderScene(ctx, sceneWith({ ...blocked(), visible: false }), helpers, {
        drawGrid: false,
        drawFunctionLayers: true,
      });

      expect(cellFillsIn(ctx)).toBe(0);
    });
  });

  it('draws each shape kind without throwing', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'rect',
          points: [1, 1, 5, 5],
          fill: { type: 'solid', color: '#0f0' },
          stroke: { color: '#000', width: 1 },
          rotation: 30,
        },
        {
          id: '2',
          shape: 'ellipse',
          points: [0, 0, 8, 4],
          fill: null,
          stroke: { color: '#000', width: 1 },
          rotation: 0,
        },
        { id: '3', shape: 'line', points: [0, 0, 9, 9], fill: null, stroke: { color: '#000', width: 2 }, rotation: 0 },
        {
          id: '4',
          shape: 'polygon',
          points: [0, 0, 9, 0, 5, 9],
          fill: { type: 'texture', textureId: 'sea', scale: 1, rotation: 0 },
          stroke: null,
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('rect')).toBe(1);
    expect(ctx.counts('ellipse')).toBe(1);
    expect(ctx.counts('stroke')).toBeGreaterThanOrEqual(3);
    expect(ctx.counts('fill')).toBeGreaterThanOrEqual(2);
  });

  it('strokes a textured shape stroke with the resolved pattern as strokeStyle', () => {
    const pattern = { setTransform() {} } as unknown as CanvasPattern;
    const strokeStyles: unknown[] = [];
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'line',
          points: [0, 0, 9, 9],
          fill: null,
          stroke: { color: '#000', width: 3, fill: { type: 'texture', textureId: 'steppe', scale: 1, rotation: 0 } },
          rotation: 0,
        },
      ],
    };
    const localHelpers: RenderHelpers = {
      texturePattern: () => pattern,
      stampImage: () => null,
    };
    const ctx = createMockCtx();
    const orig = (ctx as unknown as { stroke: () => void }).stroke;
    (ctx as unknown as { stroke: () => void }).stroke = function (this: CanvasRenderingContext2D) {
      strokeStyles.push(this.strokeStyle);
      orig.call(this);
    };
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(strokeStyles[0]).toBe(pattern);
  });

  it('falls back to stroke.color when shape stroke fill resolves to null', () => {
    const strokeStyles: unknown[] = [];
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'line',
          points: [0, 0, 9, 9],
          fill: null,
          stroke: { color: '#abc', width: 3, fill: { type: 'texture', textureId: 'steppe', scale: 1, rotation: 0 } },
          rotation: 0,
        },
      ],
    };
    const localHelpers: RenderHelpers = {
      texturePattern: () => null,
      stampImage: () => null,
    };
    const ctx = createMockCtx();
    const orig = (ctx as unknown as { stroke: () => void }).stroke;
    (ctx as unknown as { stroke: () => void }).stroke = function (this: CanvasRenderingContext2D) {
      strokeStyles.push(this.strokeStyle);
      orig.call(this);
    };
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(strokeStyles[0]).toBe('#abc');
  });

  it('draws stamps via drawImage when image present and skips when null', () => {
    const items = [
      { id: '1', stampId: 'a', x: 5, y: 5, size: 4, rotation: 45, flipX: true, flipY: false, color: '#fff' },
      { id: '2', stampId: 'missing', x: 1, y: 1, size: 4, rotation: 0, flipX: false, flipY: false, color: null },
    ];
    const layer: StampLayer = {
      id: 'st',
      kind: 'stamp',
      name: 'stamps',
      visible: true,
      locked: false,
      opacity: 1,
      items,
    };
    const localHelpers: RenderHelpers = {
      texturePattern: () => null,
      stampImage: (item) => (item.stampId === 'a' ? ({} as CanvasImageSource) : null),
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(ctx.counts('drawImage')).toBe(1);
  });

  it('draws freehand strokes', () => {
    const layer: FreehandLayer = {
      id: 'f',
      kind: 'freehand',
      name: 'freehand',
      visible: true,
      locked: false,
      opacity: 1,
      strokes: [{ id: '1', points: [0, 0, 2, 3, 5, 1, 8, 8], color: '#111', width: 2 }],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('stroke')).toBe(1);
    expect(ctx.counts('quadraticCurveTo')).toBeGreaterThanOrEqual(1);
  });

  it('draws multi-line text via fillText per line', () => {
    const layer: TextLayer = {
      id: 't',
      kind: 'text',
      name: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          x: 1,
          y: 1,
          text: 'a\nb\nc',
          fontSize: 12,
          color: '#000',
          bold: true,
          italic: true,
          align: 'center',
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('fillText')).toBe(3);
    expect(ctx.textBaseline).toBe('top');
    const textCalls = ctx.calls.filter((c) => c.method === 'fillText');
    expect(textCalls.map((c) => c.args[2])).toEqual([1, 1 + 12 * 1.2, 1 + 12 * 1.2 * 2]);
  });

  it('leaves out the text item it is told to hide', () => {
    const layer: TextLayer = {
      id: 't',
      kind: 'text',
      name: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        { id: 'keep', x: 1, y: 1, text: 'A', fontSize: 12, color: '#000', bold: false, italic: false, align: 'left' },
        { id: 'hide', x: 2, y: 2, text: 'B', fontSize: 12, color: '#000', bold: false, italic: false, align: 'left' },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false, hideTextId: 'hide' });
    expect(ctx.counts('fillText')).toBe(1);
  });

  it('draws every text item when told to hide none', () => {
    const layer: TextLayer = {
      id: 't',
      kind: 'text',
      name: 'text',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        { id: 'a', x: 1, y: 1, text: 'A', fontSize: 12, color: '#000', bold: false, italic: false, align: 'left' },
        { id: 'b', x: 2, y: 2, text: 'B', fontSize: 12, color: '#000', bold: false, italic: false, align: 'left' },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('fillText')).toBe(2);
  });

  it('skips invisible layers', () => {
    const layer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: false,
      locked: false,
      opacity: 1,
      cells: { '0,0': { type: 'solid', color: '#f00' } },
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    const cellFills = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 10);
    expect(cellFills.length).toBe(0);
  });

  it('draws grid when requested', () => {
    const ctx = createMockCtx();
    renderScene(ctx, createScene(2, 2, 10), helpers, { drawGrid: true });
    expect(ctx.counts('strokeRect')).toBe(1);
    expect(ctx.counts('stroke')).toBeGreaterThanOrEqual(1);
  });

  it('honors scene.gridVisible when drawGrid option omitted', () => {
    const scene = createScene(2, 2, 10);
    scene.gridVisible = false;
    const ctx = createMockCtx();
    renderScene(ctx, scene, helpers);
    expect(ctx.counts('strokeRect')).toBe(0);
  });

  it('draws hex cells as closed paths and never as cell-sized fillRect', () => {
    const layer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: true,
      locked: false,
      opacity: 1,
      cells: { '0,0': { type: 'solid', color: '#f00' }, '1,0': { type: 'solid', color: '#0f0' } },
    };
    const scene = createScene(2, 2, 10, GridType.HEX_VERTICAL);
    scene.layers = [layer];
    const ctx = createMockCtx();
    renderScene(ctx, scene, helpers, { drawGrid: false });
    const cellRects = ctx.calls.filter((c) => c.method === 'fillRect' && c.args[2] === 10 && c.args[3] === 10);
    expect(cellRects.length).toBe(0);
    expect(ctx.counts('fill')).toBe(2);
    expect(ctx.counts('closePath')).toBeGreaterThanOrEqual(2);
  });

  it('draws hex grid overlay as stroked hex outlines', () => {
    const scene = createScene(2, 2, 10, GridType.HEX_HORIZONTAL);
    const ctx = createMockCtx();
    renderScene(ctx, scene, helpers, { drawGrid: true });
    expect(ctx.counts('strokeRect')).toBe(0);
    expect(ctx.counts('stroke')).toBe(scene.cols * scene.rows);
  });

  it('renders image-layer items via drawImage with rotation and honors opacity', () => {
    const layer: ImageLayer = {
      id: 'i',
      kind: 'image',
      name: 'images',
      visible: true,
      locked: false,
      opacity: 0.5,
      items: [
        { id: 'i1', imageIdentifier: 'a', x: 5, y: 5, w: 8, h: 6, rotation: 90, opacity: 0.4 },
        { id: 'i2', imageIdentifier: 'missing', x: 1, y: 1, w: 4, h: 4, rotation: 0, opacity: 1 },
      ],
    };
    const localHelpers: RenderHelpers = {
      texturePattern: () => null,
      stampImage: () => null,
      rasterImage: (item) => (item.imageIdentifier === 'a' ? ({} as CanvasImageSource) : null),
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(ctx.counts('drawImage')).toBe(1);
    expect(ctx.counts('rotate')).toBe(1);
    const draw = ctx.calls.find((c) => c.method === 'drawImage');
    expect(draw!.args.slice(1)).toEqual([-4, -3, 8, 6]);
  });

  it('sets a scaled line dash pattern for dashed strokes and resets afterwards', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'line',
          points: [0, 0, 9, 9],
          fill: null,
          stroke: { color: '#000', width: 2, dash: 'dashed' },
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    const dashCalls = ctx.calls.filter((c) => c.method === 'setLineDash');
    expect(dashCalls.some((c) => JSON.stringify(c.args[0]) === JSON.stringify([6, 4]))).toBe(true);
    expect(JSON.stringify(dashCalls[dashCalls.length - 1].args[0])).toBe(JSON.stringify([]));
  });

  it('uses dotted pattern with round cap', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'rect',
          points: [0, 0, 5, 5],
          fill: null,
          stroke: { color: '#000', width: 3, dash: 'dotted' },
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    const dashCalls = ctx.calls.filter((c) => c.method === 'setLineDash');
    expect(dashCalls.some((c) => JSON.stringify(c.args[0]) === JSON.stringify([3, 6]))).toBe(true);
  });

  it('sets and clears shadow ctx props around a shape with a shadow', () => {
    const states: { color: unknown; blur: unknown }[] = [];
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'rect',
          points: [0, 0, 5, 5],
          fill: { type: 'solid', color: '#0f0' },
          stroke: null,
          rotation: 0,
          shadow: { color: '#123', blur: 4, offsetX: 2, offsetY: 3 },
        },
      ],
    };
    const ctx = createMockCtx();
    const origFill = (ctx as unknown as { fill: () => void }).fill;
    (ctx as unknown as { fill: () => void }).fill = function (this: CanvasRenderingContext2D) {
      states.push({ color: this.shadowColor, blur: this.shadowBlur });
      origFill.call(this);
    };
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(states[0]).toEqual({ color: '#123', blur: 4 });
    expect(ctx.shadowColor).toBe('transparent');
    expect(ctx.shadowBlur).toBe(0);
    expect(ctx.shadowOffsetX).toBe(0);
    expect(ctx.shadowOffsetY).toBe(0);
  });

  it('strokes a polyline without filling or closing the path', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'polyline',
          points: [0, 0, 4, 4, 8, 0],
          fill: { type: 'solid', color: '#f00' },
          stroke: { color: '#000', width: 1 },
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('stroke')).toBe(1);
    expect(ctx.counts('fill')).toBe(0);
    expect(ctx.counts('closePath')).toBe(0);
    expect(ctx.counts('lineTo')).toBe(2);
  });

  it('strokes a curve via bezierCurveTo without filling or closing', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'curve',
          points: [0, 0, 4, 4, 8, 0, 12, 4],
          fill: { type: 'solid', color: '#f00' },
          stroke: { color: '#000', width: 1 },
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('bezierCurveTo')).toBeGreaterThanOrEqual(1);
    expect(ctx.counts('stroke')).toBe(1);
    expect(ctx.counts('fill')).toBe(0);
    expect(ctx.counts('closePath')).toBe(0);
  });

  it('fills and closes a closedCurve via bezierCurveTo when fill present', () => {
    const layer: ShapeLayer = {
      id: 's',
      kind: 'shape',
      name: 'shapes',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        {
          id: '1',
          shape: 'closedCurve',
          points: [0, 0, 8, 0, 8, 8],
          fill: { type: 'solid', color: '#0f0' },
          stroke: { color: '#000', width: 1 },
          rotation: 0,
        },
      ],
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), helpers, { drawGrid: false });
    expect(ctx.counts('bezierCurveTo')).toBeGreaterThanOrEqual(1);
    expect(ctx.counts('closePath')).toBe(1);
    expect(ctx.counts('fill')).toBe(1);
    expect(ctx.counts('stroke')).toBe(1);
  });

  it('clips an image to grid cells and draws it unrotated when clipToCells is set', () => {
    const layer: ImageLayer = {
      id: 'i',
      kind: 'image',
      name: 'images',
      visible: true,
      locked: false,
      opacity: 1,
      items: [
        { id: 'i1', imageIdentifier: 'a', x: 10, y: 10, w: 20, h: 20, rotation: 45, opacity: 1, clipToCells: true },
      ],
    };
    const localHelpers: RenderHelpers = {
      texturePattern: () => null,
      stampImage: () => null,
      rasterImage: () => ({}) as CanvasImageSource,
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(ctx.counts('clip')).toBe(1);
    expect(ctx.counts('drawImage')).toBe(1);
    expect(ctx.counts('rotate')).toBe(0);
    const draw = ctx.calls.find((c) => c.method === 'drawImage');
    expect(draw!.args.slice(1)).toEqual([0, 0, 20, 20]);
  });

  it('places the first flat-top hex cell fill at the footprint offset', () => {
    const layer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: true,
      locked: false,
      opacity: 1,
      cells: { '0,0': { type: 'solid', color: '#f00' } },
    };
    const scene = createScene(3, 3, 12, GridType.HEX_VERTICAL);
    scene.layers = [layer];
    const ctx = createMockCtx();
    renderScene(ctx, scene, helpers, { drawGrid: false });
    const s = 12 / Math.sqrt(3);
    const verts = ctx.calls.filter((c) => c.method === 'moveTo' || c.method === 'lineTo');
    const xs = verts.map((c) => c.args[0] as number);
    const ys = verts.map((c) => c.args[1] as number);
    const cx = xs.reduce((a, b) => a + b, 0) / xs.length;
    const cy = ys.reduce((a, b) => a + b, 0) / ys.length;
    expect(Math.abs(cx - s)).toBeLessThan(1e-6);
    expect(Math.abs(cy - 6)).toBeLessThan(1e-6);
  });

  it('passes scale/rotation to the helper and uses the returned pattern untouched', () => {
    const transforms: unknown[] = [];
    const pattern = {
      setTransform(matrix: unknown) {
        transforms.push(matrix);
      },
    } as unknown as CanvasPattern;
    const layer: CellLayer = {
      id: 'c',
      kind: 'cell',
      name: 'cells',
      visible: true,
      locked: false,
      opacity: 1,
      cells: { '0,0': { type: 'texture', textureId: 'steppe', scale: 2, rotation: 45 } },
    };
    const fills: { textureId: string; scale: number; rotation: number }[] = [];
    const localHelpers: RenderHelpers = {
      texturePattern: (fill) => {
        fills.push({ textureId: fill.textureId, scale: fill.scale, rotation: fill.rotation });
        return pattern;
      },
      stampImage: () => null,
    };
    const ctx = createMockCtx();
    renderScene(ctx, sceneWith(layer), localHelpers, { drawGrid: false });
    expect(fills).toEqual([{ textureId: 'steppe', scale: 2, rotation: 45 }]);
    expect(transforms.length).toBe(0);
  });
});
