import { ClipAreaCorn, RangeRenderSetting } from '@axe/features/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  chkOuterProduct,
  fillGridCells,
  makeBrush,
} from '@axe/features/tabletop/range/range-render-util';

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

  if (setting.fillOutLine) {
    makeBrush(context, gridSize, setting.gridColor);
    context.beginPath();
    context.arc(offSetX_px, offSetY_px, setting.range * gridSize, 0, 2 * Math.PI, true);
    context.fill();
  } else {
    const radiusSq = (setting.range * gridSize) ** 2;
    fillGridCells(context, setting, offsets, (gcx, gcy) => radiusSq >= gcx * gcx + gcy * gcy);
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.arc(offSetX_px, offSetY_px, setting.range * gridSize, 0, 2 * Math.PI, true);
  context.stroke();

  if (setting.isDocking) {
    context.beginPath();
    context.strokeRect(offSetX_px - 6, offSetY_px - 6, 12, 12);
  } else {
    context.beginPath();
    context.arc(offSetX_px, offSetX_px, 5, 0, 2 * Math.PI, true);
    context.fill();
  }
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
): ClipAreaCorn {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  const cx_ = 0.0;
  const cy_ = 0.0;
  const p1x_ = setting.range * gridSize;
  const p1y_ = -0.5 * setting.width * gridSize;
  const p2x_ = setting.range * gridSize;
  const p2y_ = 0.5 * setting.width * gridSize;

  // the clip, running clockwise from the foot of the cone
  const clip01x_ = cx_ - gridSize * 1.5;
  const clip01y_ = cy_;
  const clip02x_ = cx_ - gridSize * 1.0;
  const clip02y_ = cy_ - gridSize * 1.0;
  const clip03x_ = p1x_ - gridSize * 1.0;
  const clip03y_ = p1y_ - gridSize * 1.0;
  const clip04x_ = p1x_;
  const clip04y_ = p1y_ - gridSize * 1.0;
  const clip05x_ = p1x_ + gridSize * 1.0;
  const clip05y_ = p1y_ - gridSize * 1.0;
  const clip06x_ = clip05x_;
  const clip06y_ = -clip05y_;
  const clip07x_ = clip04x_;
  const clip07y_ = -clip04y_;
  const clip08x_ = clip03x_;
  const clip08y_ = -clip03y_;
  const clip09x_ = clip02x_;
  const clip09y_ = -clip02y_;

  const rad = (Math.PI / 180) * setting.degree;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);
  const cx = cx_;
  const cy = cy_;
  const p1x = p1x_ * cosRad - p1y_ * sinRad;
  const p1y = p1x_ * sinRad + p1y_ * cosRad;
  const p2x = p2x_ * cosRad - p2y_ * sinRad;
  const p2y = p2x_ * sinRad + p2y_ * cosRad;

  const clip: ClipAreaCorn = {
    clip01x: clip01x_ * cosRad - clip01y_ * sinRad, // 根本始点
    clip01y: clip01x_ * sinRad + clip01y_ * cosRad,
    clip02x: clip02x_ * cosRad - clip02y_ * sinRad,
    clip02y: clip02x_ * sinRad + clip02y_ * cosRad,
    clip03x: clip03x_ * cosRad - clip03y_ * sinRad,
    clip03y: clip03x_ * sinRad + clip03y_ * cosRad,
    clip04x: clip04x_ * cosRad - clip04y_ * sinRad,
    clip04y: clip04x_ * sinRad + clip04y_ * cosRad,
    clip05x: clip05x_ * cosRad - clip05y_ * sinRad, // 先端部
    clip05y: clip05x_ * sinRad + clip05y_ * cosRad,
    clip06x: clip06x_ * cosRad - clip06y_ * sinRad, // 折り返し
    clip06y: clip06x_ * sinRad + clip06y_ * cosRad,
    clip07x: clip07x_ * cosRad - clip07y_ * sinRad,
    clip07y: clip07x_ * sinRad + clip07y_ * cosRad,
    clip08x: clip08x_ * cosRad - clip08y_ * sinRad,
    clip08y: clip08x_ * sinRad + clip08y_ * cosRad,
    clip09x: clip09x_ * cosRad - clip09y_ * sinRad,
    clip09y: clip09x_ * sinRad + clip09y_ * cosRad,
  };

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

  context.beginPath();
  context.arc(offSetX_px, offSetX_px, 5, 0, 2 * Math.PI, true);
  context.fill();

  return clip;
}
