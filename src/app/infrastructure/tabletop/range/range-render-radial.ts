import { chkInCircle, chkOuterProduct } from '@axe/domain/tabletop/range-geometry';
import { ClipArea, RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  fillGridCells,
  makeBrush,
  markOrigin,
  notePainted,
  notePaintedCircle,
  rotatePoints,
} from '@axe/infrastructure/tabletop/range/range-render-util';

/**
 * Draws a circle range of radius `range` cells onto the grid and outline canvases.
 *
 * The grid canvas gets the cells whose centres fall inside, or the exact disc when `fillOutLine` is
 * set. The centre is marked with a small square while the range follows a character, otherwise a dot.
 * A circle needs no polygon clip, so nothing is returned.
 */
export function renderCircle(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): void {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  notePaintedCircle(setting, setting.range * gridSize);
  if (setting.fillOutLine) {
    makeBrush(context, gridSize, setting.gridColor);
    context.beginPath();
    context.arc(offSetX_px, offSetY_px, setting.range * gridSize, 0, 2 * Math.PI, true);
    context.fill();
  } else {
    const radius = setting.range * gridSize;
    fillGridCells(context, setting, offsets, (gcx, gcy) => chkInCircle(radius, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.arc(offSetX_px, offSetY_px, setting.range * gridSize, 0, 2 * Math.PI, true);
  context.stroke();

  markOrigin(context, offsets, setting.isDocking);
}

/**
 * Draws a cone range: a triangle from the origin out to `range` cells, `width` cells across at its far end.
 *
 * It is turned by `degree` and filled and outlined as the other shapes are. The clip returned runs a
 * margin round the cone, for cutting the range's element down to it.
 */
export function renderCorn(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipArea {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  const far = setting.range * gridSize;
  const half = 0.5 * setting.width * gridSize;
  const [c, p1, p2] = rotatePoints(
    [
      { x: 0, y: 0 },
      { x: far, y: -half },
      { x: far, y: half },
    ],
    setting.degree
  );
  notePainted(setting, [c, p1, p2]);

  // The clip, running clockwise from the foot of the cone: its root, up its near edge to the tip,
  // across the far end and back down the other edge.
  const clip = rotatePoints(
    [
      { x: -gridSize * 1.5, y: 0 },
      { x: -gridSize, y: -gridSize },
      { x: far - gridSize, y: -half - gridSize },
      { x: far, y: -half - gridSize },
      { x: far + gridSize, y: -half - gridSize },
      { x: far + gridSize, y: half + gridSize },
      { x: far, y: half + gridSize },
      { x: far - gridSize, y: half + gridSize },
      { x: -gridSize, y: gridSize },
    ],
    setting.degree
  );
  const { x: cx, y: cy } = c;
  const { x: p1x, y: p1y } = p1;
  const { x: p2x, y: p2y } = p2;

  if (setting.fillOutLine) {
    makeBrush(context, gridSize, setting.gridColor);
    context.beginPath();
    context.moveTo(cx + offSetX_px, cy + offSetY_px);
    context.lineTo(p1x + offSetX_px, p1y + offSetY_px);
    context.lineTo(p2x + offSetX_px, p2y + offSetY_px);
    context.lineTo(cx + offSetX_px, cy + offSetY_px);
    context.fill();
  } else {
    fillGridCells(
      context,
      setting,
      offsets,
      (gcx, gcy) =>
        chkOuterProduct(cx, cy, p1x, p1y, gcx, gcy) &&
        chkOuterProduct(p1x, p1y, p2x, p2y, gcx, gcy) &&
        chkOuterProduct(p2x, p2y, cx, cy, gcx, gcy)
    );
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(cx + offSetX_px, cy + offSetY_px);
  context.lineTo(p1x + offSetX_px, p1y + offSetY_px);
  context.lineTo(p2x + offSetX_px, p2y + offSetY_px);
  context.lineTo(cx + offSetX_px, cy + offSetY_px);
  context.stroke();

  markOrigin(context, offsets);

  return clip;
}
