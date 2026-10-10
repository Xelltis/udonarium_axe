import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { OverlayPlan, OverlayShape, OverlayVision } from '@axe/domain/tabletop/vision-scene';
import {
  animatedGlowPatches,
  animationIntensity,
  bakeOverlayPlan,
  drawOverlayPlan,
  fillUnwalkedCells,
  hexToRgba,
  LIGHT_MIN_OVERLAY_SCALE,
  LIGHT_OVERLAY_PIXEL_BUDGET,
  MIN_OVERLAY_SCALE,
  OVERLAY_PIXEL_BUDGET,
  overlayScale,
  overlayScratch,
} from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { BorrowedGlobals } from '@axe/testing/borrowed-globals';

interface Op {
  name: string;
  args: unknown[];
  composite: string;
  alpha: number;
}

function fakeContext(): { ctx: CanvasRenderingContext2D; ops: Op[] } {
  const ops: Op[] = [];
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '' as unknown, filter: 'none' };
  const record =
    (name: string) =>
    (...args: unknown[]) =>
      ops.push({ name, args, composite: state.globalCompositeOperation, alpha: state.globalAlpha });
  const ctx = {
    get globalCompositeOperation() {
      return state.globalCompositeOperation;
    },
    set globalCompositeOperation(v: string) {
      state.globalCompositeOperation = v;
    },
    get globalAlpha() {
      return state.globalAlpha;
    },
    set globalAlpha(v: number) {
      state.globalAlpha = v;
    },
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: unknown) {
      state.fillStyle = v;
    },
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    rect: record('rect'),
    arc: record('arc'),
    fill: record('fill'),
    save: record('save'),
    restore: record('restore'),
    clip: record('clip'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    setTransform: record('setTransform'),
    transform: record('transform'),
    translate: record('translate'),
    drawImage: record('drawImage'),
    get filter() {
      return state.filter;
    },
    set filter(v: string) {
      state.filter = v;
    },
    createRadialGradient: () => ({ addColorStop: () => undefined }),
    createLinearGradient: () => ({ addColorStop: () => undefined }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function shape(partial: Partial<OverlayShape> = {}): OverlayShape {
  return {
    x: 100,
    y: 100,
    brightPx: 50,
    dimPx: 100,
    angle: 360,
    direction: 0,
    color: '#ffffff',
    full: false,
    ...partial,
  };
}

describe('vision-overlay-render', () => {
  describe('hexToRgba', () => {
    it('turns a six-digit colour into one with an alpha', () => {
      expect(hexToRgba('#ff8800', 0.5)).toBe('rgba(255, 136, 0, 0.5)');
    });
    it('expands a three-digit colour', () => {
      expect(hexToRgba('#fff', 1)).toBe('rgba(255, 255, 255, 1)');
    });
    it('falls back to white for anything it cannot read', () => {
      expect(hexToRgba('nonsense', 0.2)).toBe('rgba(255, 255, 255, 0.2)');
    });
  });

  describe('animationIntensity', () => {
    it('stays at full for no animation at all', () => {
      expect(animationIntensity('none', 1234)).toBe(1);
      expect(animationIntensity(undefined, 1234)).toBe(1);
    });
    it('moves a pulse through its range over time', () => {
      const a = animationIntensity('pulse', 0);
      const b = animationIntensity('pulse', 550);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).not.toBe(b);
    });
    it('moves a flicker through it too', () => {
      const a = animationIntensity('flicker', 100);
      const b = animationIntensity('flicker', 900);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(a).not.toBe(b);
    });
  });

  describe('the fog laid over ground the party has not walked to', () => {
    const grid = cellGridOf(4, 4, 50, GridType.SQUARE);

    function vision(seen: number[], walked: number[]): OverlayVision {
      const visible = new CellBits(16);
      const explored = new CellBits(16);
      for (const cell of seen) visible.set(cell);
      for (const cell of walked) explored.set(cell);
      return {
        grid,
        visible,
        explored,
        clipReveals: false,
        fogEnabled: true,
        fogColor: '#aeb9c4',
        veilColor: '#000000',
        veilAlpha: 0.3,
        unexploredAlpha: 1,
        blurPx: 0,
        rememberSeen: true,
        clearedStaysLit: false,
      };
    }

    function fogPlan(overlay: OverlayVision): OverlayPlan {
      return {
        darknessAlpha: 0,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [],
        vision: overlay,
      };
    }

    it('traces the unwalked ground once for a scene and fills from that trace after', () => {
      const overlay = vision([0], [0, 1]);
      const first = fakeContext();
      fillUnwalkedCells(first.ctx, overlay, 0);
      const second = fakeContext();
      fillUnwalkedCells(second.ctx, overlay, 0);

      const firstFill = first.ops.find((o) => o.name === 'fill');
      const secondFill = second.ops.find((o) => o.name === 'fill');
      expect(firstFill).toBeDefined();
      if (typeof Path2D === 'function') {
        expect(secondFill?.args[0]).toBe(firstFill?.args[0]);
      } else {
        expect(second.ops.filter((o) => o.name === 'rect')).toHaveLength(4);
      }
    });

    it('shades the ground that has been cleared and covers the ground that has not', () => {
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, fogPlan(vision([0], [0, 1])), 200, 200);

      const fills = ops.filter((o) => o.name === 'fill');
      expect(fills.map((o) => o.alpha)).toContain(0.3);
      expect(fills.map((o) => o.alpha)).toContain(1);
    });

    it('lays no mist over ground the party has cleared', () => {
      const { ctx, ops } = fakeContext();
      // Everything is explored and nothing is in sight, so only the shade is left to draw.
      drawOverlayPlan(
        ctx,
        fogPlan(
          vision(
            [],
            Array.from({ length: 16 }, (_, i) => i)
          )
        ),
        200,
        200
      );

      const fills = ops.filter((o) => o.name === 'fill');
      expect(fills).toHaveLength(1);
      expect(fills[0].alpha).toBe(0.3);
    });

    it('lays nothing over a board that has been walked all over', () => {
      const all = Array.from({ length: 16 }, (_, i) => i);
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, fogPlan(vision(all, all)), 200, 200);

      expect(ops.some((o) => o.name === 'fill')).toBe(false);
    });

    it('leaves the fog off a plan that carries none', () => {
      const off = { ...vision([0], [0]), fogEnabled: false };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, fogPlan(off), 200, 200);

      expect(ops.some((o) => o.name === 'fill')).toBe(false);
    });
  });

  describe('the paths kept between draws', () => {
    class RecordingPath {
      static made = 0;
      readonly ops: unknown[][] = [];
      constructor() {
        RecordingPath.made++;
      }
      moveTo(x: number, y: number): void {
        this.ops.push(['moveTo', x, y]);
      }
      lineTo(x: number, y: number): void {
        this.ops.push(['lineTo', x, y]);
      }
      closePath(): void {
        this.ops.push(['closePath']);
      }
      rect(x: number, y: number, w: number, h: number): void {
        this.ops.push(['rect', x, y, w, h]);
      }
    }

    let borrowed: BorrowedGlobals;

    beforeEach(() => {
      RecordingPath.made = 0;
      borrowed = new BorrowedGlobals();
      borrowed.lend('Path2D', RecordingPath);
    });

    afterEach(() => {
      borrowed.giveBack();
    });

    const darkPlan = (vision?: OverlayVision): OverlayPlan => ({
      darknessAlpha: 0.9,
      darknessColor: '#05060a',
      baseRevealAlpha: 0,
      reveals: [],
      glows: [],
      shadows: [],
      vision,
    });

    it('traces the board surface once and lays every darkness from that trace', () => {
      const cells = [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
        ],
        [
          { x: 20, y: 0 },
          { x: 30, y: 0 },
          { x: 25, y: 10 },
          { x: 22, y: 12 },
        ],
      ];
      const surface = { originX: 0, originY: 0, cells };
      const first = fakeContext();
      drawOverlayPlan(first.ctx, darkPlan(), 800, 600, 0, undefined, 0, surface);
      const second = fakeContext();
      drawOverlayPlan(second.ctx, darkPlan(), 800, 600, 0, undefined, 0, surface);

      const firstFill = first.ops.find((o) => o.name === 'fill');
      const secondFill = second.ops.find((o) => o.name === 'fill');
      expect(firstFill?.args[0]).toBeInstanceOf(RecordingPath);
      expect(secondFill?.args[0]).toBe(firstFill?.args[0]);
      expect(RecordingPath.made).toBe(1);
      expect((firstFill?.args[0] as RecordingPath).ops).toEqual([
        ['moveTo', 0, 0],
        ['lineTo', 10, 0],
        ['lineTo', 5, 10],
        ['closePath'],
        ['moveTo', 20, 0],
        ['lineTo', 30, 0],
        ['lineTo', 25, 10],
        ['lineTo', 22, 12],
        ['closePath'],
      ]);
    });

    it('traces the cleared, remembered and unwalked ground once for a scene', () => {
      const grid = cellGridOf(4, 4, 50, GridType.HEX_VERTICAL);
      const visible = new CellBits(16);
      const explored = new CellBits(16);
      for (const cell of [0, 1, 5]) visible.set(cell);
      for (const cell of [0, 1, 2, 5, 6]) explored.set(cell);
      const vision: OverlayVision = {
        grid,
        visible,
        explored,
        clipReveals: false,
        fogEnabled: true,
        fogColor: '#aeb9c4',
        veilColor: '#000000',
        veilAlpha: 0.3,
        unexploredAlpha: 1,
        blurPx: 0,
        rememberSeen: true,
        clearedStaysLit: true,
      };

      const first = fakeContext();
      drawOverlayPlan(first.ctx, darkPlan(vision), 800, 600);
      const madeForTheScene = RecordingPath.made;
      const second = fakeContext();
      drawOverlayPlan(second.ctx, darkPlan(vision), 800, 600);

      const fills = [...first.ops, ...second.ops].filter((o) => o.name === 'fill');
      expect(fills.length).toBeGreaterThanOrEqual(6);
      expect(fills.every((o) => o.args[0] instanceof RecordingPath)).toBe(true);
      expect(RecordingPath.made).toBe(madeForTheScene);
    });
  });

  describe('drawOverlayPlan', () => {
    it('draws the glow alone for the game master, with no darkness behind it', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [shape()],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 1000, 1000);

      expect(ops.some((o) => o.name === 'fillRect')).toBe(false);
      expect(ops.some((o) => o.name === 'fill' && o.composite === 'lighter')).toBe(true);
      expect(ctx.globalCompositeOperation).toBe('source-over');
    });

    it('paints the darkness for a player and cuts what they can see out of it', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [shape()],
        glows: [shape()],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 1000, 1000);

      const darknessFill = ops.find((o) => o.name === 'fillRect');
      expect(darknessFill?.composite).toBe('source-over');
      expect(darknessFill?.alpha).toBeCloseTo(0.9);
      expect(ops.some((o) => o.name === 'fill' && o.composite === 'destination-out')).toBe(true);
      expect(ctx.globalCompositeOperation).toBe('source-over');
      expect(ctx.globalAlpha).toBe(1);
    });

    it('lifts the whole surface a little when the base reveal asks for it', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.5,
        darknessColor: '#05060a',
        baseRevealAlpha: 0.4,
        reveals: [],
        glows: [],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 1000, 1000);
      const reveals = ops.filter((o) => o.name === 'fillRect' && o.composite === 'destination-out');
      expect(reveals).toHaveLength(1);
      expect(reveals[0].alpha).toBeCloseTo(0.4);
    });

    it('carries the origin of the surface into both the translation and the darkness', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 800, 600, 0, undefined, 10, { originX: -25, originY: -30 });

      expect(ops.find((o) => o.name === 'translate')?.args).toEqual([35, 40]);
      expect(ops.find((o) => o.name === 'fillRect')?.args).toEqual([-25, -30, 800, 600]);
    });

    it('paints the darkness over the cells rather than a rectangle when there are any', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [],
      };
      const cells = [
        [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 10 },
        ],
      ];
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 800, 600, 0, undefined, 0, { originX: -25, originY: -30, cells });

      expect(ops.some((o) => o.name === 'fillRect')).toBe(false);
      expect(ops.filter((o) => o.name === 'lineTo')).toHaveLength(2);
      expect(ops.some((o) => o.name === 'fill' && o.composite === 'source-over')).toBe(true);
    });

    it('wraps a cone in a clip it puts back', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [shape({ angle: 60, direction: 90 })],
        glows: [],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 100, 100);
      expect(ops.some((o) => o.name === 'clip')).toBe(true);
      expect(ops.some((o) => o.name === 'restore')).toBe(true);
    });

    it('draws the silhouette of a picture for a shadow that has one', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [{ x: 100, y: 100, fx: 100, fy: 400, width: 50, color: '#05060a', imageUrl: 'token.png', points: [] }],
      };
      const img = { complete: true, naturalWidth: 10, width: 10, height: 20 } as unknown as HTMLImageElement;
      const images = new Map<string, HTMLImageElement>([['token.png', img]]);
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 1000, 1000, 0, images);
      expect(ops.some((o) => o.name === 'drawImage')).toBe(true);
      expect(ops.some((o) => o.name === 'transform')).toBe(true);
    });

    it('lays the silhouette onto the scale the surface is drawn at, not in place of it', () => {
      // Set in place of it, a shadow on a board drawn smaller than itself would land at the
      // size and the offset it would have on a full-sized one.
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [{ x: 100, y: 100, fx: 100, fy: 400, width: 50, color: '#05060a', imageUrl: 'token.png', points: [] }],
      };
      const img = { complete: true, naturalWidth: 10, width: 10, height: 20 } as unknown as HTMLImageElement;
      const images = new Map<string, HTMLImageElement>([['token.png', img]]);
      const { ctx, ops } = fakeContext();

      drawOverlayPlan(ctx, plan, 1000, 1000, 0, images, 0, undefined, null, null, 0.5);

      const laid = ops.findIndex((o) => o.name === 'transform');
      expect(laid).toBeGreaterThan(-1);
      // Nothing sets the transform outright between the scale going on and the shadow going down.
      expect(
        ops
          .slice(0, laid)
          .filter((o) => o.name === 'setTransform')
          .pop()?.args
      ).toEqual([0.5, 0, 0, 0.5, 0, 0]);
    });

    it('fills a trapezium for a shadow that has none', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [],
        glows: [],
        shadows: [
          {
            x: 100,
            y: 100,
            fx: 100,
            fy: 400,
            width: 50,
            color: '#05060a',
            imageUrl: '',
            points: [
              { x: 75, y: 100 },
              { x: 50, y: 400 },
              { x: 150, y: 400 },
              { x: 125, y: 100 },
            ],
          },
        ],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 1000, 1000);
      expect(ops.some((o) => o.name === 'drawImage')).toBe(false);
      expect(ops.some((o) => o.name === 'fill')).toBe(true);
    });

    it('builds a path from the points and clips to it', () => {
      const plan: OverlayPlan = {
        darknessAlpha: 0.9,
        darknessColor: '#05060a',
        baseRevealAlpha: 0,
        reveals: [
          shape({
            clipPolygon: [
              { x: 0, y: 0 },
              { x: 100, y: 0 },
              { x: 100, y: 100 },
            ],
          }),
        ],
        glows: [],
        shadows: [],
      };
      const { ctx, ops } = fakeContext();
      drawOverlayPlan(ctx, plan, 100, 100);
      expect(ops.some((o) => o.name === 'lineTo')).toBe(true);
      expect(ops.some((o) => o.name === 'clip')).toBe(true);
    });
  });
});

