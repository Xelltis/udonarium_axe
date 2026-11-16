import { CellGrid, gridExtentPx } from '@axe/domain/tabletop/fog/cell-grid';
import { overlayScale } from '@axe/infrastructure/tabletop/vision/vision-overlay-render';

/**
 * Sizes a canvas to the cells of a grid and clears it, answering the context to paint on in table
 * pixels, or null where the canvas gives none.
 *
 * The canvas is laid over the grid's extent on the board and drawn at the scale an overlay of that
 * size is allowed, so that what is painted in table pixels lands where the cells are. A caller that is
 * done painting puts the transform back with `context.setTransform(1, 0, 0, 1, 0, 0)`.
 */
export function fitCanvasToGrid(canvas: HTMLCanvasElement, grid: CellGrid): CanvasRenderingContext2D | null {
  const extent = gridExtentPx(grid);
  const width = Math.max(1, Math.ceil(extent.maxX - extent.minX));
  const height = Math.max(1, Math.ceil(extent.maxY - extent.minY));
  const scale = overlayScale(width, height);
  const pixelWidth = Math.max(1, Math.ceil(width * scale));
  const pixelHeight = Math.max(1, Math.ceil(height * scale));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  canvas.style.left = extent.minX + 'px';
  canvas.style.top = extent.minY + 'px';
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';

  const context = canvas.getContext('2d');
  if (!context) return null;
  context.setTransform(scale, 0, 0, scale, -extent.minX * scale, -extent.minY * scale);
  context.clearRect(extent.minX, extent.minY, width, height);
  return context;
}
