import { GridType } from '@axe/domain/tabletop/game-table';
import { GridLineRender } from '@axe/features/tabletop/game-table/grid-line-render';

function createCanvasMock() {
  const canvas = document.createElement('canvas');
  const context = {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    transform: vi.fn(),
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

describe('GridLineRender', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('renderViewport', () => {
    it('draws a square grid on a canvas the size of the area', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).renderViewport(100, 100, 50, GridType.SQUARE, '#000', '#000', 25, 75);

      expect(canvas.width).toBe(100);
      expect(canvas.height).toBe(100);
      expect(context.strokeRect).toHaveBeenCalledWith(-25, -25, 50, 50);
      expect(context.fillText).toHaveBeenCalledWith('2-1', 0, 0);
    });

    it('draws a hex grid on one', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).renderViewport(173.2, 129.4, 50, GridType.HEX_VERTICAL, '#000', '#000', 0, 0);

      expect(canvas.width).toBe(174);
      expect(canvas.height).toBe(130);
      expect(context.stroke).toHaveBeenCalled();
      expect(context.fillText).toHaveBeenCalled();
    });

    it('prefixes each label with the side of the wall', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).renderViewport(100, 100, 50, GridType.SQUARE, '#000', '#000', 25, 75, true, 'N');

      expect(context.fillText).toHaveBeenCalledWith('N-2-1', 0, 0);
    });

    it('applies the label transform to each, so a wall does not mirror them', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).renderViewport(
        50,
        50,
        50,
        GridType.SQUARE,
        '#000',
        '#000',
        0,
        0,
        true,
        'S',
        [-1, 0, 0, 1]
      );

      expect(context.translate).toHaveBeenCalledWith(25, 25);
      expect(context.transform).toHaveBeenCalledWith(-1, 0, 0, 1, 0, 0);
      expect(context.fillText).toHaveBeenCalledWith('S-1-1', 0, 0);
    });

    it('draws no labels when they are turned off', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).renderViewport(100, 100, 50, GridType.SQUARE, '#000', '#000', 0, 0, false);

      expect(context.fillText).not.toHaveBeenCalled();
    });
  });

  describe('a grid held to fewer pixels than the board it covers', () => {
    it('draws the same lines on a canvas scaled down to match', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas, 0.5).renderViewport(100, 100, 50, GridType.SQUARE, '#000', '#000', 25, 75);

      expect(canvas.width).toBe(50);
      expect(canvas.height).toBe(50);
      expect(context.setTransform).toHaveBeenCalledWith(0.5, 0, 0, 0.5, 0, 0);
      expect(context.strokeRect).toHaveBeenCalledWith(-25, -25, 50, 50);
    });

    it('holds a whole board to fewer pixels as well', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas, 0.25).render(4, 3, 50, GridType.SQUARE, '#000', '#000');

      expect(canvas.width).toBe(50);
      expect(canvas.height).toBe(38);
      expect(context.setTransform).toHaveBeenCalledWith(0.25, 0, 0, 0.25, 0, 0);
    });

    it('leaves a board drawn at its own size exactly as it was', () => {
      const { canvas, context } = createCanvasMock();

      new GridLineRender(canvas).render(4, 3, 50, GridType.SQUARE, '#000', '#000');

      expect(canvas.width).toBe(200);
      expect(canvas.height).toBe(150);
      expect(context.setTransform).not.toHaveBeenCalled();
    });
  });
});
