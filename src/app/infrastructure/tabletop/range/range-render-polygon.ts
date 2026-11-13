import { insideConvexPolygon } from '@axe/domain/tabletop/range-geometry';
import { ClipArea, RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  fillGridCells,
  makeBrush,
  markOrigin,
  notePainted,
  rotatePoints,
} from '@axe/infrastructure/tabletop/range/range-render-util';

type Point = { x: number; y: number };

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
): ClipArea {
  const g = setting.gridSize;
  const half = 0.5 * setting.width * g;
  const far = setting.range * g;
  return renderConvexPolygon(
    canvasElement,
    canvasElementRange,
    setting,
    [
      { x: 0, y: half },
      { x: 0, y: -half },
      { x: far, y: -half },
      { x: far, y: half },
    ],
    [
      { x: -g, y: half + g },
      { x: -g, y: -half - g },
      { x: far + g, y: -half - g },
      { x: far + g, y: half + g },
    ],
    false
  );
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
): ClipArea {
  const r = setting.range * setting.gridSize;
  const g = setting.gridSize;
  return renderConvexPolygon(
    canvasElement,
    canvasElementRange,
    setting,
    [
      { x: -r, y: r },
      { x: -r, y: -r },
      { x: r, y: -r },
      { x: r, y: r },
    ],
    [
      { x: -r - g, y: r + g },
      { x: -r - g, y: -r - g },
      { x: r + g, y: -r - g },
      { x: r + g, y: r + g },
    ],
    setting.isDocking
  );
}

/**
 * Draws a diamond range: the cells a walk of `range` cells reaches from its centre, counting no
 * diagonals, so its corners stand `range` cells up, down, left and right, turned by `degree`.
 *
 * Fills and outlines as a square does. The clip returned reaches a little over a cell beyond each
 * corner, which takes in the whole of every cell along the edges.
 */
export function renderDiamond(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting
): ClipArea {
  const r = setting.range * setting.gridSize;
  const reach = r + setting.gridSize * 1.2;
  return renderConvexPolygon(
    canvasElement,
    canvasElementRange,
    setting,
    [
      { x: -r, y: 0 },
      { x: 0, y: -r },
      { x: r, y: 0 },
      { x: 0, y: r },
    ],
    [
      { x: -reach, y: 0 },
      { x: 0, y: -reach },
      { x: reach, y: 0 },
      { x: 0, y: reach },
    ],
    setting.isDocking
  );
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
): ClipArea {
  return renderRegularPolygon(canvasElement, canvasElementRange, setting, 3);
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
): ClipArea {
  return renderRegularPolygon(canvasElement, canvasElementRange, setting, 5);
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
): ClipArea {
  return renderRegularPolygon(canvasElement, canvasElementRange, setting, 6);
}

/** How much larger than a regular polygon its clip is. */
const REGULAR_CLIP_GROWTH = 1.2;

/**
 * Draws a regular range of `n` corners lying `range` cells from its centre, the first straight up
 * before the turn by `degree`, with its clip the same shape grown by a fifth and its origin a dot.
 */
function renderRegularPolygon(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting,
  n: number
): ClipArea {
  const corners = regularPolygonVertices(n, setting.range * setting.gridSize, setting.degree);
  const clipCorners = corners.map(({ x, y }) => ({ x: x * REGULAR_CLIP_GROWTH, y: y * REGULAR_CLIP_GROWTH }));
  return renderConvexPolygon(canvasElement, canvasElementRange, setting, corners, clipCorners, false, 0);
}

/**
 * Draws a convex range whose corners, and the corners of the clip around it, are given clockwise
 * about its centre, turned by `degree` unless already turned.
 *
 * The grid canvas is filled with the cells whose centres fall inside, or with the exact shape when
 * `fillOutLine` is set; the outline canvas gets the shape's edge and the origin, marked with a
 * small square when `docking` or a dot otherwise.
 */
function renderConvexPolygon(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting,
  corners: Point[],
  clipCorners: Point[],
  docking: boolean,
  degree = setting.degree
): ClipArea {
  const offsets = calcGridOffsets(setting);
  const { gridSize, offSetX_px, offSetY_px } = offsets;

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  let context: CanvasRenderingContext2D = canvasElement.getContext('2d')!;

  const points = rotatePoints(corners, degree);
  notePainted(setting, points);
  const clip = rotatePoints(clipCorners, degree);

  const trace = () => {
    context.beginPath();
    context.moveTo(points[0].x + offSetX_px, points[0].y + offSetY_px);
    for (let i = 1; i < points.length; i++) context.lineTo(points[i].x + offSetX_px, points[i].y + offSetY_px);
    context.closePath();
  };

  makeBrush(context, gridSize, setting.gridColor);
  if (setting.fillOutLine) {
    trace();
    context.fill();
  } else {
    fillGridCells(context, setting, offsets, (gcx, gcy) => insideConvexPolygon(points, gcx, gcy));
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  context = canvasElementRange.getContext('2d')!;

  makeBrush(context, gridSize, setting.rangeColor);
  context.lineWidth = 2;
  trace();
  context.stroke();

  markOrigin(context, offsets, docking);

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
