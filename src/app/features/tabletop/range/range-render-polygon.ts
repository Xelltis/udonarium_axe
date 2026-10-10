import {
  ClipAreaHexagon,
  ClipAreaLine,
  ClipAreaPentagon,
  ClipAreaSquare,
  ClipAreaTriangle,
  RangeRenderSetting,
} from '@axe/features/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  chkOuterProduct,
  fillGridCells,
  makeBrush,
} from '@axe/features/tabletop/range/range-render-util';

type Point = { x: number; y: number };

function rotatePoint(point: Point, degree: number): Point {
  const rad = (Math.PI / 180) * degree;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);
  return {
    x: point.x * cosRad - point.y * sinRad,
    y: point.x * sinRad + point.y * cosRad,
  };
}

function rotatePoints(points: Point[], degree: number): Point[] {
  if (degree === 0) return points;
  return points.map((point) => rotatePoint(point, degree));
}

/**
 * Draws a line range: a band `width` cells wide running `range` cells out from the origin at `degree`.
 *
 * The grid canvas is filled with the covered cells, or with the exact band when `fillOutLine` is set,
 * and the outline canvas gets the band's edge and an origin dot. The clip returned reaches a cell
 * beyond the band, for cutting the range's element down to it.
 */
export function renderLine(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipAreaLine {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  const p1x_ = 0;
  const p1y_ = 0.5 * setting.width * gridSize;
  const p2x_ = 0;
  const p2y_ = -0.5 * setting.width * gridSize;
  const p3x_ = setting.range * gridSize;
  const p3y_ = -0.5 * setting.width * gridSize;
  const p4x_ = setting.range * gridSize;
  const p4y_ = 0.5 * setting.width * gridSize;

  const clip01x_ = p1x_ - gridSize * 1.0;
  const clip01y_ = p1y_ + gridSize * 1.0;
  const clip02x_ = p2x_ - gridSize * 1.0;
  const clip02y_ = p2y_ - gridSize * 1.0;
  const clip03x_ = p3x_ + gridSize * 1.0;
  const clip03y_ = p3y_ - gridSize * 1.0;
  const clip04x_ = p4x_ + gridSize * 1.0;
  const clip04y_ = p4y_ + gridSize * 1.0;

  const rad = (Math.PI / 180) * setting.degree;
  const p1x = p1x_ * Math.cos(rad) - p1y_ * Math.sin(rad);
  const p1y = p1x_ * Math.sin(rad) + p1y_ * Math.cos(rad);
  const p2x = p2x_ * Math.cos(rad) - p2y_ * Math.sin(rad);
  const p2y = p2x_ * Math.sin(rad) + p2y_ * Math.cos(rad);
  const p3x = p3x_ * Math.cos(rad) - p3y_ * Math.sin(rad);
  const p3y = p3x_ * Math.sin(rad) + p3y_ * Math.cos(rad);
  const p4x = p4x_ * Math.cos(rad) - p4y_ * Math.sin(rad);
  const p4y = p4x_ * Math.sin(rad) + p4y_ * Math.cos(rad);

  const clip: ClipAreaLine = {
    clip01x: clip01x_ * Math.cos(rad) - clip01y_ * Math.sin(rad),
    clip01y: clip01x_ * Math.sin(rad) + clip01y_ * Math.cos(rad),
    clip02x: clip02x_ * Math.cos(rad) - clip02y_ * Math.sin(rad),
    clip02y: clip02x_ * Math.sin(rad) + clip02y_ * Math.cos(rad),
    clip03x: clip03x_ * Math.cos(rad) - clip03y_ * Math.sin(rad),
    clip03y: clip03x_ * Math.sin(rad) + clip03y_ * Math.cos(rad),
    clip04x: clip04x_ * Math.cos(rad) - clip04y_ * Math.sin(rad),
    clip04y: clip04x_ * Math.sin(rad) + clip04y_ * Math.cos(rad),
  };

  makeBrush(context, gridSize, setting.gridColor);

  if (setting.fillOutLine) {
    context.beginPath();
    context.moveTo(p1x + offSetX_px, p1y + offSetY_px);
    context.lineTo(p2x + offSetX_px, p2y + offSetY_px);
    context.lineTo(p3x + offSetX_px, p3y + offSetY_px);
    context.lineTo(p4x + offSetX_px, p4y + offSetY_px);
    context.lineTo(p1x + offSetX_px, p1y + offSetY_px);
    context.fill();
  } else {
    fillGridCells(
      context,
      setting,
      offsets,
      (gcx, gcy) =>
        chkOuterProduct(p1x, p1y, p2x, p2y, gcx, gcy) &&
        chkOuterProduct(p2x, p2y, p3x, p3y, gcx, gcy) &&
        chkOuterProduct(p3x, p3y, p4x, p4y, gcx, gcy) &&
        chkOuterProduct(p4x, p4y, p1x, p1y, gcx, gcy)
    );
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(p1x + offSetX_px, p1y + offSetY_px);
  context.lineTo(p2x + offSetX_px, p2y + offSetY_px);
  context.lineTo(p3x + offSetX_px, p3y + offSetY_px);
  context.lineTo(p4x + offSetX_px, p4y + offSetY_px);
  context.lineTo(p1x + offSetX_px, p1y + offSetY_px);
  context.stroke();

  context.beginPath();
  context.arc(offSetX_px, offSetX_px, 5, 0, 2 * Math.PI, true);
  context.fill();

  return clip;
}

/**
 * Draws a square range reaching `range` cells from its centre each way, turned by `degree`.
 *
 * Fills and outlines as a line does; the centre is marked with a small square instead of a dot while
 * the range follows a character. The clip returned reaches a cell beyond the square.
 */
export function renderSquare(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipAreaSquare {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  const p = rotatePoints(
    [
      { x: -setting.range * gridSize, y: setting.range * gridSize },
      { x: -setting.range * gridSize, y: -setting.range * gridSize },
      { x: setting.range * gridSize, y: -setting.range * gridSize },
      { x: setting.range * gridSize, y: setting.range * gridSize },
    ],
    setting.degree
  );
  const [p1, p2, p3, p4] = p;

  const clipPoints = rotatePoints(
    [
      { x: -setting.range * gridSize - gridSize * 1.0, y: setting.range * gridSize + gridSize * 1.0 },
      { x: -setting.range * gridSize - gridSize * 1.0, y: -setting.range * gridSize - gridSize * 1.0 },
      { x: setting.range * gridSize + gridSize * 1.0, y: -setting.range * gridSize - gridSize * 1.0 },
      { x: setting.range * gridSize + gridSize * 1.0, y: setting.range * gridSize + gridSize * 1.0 },
    ],
    setting.degree
  );

  const clip: ClipAreaSquare = {
    clip01x: clipPoints[0].x,
    clip01y: clipPoints[0].y,
    clip02x: clipPoints[1].x,
    clip02y: clipPoints[1].y,
    clip03x: clipPoints[2].x,
    clip03y: clipPoints[2].y,
    clip04x: clipPoints[3].x,
    clip04y: clipPoints[3].y,
  };

  makeBrush(context, gridSize, setting.gridColor);

  if (setting.fillOutLine) {
    context.beginPath();
    context.moveTo(p1.x + offSetX_px, p1.y + offSetY_px);
    context.lineTo(p2.x + offSetX_px, p2.y + offSetY_px);
    context.lineTo(p3.x + offSetX_px, p3.y + offSetY_px);
    context.lineTo(p4.x + offSetX_px, p4.y + offSetY_px);
    context.lineTo(p1.x + offSetX_px, p1.y + offSetY_px);
    context.fill();
  } else {
    fillGridCells(context, setting, offsets, (gcx, gcy) => insideConvexPolygon(p, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(p1.x + offSetX_px, p1.y + offSetY_px);
  context.lineTo(p2.x + offSetX_px, p2.y + offSetY_px);
  context.lineTo(p3.x + offSetX_px, p3.y + offSetY_px);
  context.lineTo(p4.x + offSetX_px, p4.y + offSetY_px);
  context.lineTo(p1.x + offSetX_px, p1.y + offSetY_px);
  context.stroke();

  if (setting.isDocking) {
    context.beginPath();
    context.strokeRect(offSetX_px - 6, offSetY_px - 6, 12, 12);
  } else {
    context.beginPath();
    context.arc(offSetX_px, offSetX_px, 5, 0, 2 * Math.PI, true);
    context.fill();
  }

  return clip;
}

function regularPolygonVertices(n: number, radius: number, degree: number): Point[] {
  const verts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = (((360 / n) * i - 90 + degree) * Math.PI) / 180;
    verts.push({ x: Math.cos(a) * radius, y: Math.sin(a) * radius });
  }
  return verts;
}

function insideConvexPolygon(verts: Point[], gcx: number, gcy: number): boolean {
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!chkOuterProduct(a.x, a.y, b.x, b.y, gcx, gcy)) return false;
  }
  return true;
}

/**
 * Draws a regular triangle range whose corners lie `range` cells from its centre, turned by `degree`.
 *
 * Fills and outlines as a line does. The clip returned is the triangle grown by a fifth.
 */
export function renderTriangle(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipAreaTriangle {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context = canvasElement.getContext('2d')!;

  const r = setting.range * gridSize;
  const verts = regularPolygonVertices(3, r, setting.degree);

  const clip: ClipAreaTriangle = {
    clip01x: verts[0].x * 1.2,
    clip01y: verts[0].y * 1.2,
    clip02x: verts[1].x * 1.2,
    clip02y: verts[1].y * 1.2,
    clip03x: verts[2].x * 1.2,
    clip03y: verts[2].y * 1.2,
  };

  makeBrush(context, gridSize, setting.gridColor);
  if (setting.fillOutLine) {
    context.beginPath();
    context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
    for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
    context.closePath();
    context.fill();
  } else {
    fillGridCells(context, setting, offsets, (gcx, gcy) => insideConvexPolygon(verts, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;
  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
  for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.arc(offSetX_px, offSetY_px, 5, 0, 2 * Math.PI, true);
  context.fill();

  return clip;
}

/**
 * Draws a regular pentagon range whose corners lie `range` cells from its centre, turned by `degree`.
 *
 * Fills and outlines as a line does. The clip returned is the pentagon grown by a fifth.
 */
export function renderPentagon(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipAreaPentagon {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context = canvasElement.getContext('2d')!;

  const r = setting.range * gridSize;
  const verts = regularPolygonVertices(5, r, setting.degree);

  const clip: ClipAreaPentagon = {
    clip01x: verts[0].x * 1.2,
    clip01y: verts[0].y * 1.2,
    clip02x: verts[1].x * 1.2,
    clip02y: verts[1].y * 1.2,
    clip03x: verts[2].x * 1.2,
    clip03y: verts[2].y * 1.2,
    clip04x: verts[3].x * 1.2,
    clip04y: verts[3].y * 1.2,
    clip05x: verts[4].x * 1.2,
    clip05y: verts[4].y * 1.2,
  };

  makeBrush(context, gridSize, setting.gridColor);
  if (setting.fillOutLine) {
    context.beginPath();
    context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
    for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
    context.closePath();
    context.fill();
  } else {
    fillGridCells(context, setting, offsets, (gcx, gcy) => insideConvexPolygon(verts, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;
  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
  for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.arc(offSetX_px, offSetY_px, 5, 0, 2 * Math.PI, true);
  context.fill();

  return clip;
}

/**
 * Draws a regular hexagon range whose corners lie `range` cells from its centre, turned by `degree`.
 *
 * Fills and outlines as a line does. The clip returned is the hexagon grown by a fifth.
 */
export function renderHexagon(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipAreaHexagon {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context = canvasElement.getContext('2d')!;

  const r = setting.range * gridSize;
  const verts = regularPolygonVertices(6, r, setting.degree);

  const clip: ClipAreaHexagon = {
    clip01x: verts[0].x * 1.2,
    clip01y: verts[0].y * 1.2,
    clip02x: verts[1].x * 1.2,
    clip02y: verts[1].y * 1.2,
    clip03x: verts[2].x * 1.2,
    clip03y: verts[2].y * 1.2,
    clip04x: verts[3].x * 1.2,
    clip04y: verts[3].y * 1.2,
    clip05x: verts[4].x * 1.2,
    clip05y: verts[4].y * 1.2,
    clip06x: verts[5].x * 1.2,
    clip06y: verts[5].y * 1.2,
  };

  makeBrush(context, gridSize, setting.gridColor);
  if (setting.fillOutLine) {
    context.beginPath();
    context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
    for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
    context.closePath();
    context.fill();
  } else {
    fillGridCells(context, setting, offsets, (gcx, gcy) => insideConvexPolygon(verts, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;
  makeBrush(context, gridSize, setting.rangeColor);
  context.beginPath();
  context.lineWidth = 2;
  context.moveTo(verts[0].x + offSetX_px, verts[0].y + offSetY_px);
  for (let i = 1; i < verts.length; i++) context.lineTo(verts[i].x + offSetX_px, verts[i].y + offSetY_px);
  context.closePath();
  context.stroke();
  context.beginPath();
  context.arc(offSetX_px, offSetY_px, 5, 0, 2 * Math.PI, true);
  context.fill();

  return clip;
}