describe('softening the shadows', () => {
  afterEach(() => vi.restoreAllMocks());

  function planWith(imageUrl: string): OverlayPlan {
    return {
      darknessAlpha: 0,
      darknessColor: '#05060a',
      baseRevealAlpha: 0,
      reveals: [],
      glows: [],
      shadows: [{ x: 100, y: 100, fx: 100, fy: 400, width: 50, color: '#05060a', imageUrl, points: [] }],
    };
  }

  it('bakes each picture once rather than softening it on every pass', () => {
    // There is a shadow for every light against every obstacle, and softening them all each frame runs into hundreds of milliseconds a pass.
    const bakes: string[] = [];
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({
          set filter(value: string) {
            bakes.push(value);
          },
          drawImage: () => undefined,
        }),
      } as unknown as HTMLElement;
    }) as typeof document.createElement);

    const img = { complete: true, naturalWidth: 10, width: 10, height: 20 } as unknown as HTMLImageElement;
    const images = new Map<string, HTMLImageElement>([['baked.png', img]]);

    for (let draw = 0; draw < 3; draw++) {
      const { ctx } = fakeContext();
      drawOverlayPlan(ctx, planWith('baked.png'), 400, 400, 0, images);
    }

    expect(bakes).toHaveLength(1);
    expect(bakes[0]).toContain('blur(');
  });
});

