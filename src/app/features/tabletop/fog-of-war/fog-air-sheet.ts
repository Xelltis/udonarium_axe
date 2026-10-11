import { OverlayVision } from '@axe/domain/tabletop/vision-scene';
import { FogAirLayer } from '@axe/features/tabletop/fog-of-war/fog-air-layers';
import { fogPattern } from '@axe/features/tabletop/table-vision-overlay/fog-texture';
import { fillUnwalkedCells } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';

/** How wide a sheet is drawn, in pixels of its own, before it is let up to the size of the board. */
const SHEET_TARGET_PX = 512;
/** How far past the board a sheet reaches, as a share of it, so its drift never uncovers an edge. */
export const FOG_AIR_SHEET_MARGIN = 0.06;
/** How much of a sheet the ground it stands for is worth, against the mottling over it. */
const SHEET_WASH = 0.55;
const SHEET_BLUR_CELLS = 0.6;

/**
 * Paints one sheet of fog in the air: a wash and a mottle over the ground nobody has walked to,
 * drawn small for the board and its margin, to be let up to their size. Each sheet takes the
 * mottle from its own corner, so the sheets of a stack do not read as one picture seen again.
 */
export function paintFogAirSheet(
  canvas: HTMLCanvasElement,
  vision: OverlayVision,
  gridSizePx: number,
  index: number
): void {
  const grid = vision.grid;
  const context = canvas.getContext('2d');
  if (!context || grid.cols < 1 || grid.rows < 1) return;

  const boardWidth = grid.cols * gridSizePx;
  const boardHeight = grid.rows * gridSizePx;
  const longest = Math.max(boardWidth, boardHeight);
  const scale = Math.min(1, SHEET_TARGET_PX / longest);
  const marginX = boardWidth * FOG_AIR_SHEET_MARGIN;
  const marginY = boardHeight * FOG_AIR_SHEET_MARGIN;
  const width = Math.max(1, Math.ceil((boardWidth + marginX * 2) * scale));
  const height = Math.max(1, Math.ceil((boardHeight + marginY * 2) * scale));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  context.setTransform(scale, 0, 0, scale, marginX * scale, marginY * scale);
  context.clearRect(-marginX, -marginY, boardWidth + marginX * 2, boardHeight + marginY * 2);
  context.globalCompositeOperation = 'source-over';

  // Only over ground nobody has walked to. Once it is cleared the mist is gone from it,
  // in the air as well as on the floor.
  const blurPx = SHEET_BLUR_CELLS * gridSizePx;

  context.fillStyle = vision.fogColor;
  context.globalAlpha = SHEET_WASH;
  fillUnwalkedCells(context, vision, blurPx);

  const pattern = fogPattern(context);
  if (pattern) {
    shiftPattern(pattern, index * 137, index * 91);
    context.fillStyle = pattern;
    context.globalAlpha = 1;
    fillUnwalkedCells(context, vision, blurPx);
  }
  context.globalAlpha = 1;
  context.setTransform(1, 0, 0, 1, 0, 0);
}

/** How a sheet drifts and how thick it is, as the styles its canvas is drawn with. */
export function fogAirDriftStyle(layer: FogAirLayer): Record<string, string> {
  return {
    opacity: layer.alpha.toFixed(3),
    'animation-name': 'fogDrift',
    'animation-duration': layer.durationSec + 's',
    'animation-delay': layer.delaySec + 's',
    'animation-timing-function': 'ease-in-out',
    'animation-iteration-count': 'infinite',
    'animation-direction': 'alternate',
  };
}

function shiftPattern(pattern: CanvasPattern, dx: number, dy: number): void {
  if (typeof pattern.setTransform !== 'function' || typeof DOMMatrix !== 'function') return;
  pattern.setTransform(new DOMMatrix().translate(dx, dy));
}
