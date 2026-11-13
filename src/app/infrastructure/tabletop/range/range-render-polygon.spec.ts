import { GridType } from '@axe/domain/tabletop/game-table';
import {
  renderDiamond,
  renderHexagon,
  renderLine,
  renderPentagon,
  renderSquare,
  renderTriangle,
} from '@axe/infrastructure/tabletop/range/range-render-polygon';
import { RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';
import { contextThatRecords, RecordedCall } from '@axe/testing/fake-canvas-context';

function createCanvasMock() {
  const canvas = document.createElement('canvas');
  const { context, calls } = contextThatRecords();
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  return { canvas, calls };
}

/** The arguments of every call of one method, in order. */
function argsOf(calls: RecordedCall[], name: string): (readonly unknown[])[] {
  return calls.filter((call) => call.name === name).map((call) => call.args);
}

function makeSetting(overrides: Partial<RangeRenderSetting> = {}): RangeRenderSetting {
  return {
    areaWidth: 10,
    areaHeight: 10,
    range: 1,
    width: 1,
    centerX: 0,
    centerY: 0,
    gridSize: 10,
    type: 'SQUARE',
    gridColor: '#ff0000',
    rangeColor: '#0000ff',
    fanDegree: 360,
    degree: 0,
    offSetX: false,
    offSetY: false,
    fillOutLine: true,
    gridType: GridType.SQUARE,
    isDocking: false,
    ...overrides,
  };
}

describe('range-render-polygon', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns both the corners and the clip of a square', () => {
    const grid = createCanvasMock();
    const outline = createCanvasMock();

    const clip = renderSquare(grid.canvas, outline.canvas, makeSetting({ degree: 45 }));

    expect(clip[0].x).toBeCloseTo(-20 * Math.SQRT2);
    expect(clip[0].y).toBeCloseTo(0);
    expect(argsOf(grid.calls, 'moveTo')).toContainEqual([50 - 10 * Math.SQRT2, 50]);
  });

  /** The cells a range filled, as steps from its origin cell, with the origin on a cell's centre. */
  function cellsFilled(render: typeof renderSquare, overrides: Partial<RangeRenderSetting> = {}): string[] {
    const grid = createCanvasMock();
    const outline = createCanvasMock();
    render(
      grid.canvas,
      outline.canvas,
      makeSetting({ range: 2, centerX: 5, centerY: 5, fillOutLine: false, ...overrides })
    );
    return argsOf(grid.calls, 'fillRect')
      .map(([x, y]) => `${Math.round(((x as number) - 45) / 10)},${Math.round(((y as number) - 45) / 10)}`)
      .sort();
  }

  it('fills the cells a walk of the range reaches for a diamond, counting no diagonals', () => {
    const cells = cellsFilled(renderDiamond);

    expect(cells).toHaveLength(13);
    expect(cells).toEqual(expect.arrayContaining(['0,-2', '2,0', '0,2', '-2,0', '1,1', '-1,-1']));
    expect(cells).not.toContain('2,1');
    expect(cells).not.toContain('2,2');
  });

  it('fills every cell within the range each way for a square, the diagonal corners included', () => {
    const cells = cellsFilled(renderSquare);

    expect(cells).toHaveLength(25);
    expect(cells).toContain('2,2');
  });

  it('notes what of a diamond it paints: its shape and each cell it fills, and nothing of the clip round it', () => {
    const painted: { x: number; y: number }[][] = [];
    renderDiamond(
      createCanvasMock().canvas,
      createCanvasMock().canvas,
      makeSetting({ range: 2, centerX: 5, centerY: 5, fillOutLine: false, painted })
    );
    const inPainted = (x: number, y: number) =>
      painted.some((area) => {
        const xs = area.map((point) => point.x);
        const ys = area.map((point) => point.y);
        return area.length === 4
          ? x >= Math.min(...xs) && x <= Math.max(...xs) && y >= Math.min(...ys) && y <= Math.max(...ys)
          : Math.abs(x) + Math.abs(y) <= 20;
      });

    expect(painted).toHaveLength(1 + 13);
    expect(painted[0]).toEqual([
      { x: -20, y: 0 },
      { x: 0, y: -20 },
      { x: 20, y: 0 },
      { x: 0, y: 20 },
    ]);
    expect(inPainted(14, 14)).toBe(true);
    expect(inPainted(0, 28)).toBe(false);
  });

  it('keeps a diamond the same cells when it is turned a quarter', () => {
    expect(cellsFilled(renderDiamond, { degree: 90 })).toEqual(cellsFilled(renderDiamond));
  });

  it('puts the corners of a diamond up, down, left and right, and turns them with it', () => {
    const grid = createCanvasMock();
    const outline = createCanvasMock();

    const clip = renderDiamond(grid.canvas, outline.canvas, makeSetting({ range: 2 }));
    expect(argsOf(grid.calls, 'moveTo')).toContainEqual([50 - 20, 50]);
    expect(clip[1].x).toBeCloseTo(0);
    expect(clip[1].y).toBeCloseTo(-32);

    const turned = renderDiamond(
      createCanvasMock().canvas,
      createCanvasMock().canvas,
      makeSetting({ range: 2, degree: 45 })
    );
    expect(turned[1].x).toBeCloseTo(32 * Math.SQRT1_2);
    expect(turned[1].y).toBeCloseTo(-32 * Math.SQRT1_2);
  });

  it('turns both for a triangle', () => {
    const grid = createCanvasMock();
    const outline = createCanvasMock();

    const clip = renderTriangle(grid.canvas, outline.canvas, makeSetting({ degree: 90, type: 'TRIANGLE' }));

    expect(clip[0].x).toBeCloseTo(12);
    expect(clip[0].y).toBeCloseTo(0);
    expect(argsOf(grid.calls, 'moveTo')).toContainEqual([60, 50]);
  });

  it('draws a pentagon and a hexagon with as many corners, their clips grown by a fifth', () => {
    for (const [render, corners] of [
      [renderPentagon, 5],
      [renderHexagon, 6],
    ] as const) {
      const grid = createCanvasMock();
      const outline = createCanvasMock();

      const clip = render(grid.canvas, outline.canvas, makeSetting({ range: 2 }));

      expect(clip).toHaveLength(corners);
      expect(clip[0]).toEqual({ x: expect.closeTo(0, 6), y: -24 });
      expect(argsOf(outline.calls, 'lineTo')).toHaveLength(corners - 1);
      expect(argsOf(outline.calls, 'moveTo')).toEqual([[expect.closeTo(50, 6), 30]]);
    }
  });

  it('marks the origin of a line with a dot even while it follows a character, and clips a cell beyond the band', () => {
    const outline = createCanvasMock();

    const clip = renderLine(createCanvasMock().canvas, outline.canvas, makeSetting({ range: 3, isDocking: true }));

    expect(argsOf(outline.calls, 'arc')).toEqual([[50, 50, 5, 0, 2 * Math.PI, true]]);
    expect(argsOf(outline.calls, 'strokeRect')).toEqual([]);
    expect(clip).toEqual([
      { x: -10, y: 15 },
      { x: -10, y: -15 },
      { x: 40, y: -15 },
      { x: 40, y: 15 },
    ]);
  });

  describe('on a canvas taller than it is wide', () => {
    const tall = { areaWidth: 10, areaHeight: 20 };

    it('marks the origin of a line at the middle of the canvas', () => {
      const outline = createCanvasMock();

      renderLine(createCanvasMock().canvas, outline.canvas, makeSetting({ ...tall, type: 'LINE' }));

      expect(argsOf(outline.calls, 'arc')).toEqual([[50, 100, 5, 0, 2 * Math.PI, true]]);
    });

    it('marks the origin of a square at the middle of the canvas, as a dot or as a square', () => {
      const dotted = createCanvasMock();
      renderSquare(createCanvasMock().canvas, dotted.canvas, makeSetting(tall));
      expect(argsOf(dotted.calls, 'arc')).toEqual([[50, 100, 5, 0, 2 * Math.PI, true]]);

      const docked = createCanvasMock();
      renderSquare(createCanvasMock().canvas, docked.canvas, makeSetting({ ...tall, isDocking: true }));
      expect(argsOf(docked.calls, 'strokeRect')).toEqual([[44, 94, 12, 12]]);
      expect(argsOf(docked.calls, 'arc')).toEqual([]);
    });

    it('draws the outline of a square about the middle of the canvas', () => {
      const outline = createCanvasMock();

      renderSquare(createCanvasMock().canvas, outline.canvas, makeSetting(tall));

      expect(argsOf(outline.calls, 'moveTo')).toEqual([[40, 110]]);
      expect(argsOf(outline.calls, 'lineTo')).toEqual([
        [40, 90],
        [60, 90],
        [60, 110],
      ]);
      expect(argsOf(outline.calls, 'closePath')).toHaveLength(1);
    });
  });
});
