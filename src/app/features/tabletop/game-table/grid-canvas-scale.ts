import { LONGEST_PICTURE_PX } from '@axe/infrastructure/table-3d/table-3d-port';
import {
  LIGHT_MIN_OVERLAY_SCALE,
  LIGHT_OVERLAY_PIXEL_BUDGET,
  overlayScale,
} from '@axe/infrastructure/tabletop/vision/vision-overlay-render';

/**
 * How large the page draws a board's grid on its canvas, as a share of the board's own size. A board
 * is drawn pixel for pixel, but no longer than the graphics card takes a picture, which a board of a
 * hundred cells of 256 pixels is many times over, and which the browser would not even make a canvas
 * of; and drawn the lighter way, to a canvas the machine can carry.
 */
export function gridCanvasScale(boardWidthPx: number, boardHeightPx: number, lightly: boolean): number {
  const fitted = Math.min(1, LONGEST_PICTURE_PX / Math.max(1, boardWidthPx, boardHeightPx));
  const light = lightly
    ? overlayScale(boardWidthPx, boardHeightPx, LIGHT_OVERLAY_PIXEL_BUDGET, LIGHT_MIN_OVERLAY_SCALE)
    : 1;
  return Math.min(fitted, light);
}
