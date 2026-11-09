import { gridCanvasScale } from '@axe/features/tabletop/game-table/grid-canvas-scale';
import { LONGEST_PICTURE_PX } from '@axe/infrastructure/table-3d/table-3d-port';

describe('how large the page draws a board’s grid', () => {
  it('draws a board of the usual size pixel for pixel', () => {
    expect(gridCanvasScale(32 * 50, 20 * 50, false)).toBe(1);
  });

  it('draws a board of a hundred cells of 256 pixels no longer than the graphics card takes a picture', () => {
    const scale = gridCanvasScale(100 * 256, 100 * 256, false);

    expect(100 * 256 * scale).toBeLessThanOrEqual(LONGEST_PICTURE_PX);
    expect(100 * 256 * scale).toBeGreaterThan(LONGEST_PICTURE_PX - 1);
  });

  it('draws smaller still the lighter way, where the machine cannot carry that much', () => {
    expect(gridCanvasScale(100 * 60, 100 * 60, false)).toBe(1);
    expect(gridCanvasScale(100 * 60, 100 * 60, true)).toBeLessThan(1);
  });
});
