import type { OverlayPlan } from '@axe/domain/tabletop/vision-scene';
import {
  type DarknessCanvas,
  DarknessLayer,
  defaultDarknessLayer,
  paintReplayDarkness,
} from '@axe/infrastructure/replay/replay-darkness-painter';

interface Call {
  op: string;
  args: number[];
  composite: string;
  alpha: number;
  fill: string;
}

function recorder(): { ctx: DarknessCanvas; calls: Call[] } {
  const calls: Call[] = [];
  const ctx = {
    canvas: { width: 100, height: 100 },
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '' as string | object,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    clip: () => calls.push({ op: 'clip', args: [], composite: ctx.globalCompositeOperation, alpha: 1, fill: '' }),
    translate: () => undefined,
    rotate: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    arc: (x: number, y: number, radius: number) =>
      calls.push({
        op: 'arc',
        args: [x, y, radius],
        composite: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        fill: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient',
      }),
    fill: () => calls.push({ op: 'fill', args: [], composite: ctx.globalCompositeOperation, alpha: 1, fill: '' }),
    fillRect: (x: number, y: number, width: number, height: number) =>
      calls.push({
        op: 'fillRect',
        args: [x, y, width, height],
        composite: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        fill: typeof ctx.fillStyle === 'string' ? ctx.fillStyle : 'gradient',
      }),
    drawImage: (_image: unknown, x: number, y: number, width: number, height: number) =>
      calls.push({
        op: 'drawImage',
        args: [x, y, width, height],
        composite: ctx.globalCompositeOperation,
        alpha: ctx.globalAlpha,
        fill: '',
      }),
  } as unknown as DarknessCanvas & { fillStyle: string | object };

  return { ctx, calls: calls };
}

const place = { left: 40, top: 20, width: 200, height: 200, onBoard: (value: number) => value / 5 };

function plan(overrides: Partial<OverlayPlan> = {}): OverlayPlan {
  return {
    darknessAlpha: 0.8,
    darknessColor: '#000010',
    baseRevealAlpha: 0,
    reveals: [],
    glows: [],
    shadows: [],
    ...overrides,
  };
}

function shape(overrides: Record<string, unknown> = {}) {
  return {
    x: 500,
    y: 500,
    brightPx: 100,
    dimPx: 250,
    angle: 360,
    direction: 0,
    color: '#ffddaa',
    full: true,
    ...overrides,
  };
}

describe('paintReplayDarkness()', () => {
  it('lays the shroud down and composites it over the board', () => {
    const { ctx, calls } = recorder();
    const layer = recorder();

    paintReplayDarkness(ctx, plan(), place, () => layer.ctx);

    const veil = layer.calls.find((call) => call.op === 'fillRect');
    expect(veil).toMatchObject({ fill: '#000010', alpha: 0.8 });
    expect(calls.some((call) => call.op === 'drawImage' && call.args[0] === 40 && call.args[1] === 20)).toBe(true);
  });

  it('carves out what can be seen', () => {
    const layer = recorder();

    paintReplayDarkness(recorder().ctx, plan({ reveals: [shape()] }), place, () => layer.ctx);

    // The carving is destination-out, and a light's reach follows the board's scale.
    const erased = layer.calls.find((call) => call.op === 'arc');
    expect(erased?.composite).toBe('destination-out');
    expect(erased?.args).toEqual([100, 100, 50]);
  });

  it('carves cell shapes when light snaps to the grid', () => {
    const layer = recorder();
    const cells = [
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 50 },
        { x: 0, y: 50 },
      ],
    ];

    paintReplayDarkness(recorder().ctx, plan({ reveals: [shape()], revealCells: cells }), place, () => layer.ctx);

    expect(layer.calls.some((call) => call.op === 'arc')).toBe(false);
    expect(layer.calls.some((call) => call.op === 'fill' && call.composite === 'destination-out')).toBe(true);
  });

  it('adds the colour of each light over the board', () => {
    const { ctx, calls } = recorder();

    paintReplayDarkness(ctx, plan({ glows: [shape()] }), place, () => recorder().ctx);

    const glow = calls.find((call) => call.op === 'arc');
    expect(glow?.composite).toBe('lighter');
    expect(glow?.args).toEqual([140, 120, 50]);
  });

  it('draws nothing where a second surface cannot be made', () => {
    const { ctx, calls } = recorder();

    paintReplayDarkness(ctx, plan(), place, () => null);

    expect(calls).toHaveLength(0);
  });

  it('draws nothing for a board with no size', () => {
    const { ctx, calls } = recorder();

    paintReplayDarkness(ctx, plan(), { ...place, width: 0 }, () => recorder().ctx);

    expect(calls).toHaveLength(0);
  });

  describe('the surface kept for the frames of a video', () => {
    /** An offscreen surface that only notes its size and gives a context that can draw. */
    class FakeOffscreenCanvas {
      static made: FakeOffscreenCanvas[] = [];
      readonly context = {
        fillRect: vi.fn(),
        drawImage: vi.fn(),
        clearRect: vi.fn(),
        globalCompositeOperation: '',
        globalAlpha: 0,
      };
      constructor(
        public width: number,
        public height: number
      ) {
        FakeOffscreenCanvas.made.push(this);
      }
      getContext(): unknown {
        return this.context;
      }
    }

    beforeEach(() => {
      FakeOffscreenCanvas.made = [];
      vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    });

    afterEach(() => vi.unstubAllGlobals());

    it('is washed and used again for a frame of the same size, and made afresh for another size', () => {
      const layer = new DarknessLayer();

      const first = layer.layerOf(64, 32);
      const again = layer.layerOf(64, 32);
      layer.layerOf(32, 32);

      expect(again).toBe(first);
      expect(FakeOffscreenCanvas.made[0].context.clearRect).toHaveBeenCalledWith(0, 0, 64, 32);
      expect(FakeOffscreenCanvas.made).toHaveLength(2);
    });

    it('is let go of, shrunk to nothing, when the layer is', () => {
      const layer = new DarknessLayer();
      layer.layerOf(64, 32);

      layer.dispose();

      expect([FakeOffscreenCanvas.made[0].width, FakeOffscreenCanvas.made[0].height]).toEqual([0, 0]);
      expect(layer.layerOf(64, 32)).toBe(FakeOffscreenCanvas.made[1].context);
    });
  });

  describe('the surface it draws the shroud on', () => {
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    let real: unknown;

    beforeEach(() => {
      real = proto['getContext'];
    });

    afterEach(() => {
      proto['getContext'] = real;
    });

    it('refuses a context that came back unable to draw', () => {
      proto['getContext'] = () => ({});

      expect(defaultDarknessLayer(64, 64)).toBeNull();
    });

    it('draws no shroud at all rather than failing on one it cannot draw', () => {
      proto['getContext'] = () => ({});
      const { ctx, calls } = recorder();

      expect(() => paintReplayDarkness(ctx, plan(), place, defaultDarknessLayer)).not.toThrow();
      expect(calls).toHaveLength(0);
    });

    it('asks for nothing at all for a surface with no size', () => {
      expect(defaultDarknessLayer(0, 10)).toBeNull();
      expect(defaultDarknessLayer(10, 0)).toBeNull();
    });
  });
});
