import { GridType } from '@axe/domain/tabletop/game-table';
import { renderDiamond, renderSquare, renderTriangle } from '@axe/features/tabletop/range/range-render-polygon';
import { RangeRenderSetting } from '@axe/features/tabletop/range/range-render-types';

function createCanvasMock() {
  const canvas = document.createElement('canvas');
  const context = {
    arc: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    fillStyle: '',
    font: '',
    lineWidth: 0,
    strokeStyle: '',
    textAlign: '',
    textBaseline: '',
  } as unknown as CanvasRenderingContext2D;
  vi.spyOn(canvas, 'getContext').mockReturnValue(context);
  return { canvas, context };
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

    expect(clip.clip01x).toBeCloseTo(-20 * Math.SQRT2);
    expect(clip.clip01y).toBeCloseTo(0);
    expect(grid.context.moveTo).toHaveBeenCalledWith(50 - 10 * Math.SQRT2, 50);
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
    return vi
      .mocked(grid.context.fillRect)
      .mock.calls.map(([x, y]) => `${Math.round((x - 45) / 10)},${Math.round((y - 45) / 10)}`)
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

  it('keeps a diamond the same cells when it is turned a quarter', () => {
    expect(cellsFilled(renderDiamond, { degree: 90 })).toEqual(cellsFilled(renderDiamond));
  });

  it('puts the corners of a diamond up, down, left and right, and turns them with it', () => {
    const grid = createCanvasMock();
    const outline = createCanvasMock();

    const clip = renderDiamond(grid.canvas, outline.canvas, makeSetting({ range: 2 }));
    expect(grid.context.moveTo).toHaveBeenCalledWith(50 - 20, 50);
    expect(clip.clip02x).toBeCloseTo(0);
    expect(clip.clip02y).toBeCloseTo(-32);

    const turned = renderDiamond(
      createCanvasMock().canvas,
      createCanvasMock().canvas,
      makeSetting({ range: 2, degree: 45 })
    );
    expect(turned.clip02x).toBeCloseTo(32 * Math.SQRT1_2);
    expect(turned.clip02y).toBeCloseTo(-32 * Math.SQRT1_2);
  });

  it('turns both for a triangle', () => {
    const grid = createCanvasMock();
    const outline = createCanvasMock();

    const clip = renderTriangle(grid.canvas, outline.canvas, makeSetting({ degree: 90, type: 'TRIANGLE' }));

    expect(clip.clip01x).toBeCloseTo(12);
    expect(clip.clip01y).toBeCloseTo(0);
    expect(grid.context.moveTo).toHaveBeenCalledWith(60, 50);
  });
});