describe('how big a surface the overlay is allowed', () => {
  it('leaves an ordinary board at its own size', () => {
    // Twenty cells of fifty, with the widest light spilling four hundred past the edge.
    expect(overlayScale(1800, 1800)).toBe(1);
  });

  it('leaves a large board alone too, so long as it fits', () => {
    expect(overlayScale(2800, 2800)).toBe(1);
  });

  it('draws a board past the budget smaller, and only just far enough', () => {
    const scale = overlayScale(6600, 6600);

    expect(scale).toBeLessThan(1);
    expect(6600 * scale * (6600 * scale)).toBeCloseTo(OVERLAY_PIXEL_BUDGET, -4);
  });

  it('never draws one at less than half, however big it gets', () => {
    expect(overlayScale(40000, 40000)).toBe(MIN_OVERLAY_SCALE);
  });

  it('draws a board smaller again while the table is drawn the lighter way', () => {
    const lighter = overlayScale(7600, 7600, LIGHT_OVERLAY_PIXEL_BUDGET, LIGHT_MIN_OVERLAY_SCALE);

    expect(lighter).toBeLessThan(overlayScale(7600, 7600));
    expect(lighter).toBe(LIGHT_MIN_OVERLAY_SCALE);
    expect(overlayScale(2400, 2400, LIGHT_OVERLAY_PIXEL_BUDGET, LIGHT_MIN_OVERLAY_SCALE)).toBeCloseTo(
      Math.sqrt(LIGHT_OVERLAY_PIXEL_BUDGET / (2400 * 2400)),
      6
    );
  });
});

