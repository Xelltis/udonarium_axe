import { createScene, type ImageItem, type MapScene } from '@axe/domain/map-editor/scene';
import { type EditorOverlay, type OverlayStamp, renderOverlay } from '@axe/infrastructure/map-editor/render-overlay';

interface Call {
  method: string;
  args: unknown[];
}

function mockCtx(): CanvasRenderingContext2D & { calls: Call[]; counts(method: string): number } {
  const calls: Call[] = [];
  const ctx: Record<string, unknown> = {
    calls,
    counts: (method: string) => calls.filter((call) => call.method === method).length,
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px sans-serif',
    textBaseline: 'alphabetic',
    measureText: () => ({ width: 40 }),
  };
  for (const method of [
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
    'arcTo',
    'bezierCurveTo',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'fillText',
    'drawImage',
    'setLineDash',
  ]) {
    ctx[method] = (...args: unknown[]) => calls.push({ method, args });
  }
  return ctx as unknown as CanvasRenderingContext2D & { calls: Call[]; counts(method: string): number };
}

function overlay(overrides: Partial<EditorOverlay> = {}): EditorOverlay {
  return {
    tool: 'select',
    lineKind: 'straight',
    shapeKind: 'rect',
    multiClickLine: false,
    hover: null,
    panning: false,
    vectorErase: false,
    eraserSize: 12,
    draftStart: null,
    draftCurrent: null,
    draftPoints: [],
    freehandPoints: [],
    selection: null,
    selectedImage: null,
    selectedCurve: null,
    stamp: null,
    image: null,
    measureLabel: { cells: (n) => `${n} マス`, angle: (deg) => `${deg}°` },
    ...overrides,
  };
}

const scene: MapScene = createScene(10, 10, 50);

describe('renderOverlay()', () => {
  it('adds nothing with nothing being drawn', () => {
    const ctx = mockCtx();

    renderOverlay(ctx, scene, overlay());

    expect(ctx.counts('stroke')).toBe(0);
    expect(ctx.counts('drawImage')).toBe(0);
  });

  it('shows a line being drawn, with its length', () => {
    const ctx = mockCtx();

    renderOverlay(
      ctx,
      scene,
      overlay({ tool: 'line', draftStart: { x: 0, y: 0 }, draftCurrent: { x: 100, y: 0 }, hover: { x: 100, y: 0 } })
    );

    expect(ctx.counts('lineTo')).toBeGreaterThan(0);
    expect(
      ctx.calls
        .filter((call) => call.method === 'fillText')
        .map((call) => call.args[0])
        .join()
    ).toContain('マス');
  });

  it('shows how far the eraser reaches', () => {
    const ctx = mockCtx();

    renderOverlay(ctx, scene, overlay({ tool: 'cellErase', vectorErase: true, hover: { x: 40, y: 40 } }));

    const arc = ctx.calls.find((call) => call.method === 'arc');
    expect(arc?.args.slice(0, 3)).toEqual([40, 40, 12]);
  });

  it('shows nothing while the view is being dragged', () => {
    const ctx = mockCtx();

    renderOverlay(ctx, scene, overlay({ tool: 'cellPaint', hover: { x: 40, y: 40 }, panning: true }));

    expect(ctx.counts('fillRect')).toBe(0);
  });

  it('shows a stamp before it is placed', () => {
    const ctx = mockCtx();
    const image = { width: 100, height: 100 } as unknown as OverlayStamp['image'];

    renderOverlay(
      ctx,
      scene,
      overlay({
        tool: 'stamp',
        hover: { x: 10, y: 10 },
        stamp: { image, size: 50, center: { x: 10, y: 10 }, rotation: 90, flipX: true, flipY: false },
      })
    );

    expect(ctx.counts('drawImage')).toBe(1);
    expect(ctx.counts('rotate')).toBe(1);
    expect(ctx.calls.find((call) => call.method === 'scale')?.args).toEqual([-1, 1]);
  });

  it('puts handles on the corners of a selected image', () => {
    const ctx = mockCtx();
    const item: ImageItem = { id: 'i1', imageIdentifier: 'img', x: 100, y: 100, w: 40, h: 20, rotation: 0, opacity: 1 };

    renderOverlay(ctx, scene, overlay({ selectedImage: item }));

    expect(ctx.counts('fillRect')).toBe(4);
  });
});
