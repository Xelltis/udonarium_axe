import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { fitCanvasToGrid } from '@axe/ui/tabletop/fit-canvas-to-grid';

describe('fitCanvasToGrid', () => {
  afterEach(() => vi.restoreAllMocks());

  function contextSpy(): { setTransform: ReturnType<typeof vi.fn>; clearRect: ReturnType<typeof vi.fn> } {
    const context = { setTransform: vi.fn(), clearRect: vi.fn() };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as RenderingContext);
    return context;
  }

  it('lays the canvas over the cells of a square grid, drawn in table pixels, and clears it', () => {
    const context = contextSpy();
    const canvas = document.createElement('canvas');

    const fitted = fitCanvasToGrid(canvas, cellGridOf(4, 3, 50, GridType.SQUARE));

    expect(fitted).toBe(context);
    expect([canvas.width, canvas.height]).toEqual([200, 150]);
    expect([canvas.style.left, canvas.style.top, canvas.style.width, canvas.style.height]).toEqual([
      '0px',
      '0px',
      '200px',
      '150px',
    ]);
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, -0, -0);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 200, 150);
  });

  it('draws a wide board smaller than its pixels, keeping the painting in table pixels', () => {
    const context = contextSpy();
    const canvas = document.createElement('canvas');

    fitCanvasToGrid(canvas, cellGridOf(200, 200, 50, GridType.SQUARE));

    expect(canvas.width).toBeLessThan(10000);
    expect(canvas.style.width).toBe('10000px');
    const [scale] = context.setTransform.mock.calls[0] as number[];
    expect(scale).toBeLessThan(1);
    expect(canvas.width).toBe(Math.ceil(10000 * scale));
  });

  it('answers nothing, having sized the canvas, where the canvas gives no context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = document.createElement('canvas');

    expect(fitCanvasToGrid(canvas, cellGridOf(2, 2, 50, GridType.SQUARE))).toBeNull();
    expect(canvas.width).toBe(100);
  });
});