describe('the ground a pass has to cover', () => {
  function planWith(glows: OverlayShape[]): OverlayPlan {
    return {
      darknessAlpha: 0.9,
      darknessColor: '#05060a',
      baseRevealAlpha: 0,
      reveals: [],
      glows,
      shadows: [],
    };
  }

  it('has none to cover where nothing moves', () => {
    expect(animatedGlowPatches(planWith([shape()]), 800, 600)).toEqual([]);
  });

  it('takes in the light that moves and leaves out the one that does not', () => {
    const plan = planWith([
      shape({ x: 700, y: 500, dimPx: 50 }),
      shape({ x: 100, y: 100, dimPx: 30, animation: 'flicker' }),
    ]);

    expect(animatedGlowPatches(plan, 800, 600)).toEqual([{ x: 70, y: 70, width: 60, height: 60 }]);
  });

  it('gives lights far apart a corner each rather than the ground between them', () => {
    const plan = planWith([
      shape({ x: 100, y: 100, dimPx: 30, animation: 'flicker' }),
      shape({ x: 300, y: 200, dimPx: 40, animation: 'pulse' }),
    ]);

    expect(animatedGlowPatches(plan, 800, 600)).toEqual([
      { x: 70, y: 70, width: 60, height: 60 },
      { x: 260, y: 160, width: 80, height: 80 },
    ]);
  });

  it('redraws lights whose reach meets in one corner', () => {
    const plan = planWith([
      shape({ x: 100, y: 100, dimPx: 30, animation: 'flicker' }),
      shape({ x: 140, y: 100, dimPx: 30, animation: 'pulse' }),
      shape({ x: 190, y: 100, dimPx: 30, animation: 'flicker' }),
    ]);

    expect(animatedGlowPatches(plan, 800, 600)).toEqual([{ x: 70, y: 70, width: 150, height: 60 }]);
  });

  it('carries the margin, and stops at the edge of the surface', () => {
    const plan = planWith([shape({ x: 0, y: 0, dimPx: 200, animation: 'flicker' })]);

    // The light reaches 200px past a 10px margin, so it is cut off where the canvas ends.
    expect(animatedGlowPatches(plan, 800, 600, 10)).toEqual([{ x: 0, y: 0, width: 210, height: 210 }]);
  });
});

describe('the baked surfaces', () => {
  afterEach(() => vi.restoreAllMocks());

  function planWithDarkness(animation?: string): OverlayPlan {
    return {
      darknessAlpha: 0.9,
      darknessColor: '#05060a',
      baseRevealAlpha: 0.2,
      reveals: [shape()],
      glows: [shape(animation ? { animation } : {})],
      shadows: [],
    };
  }

  function stubCanvas(): Op[] {
    const { ctx, ops } = fakeContext();
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
      return { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLElement;
    }) as typeof document.createElement);
    return ops;
  }

  it('paints the darkness and what is cut out of it onto a surface', () => {
    const baked = stubCanvas();
    const bake = bakeOverlayPlan(planWithDarkness(), 800, 600, undefined, 10);

    expect(bake).not.toBeNull();
    expect(baked.some((o) => o.name === 'fillRect' && o.composite === 'source-over')).toBe(true);
    expect(baked.some((o) => o.name === 'fill' && o.composite === 'destination-out')).toBe(true);
  });

  it('bakes a light that stays put, so it is not laid down again every pass', () => {
    const baked = stubCanvas();

    bakeOverlayPlan(planWithDarkness(), 800, 600, undefined, 10);

    expect(baked.some((o) => o.name === 'fill' && o.composite === 'lighter')).toBe(true);
  });

  it('leaves a light that moves out of the baking, or it would stop moving', () => {
    const baked = stubCanvas();

    bakeOverlayPlan(planWithDarkness('flicker'), 800, 600, undefined, 10);

    expect(baked.some((o) => o.name === 'fill' && o.composite === 'lighter')).toBe(false);
  });

  it('puts the baked surfaces down and draws nothing over them where no light moves', () => {
    stubCanvas();
    const plan = planWithDarkness();
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake);

    expect(ops.filter((o) => o.name === 'drawImage')).toHaveLength(1);
    expect(ops.some((o) => o.name === 'fillRect')).toBe(false);
    expect(ops.some((o) => o.name === 'fill' && o.composite === 'destination-out')).toBe(false);
    expect(ops.some((o) => o.name === 'fill' && o.composite === 'lighter')).toBe(false);
  });

  it('draws the light that moves over the baked surfaces', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake);

    expect(ops.filter((o) => o.name === 'drawImage')).toHaveLength(1);
    expect(ops.some((o) => o.name === 'fill' && o.composite === 'lighter')).toBe(true);
  });

  it('redraws only the corner asked for, and leaves the rest of the board alone', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10);

    const { ctx, ops } = fakeContext();
    const dirty = { x: 20, y: 30, width: 120, height: 140 };
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake, dirty);

    // Cleared over the corner rather than the whole of it.
    expect(ops.find((o) => o.name === 'clearRect')?.args).toEqual([20, 30, 120, 140]);
    // And the baked surface is taken from that corner and put back in the same place.
    expect(ops.find((o) => o.name === 'drawImage')?.args.slice(1)).toEqual([20, 30, 120, 140, 20, 30, 120, 140]);
  });

  it('keeps a pass inside its corner, and leaves out the lights that do not reach it', () => {
    stubCanvas();
    const plan: OverlayPlan = {
      ...planWithDarkness(),
      reveals: [],
      glows: [
        shape({ x: 100, y: 100, dimPx: 30, animation: 'flicker' }),
        shape({ x: 700, y: 500, dimPx: 30, animation: 'flicker' }),
      ],
    };
    const bake = bakeOverlayPlan(plan, 800, 600);
    const [corner] = animatedGlowPatches(plan, 800, 600);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 0, undefined, bake, corner);

    const clipAt = ops.findIndex((o) => o.name === 'clip');
    expect(ops[clipAt - 1]).toMatchObject({ name: 'rect', args: [70, 70, 60, 60] });
    expect(ops.filter((o) => o.name === 'fill' && o.composite === 'lighter')).toHaveLength(1);
    expect(ops.map((o) => o.name).lastIndexOf('restore')).toBeGreaterThan(clipAt);
  });

  it('covers the whole board where there is nothing baked to keep', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, null, {
      x: 20,
      y: 30,
      width: 120,
      height: 140,
    });

    expect(ops.find((o) => o.name === 'clearRect')?.args).toEqual([0, 0, 820, 620]);
  });

  it('draws in board coordinates however small the surface it draws on', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10, undefined, null, 0.5);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake, null, 0.5);

    // Half a canvas pixel to the board pixel, said once, at the top.
    expect(ops.find((o) => o.name === 'setTransform')?.args).toEqual([0.5, 0, 0, 0.5, 0, 0]);
    // Cleared and laid down over the board, not over the canvas.
    expect(ops.find((o) => o.name === 'clearRect')?.args).toEqual([0, 0, 820, 620]);
    expect(ops.find((o) => o.name === 'drawImage')?.args.slice(1)).toEqual([0, 0, 820, 620]);
  });

  it('takes a corner off a smaller surface where it lands on the board', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10, undefined, null, 0.5);

    const { ctx, ops } = fakeContext();
    const dirty = { x: 20, y: 30, width: 120, height: 140 };
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake, dirty, 0.5);

    // Taken from half-size canvas coordinates, put back in board coordinates.
    expect(ops.find((o) => o.name === 'drawImage')?.args.slice(1)).toEqual([10, 15, 60, 70, 20, 30, 120, 140]);
  });

  it('throws a baked surface away once it was drawn at another size', () => {
    stubCanvas();
    const plan = planWithDarkness('flicker');
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10, undefined, null, 0.5);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 800, 600, 1000, undefined, 10, undefined, bake, null, 1);

    expect(ops.some((o) => o.name === 'drawImage')).toBe(false);
    expect(ops.some((o) => o.name === 'fillRect')).toBe(true);
  });

  it('throws a baked surface away once the size changes', () => {
    stubCanvas();
    const plan = planWithDarkness();
    const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10);

    const { ctx, ops } = fakeContext();
    drawOverlayPlan(ctx, plan, 400, 300, 1000, undefined, 10, undefined, bake);

    expect(ops.some((o) => o.name === 'drawImage')).toBe(false);
    expect(ops.some((o) => o.name === 'fillRect')).toBe(true);
  });

  describe.each([
    ['square', GridType.SQUARE],
    ['hex', GridType.HEX_VERTICAL],
  ])('the soft edge of what can be seen on a %s board', (_, type) => {
    function seenVision(): OverlayVision {
      const grid = cellGridOf(16, 12, 50, type);
      const visible = new CellBits(16 * 12);
      const explored = new CellBits(16 * 12);
      for (const cell of [0, 1, 16, 17]) {
        visible.set(cell);
        explored.set(cell);
      }
      return {
        grid,
        visible,
        explored,
        clipReveals: true,
        fogEnabled: false,
        fogColor: '#aeb9c4',
        veilColor: '#000000',
        veilAlpha: 0,
        unexploredAlpha: 0,
        blurPx: 6,
        rememberSeen: true,
        clearedStaysLit: false,
      };
    }

    /** Every surface the renderer makes, recording what it draws and each blur it is given. */
    function stubSurfaces(): { ops: Op[]; blurs: string[] } {
      const { ctx, ops } = fakeContext();
      const blurs: string[] = [];
      const surface = new Proxy(ctx, {
        set(target, key, value) {
          if (key === 'filter' && String(value).startsWith('blur')) blurs.push(String(value));
          return Reflect.set(target, key, value);
        },
      });
      vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
        if (tag !== 'canvas') return document.createElementNS('http://www.w3.org/1999/xhtml', tag);
        return { width: 0, height: 0, getContext: () => surface } as unknown as HTMLElement;
      }) as typeof document.createElement);
      return { ops, blurs };
    }

    function flickering() {
      const plan: OverlayPlan = { ...planWithDarkness('flicker'), vision: seenVision() };
      const scratch = overlayScratch(820, 620, 1);
      const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10, undefined, null, 1, scratch);
      const dirty = animatedGlowPatches(plan, 800, 600, 10)[0];
      const pass = (time: number, drawn = plan) =>
        drawOverlayPlan(fakeContext().ctx, drawn, 800, 600, time, undefined, 10, undefined, bake, dirty, 1, scratch);
      return { plan, dirty, pass };
    }

    it('softens it once for a light that flickers, not on every pass', () => {
      const { blurs } = stubSurfaces();
      const { dirty, pass } = flickering();
      blurs.length = 0;

      for (const time of [1000, 1050, 1100]) pass(time);

      expect(dirty).not.toBeNull();
      expect(blurs).toHaveLength(1);
    });

    it('cuts a pass back to the corner it redraws', () => {
      // The stub hands every surface one shared state, so the corner is baked on a pass of its own first.
      const { ops } = stubSurfaces();
      const { dirty, pass } = flickering();
      pass(1000);
      ops.length = 0;

      pass(1050);

      const cuts = ops.filter((o) => o.composite === 'destination-in' && ['fill', 'drawImage'].includes(o.name));
      expect(cuts.map((o) => o.name)).toEqual(['drawImage']);
      expect(cuts[0].args.slice(5)).toEqual([dirty.x, dirty.y, dirty.width, dirty.height]);
    });

    it('keeps the softened edge of every corner it redraws, not only the last', () => {
      const { blurs } = stubSurfaces();
      const plan: OverlayPlan = {
        ...planWithDarkness('flicker'),
        glows: [shape({ animation: 'flicker' }), shape({ x: 600, y: 450, animation: 'flicker' })],
        vision: seenVision(),
      };
      const scratch = overlayScratch(820, 620, 1);
      const bake = bakeOverlayPlan(plan, 800, 600, undefined, 10, undefined, null, 1, scratch);
      const corners = animatedGlowPatches(plan, 800, 600, 10);
      blurs.length = 0;

      for (const time of [1000, 1050, 1100]) {
        for (const corner of corners) {
          drawOverlayPlan(fakeContext().ctx, plan, 800, 600, time, undefined, 10, undefined, bake, corner, 1, scratch);
        }
      }

      expect(corners).toHaveLength(2);
      expect(blurs).toHaveLength(2);
    });

    it('softens it again for the next scene', () => {
      const { blurs } = stubSurfaces();
      const { plan, pass } = flickering();
      pass(1000);
      blurs.length = 0;

      pass(1050, { ...plan, vision: seenVision() });

      expect(blurs).toHaveLength(1);
    });
  });
});
