import { GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  hexVertices,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';
import { fillHexPath } from '@axe/infrastructure/tabletop/hex-canvas';
import { ClipArea, RangeRenderSetting, StrokeGridFunc } from '@axe/infrastructure/tabletop/range/range-render-types';

/** The css polygon a range's cell canvas is cut to, from the corners of its clip. */
export function clipAreaToPolygonCss(clip: ClipArea): string {
  return `polygon(${clip.map(({ x, y }) => `${x}px ${y}px`).join(', ')})`;
}

/** A point turned clockwise about the origin by so many degrees. */
export function rotatePoint(point: { x: number; y: number }, degree: number): { x: number; y: number } {
  const rad = (Math.PI / 180) * degree;
  const cosRad = Math.cos(rad);
  const sinRad = Math.sin(rad);
  return {
    x: point.x * cosRad - point.y * sinRad,
    y: point.x * sinRad + point.y * cosRad,
  };
}

/** Points turned clockwise about the origin by so many degrees; the same points when not turned at all. */
export function rotatePoints(points: { x: number; y: number }[], degree: number): { x: number; y: number }[] {
  if (degree === 0) return points;
  return points.map((point) => rotatePoint(point, degree));
}

/** How far a circle range is cut out to from its origin: its length plus half a cell of margin, in pixels. */
export function clipCircleRadiusPx(lengthCells: number, gridSize: number): number {
  return (lengthCells + 1.5) * gridSize;
}

/** A circle of the given length plus half a cell of margin. */
export function clipCircleCss(lengthCells: number, gridSize: number): string {
  return `circle(${clipCircleRadiusPx(lengthCells, gridSize)}px)`;
}

export interface GridOffsets {
  gridSize: number;
  gridOffX: number;
  gridOffY: number;
  offSetX_px: number;
  offSetY_px: number;
}

/**
 * How a range's canvas lines up with the table grid.
 *
 * The canvas origin sits at its middle, and the grid offset is how far the first grid line falls
 * behind the range's position, shifted half a cell on an axis the range is set to offset on.
 */
export function calcGridOffsets(setting: RangeRenderSetting): GridOffsets {
  const gridSize = setting.gridSize;
  const offSetX_px = (setting.areaWidth * gridSize) / 2;
  const offSetY_px = (setting.areaHeight * gridSize) / 2;

  let gridOffX = -(setting.centerX % gridSize);
  let gridOffY = -(setting.centerY % gridSize);
  if (gridOffX > 0) gridOffX -= gridSize;
  if (gridOffY > 0) gridOffY -= gridSize;

  if (setting.offSetX) {
    if (gridOffX < -0.5) {
      gridOffX += gridSize / 2;
    } else {
      gridOffX -= gridSize / 2;
    }
  }

  if (setting.offSetY) {
    if (gridOffY < -0.5) {
      gridOffY += gridSize / 2;
    } else {
      gridOffY -= gridSize / 2;
    }
  }

  return { gridSize, gridOffX, gridOffY, offSetX_px, offSetY_px };
}

/**
 * A function giving the pixel corner of the cell at column `w`, row `h` across a range's canvas.
 *
 * Hex grids shift every other column or row by half a cell, in step with where the range stands.
 */
export function generateCalcGridPositionFunc(
  gridType: GridType,
  centerX: number,
  centerY: number,
  areaWidth: number,
  areaHeight: number,
  gridSize: number
): StrokeGridFunc {
  switch (gridType) {
    case GridType.HEX_VERTICAL: {
      const isHalfSlideXLine = centerX % (gridSize * 2) < gridSize ? 1 : 0;
      const idAreaWidthMulti4 = areaWidth % 4 === 0 ? 1 : 0;
      const parity = isHalfSlideXLine + idAreaWidthMulti4;
      return (w, h) => ({
        gx: w * gridSize,
        gy: (w + parity) % 2 === 1 ? h * gridSize : h * gridSize + gridSize / 2,
      });
    }
    case GridType.HEX_HORIZONTAL: {
      const isHalfSlideYLine = centerY % (gridSize * 2) < gridSize ? 1 : 0;
      const idAreaHeightMulti4 = areaHeight % 4 === 0 ? 1 : 0;
      const parity = isHalfSlideYLine + idAreaHeightMulti4;
      return (w, h) => ({
        gx: (h + parity) % 2 === 1 ? w * gridSize : w * gridSize + gridSize / 2,
        gy: h * gridSize,
      });
    }
    default:
      return (w, h) => ({ gx: w * gridSize, gy: h * gridSize });
  }
}

/** How many corners a circle is noted with as painted, close enough to press by. */
const PAINTED_CIRCLE_CORNERS = 64;

/** Notes a polygon, in pixels from the range's origin, as painted, where the setting takes such notes. */
export function notePainted(setting: RangeRenderSetting, polygon: readonly { x: number; y: number }[]): void {
  setting.painted?.push(polygon.map(({ x, y }) => ({ x, y })));
}

/** Notes a circle about the range's origin as painted, as a polygon of many corners. */
export function notePaintedCircle(setting: RangeRenderSetting, radius: number): void {
  if (!setting.painted) return;
  notePainted(
    setting,
    Array.from({ length: PAINTED_CIRCLE_CORNERS }, (_, at) => {
      const angle = (at / PAINTED_CIRCLE_CORNERS) * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    })
  );
}

/**
 * Marks the origin of a range on its outline canvas, with the brush as it is: a small square while
 * the range follows a character, otherwise a dot.
 */
export function markOrigin(context: CanvasRenderingContext2D, offsets: GridOffsets, docking = false): void {
  const { offSetX_px, offSetY_px } = offsets;
  context.beginPath();
  if (docking) {
    context.strokeRect(offSetX_px - 6, offSetY_px - 6, 12, 12);
    return;
  }
  context.arc(offSetX_px, offSetY_px, 5, 0, 2 * Math.PI, true);
  context.fill();
}

/** Sets a canvas up to draw a range in one colour: stroke and fill, a 1px line, and a label font scaled to the grid. */
export function makeBrush(
  context: CanvasRenderingContext2D,
  gridSize: number,
  gridColor: string
): CanvasRenderingContext2D {
  context.strokeStyle = gridColor;
  context.fillStyle = context.strokeStyle;
  context.lineWidth = 1;
  const fontSize: number = Math.floor(gridSize / 5);
  context.font = `bold ${fontSize}px sans-serif`;
  context.textBaseline = 'top';
  context.textAlign = 'center';
  return context;
}

/** Fills one square grid cell whose top-left corner is at (gx, gy). */
export function fillSquare(context: CanvasRenderingContext2D, gx: number, gy: number, gridSize: number): void {
  context.fillRect(gx, gy, gridSize, gridSize);
}

/**
 * Fills the hexes of a range's canvas that the caller keeps, cell by cell across the table's grid.
 *
 * `keep` is given the cell's column and row, and where its centre lies relative to the origin of the
 * range in pixels, so a caller that knows its cells by number never has to look them up by point.
 */
export function fillHexCellsWhere(
  context: CanvasRenderingContext2D,
  setting: RangeRenderSetting,
  keep: (col: number, row: number, gcx: number, gcy: number) => boolean
): void {
  const gridSize = setting.gridSize;
  const s = hexCircumradius(gridSize);
  const isFlatTop = isFlatTopGrid(setting.gridType);

  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);

  const canvasW = setting.areaWidth * gridSize;
  const canvasH = setting.areaHeight * gridSize;
  const offsetX = canvasW / 2;
  const offsetY = canvasH / 2;

  const cx0 = setting.centerX;
  const cy0 = setting.centerY;

  const colMin = Math.floor((cx0 - canvasW / 2) / colSpacing) - 1;
  const colMax = Math.ceil((cx0 + canvasW / 2) / colSpacing) + 1;
  const rowMin = Math.floor((cy0 - canvasH / 2) / rowSpacing) - 1;
  const rowMax = Math.ceil((cy0 + canvasH / 2) / rowSpacing) + 1;

  makeBrush(context, gridSize, setting.gridColor);
  const startAngle = hexStartAngle(isFlatTop);

  for (let col = colMin; col <= colMax; col++) {
    for (let row = rowMin; row <= rowMax; row++) {
      const { x: hx, y: hy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);

      const gcx = hx - cx0;
      const gcy = hy - cy0;

      if (keep(col, row, gcx, gcy)) {
        fillHexPath(context, gcx + offsetX, gcy + offsetY, s, startAngle);
        if (setting.painted) notePainted(setting, hexVertices(gcx, gcy, s, startAngle));
      }
    }
  }
}

/** @param hitTest the point relative to the origin of the range, in pixels. */
function fillHexGridCells(
  context: CanvasRenderingContext2D,
  setting: RangeRenderSetting,
  hitTest: (gcx: number, gcy: number) => boolean
): void {
  fillHexCellsWhere(context, setting, (_col, _row, gcx, gcy) => hitTest(gcx, gcy));
}

/** @param hitTest the point relative to the origin of the range, in pixels. */
function fillSquareGridCells(
  context: CanvasRenderingContext2D,
  setting: RangeRenderSetting,
  offsets: GridOffsets,
  hitTest: (gcx: number, gcy: number) => boolean
): void {
  const { gridSize, gridOffX, gridOffY, offSetX_px, offSetY_px } = offsets;
  const calcGridPosition = generateCalcGridPositionFunc(
    setting.gridType,
    setting.centerX,
    setting.centerY,
    setting.areaWidth,
    setting.areaHeight,
    gridSize
  );
  makeBrush(context, gridSize, setting.gridColor);
  const adjX = gridOffX + gridSize / 2 - offSetX_px;
  const adjY = gridOffY + gridSize / 2 - offSetY_px;
  for (let h = 0; h <= setting.areaHeight + 1; h++) {
    for (let w = 0; w <= setting.areaWidth + 1; w++) {
      const { gx, gy } = calcGridPosition(w, h);
      if (hitTest(gx + adjX, gy + adjY)) {
        fillSquare(context, gx + gridOffX, gy + gridOffY, gridSize);
        if (setting.painted) {
          const left = gx + gridOffX - offSetX_px;
          const top = gy + gridOffY - offSetY_px;
          notePainted(setting, [
            { x: left, y: top },
            { x: left + gridSize, y: top },
            { x: left + gridSize, y: top + gridSize },
            { x: left, y: top + gridSize },
          ]);
        }
      }
    }
  }
}

/** @param hitTest the point relative to the origin of the range, in pixels. */
export function fillGridCells(
  context: CanvasRenderingContext2D,
  setting: RangeRenderSetting,
  offsets: GridOffsets,
  hitTest: (gcx: number, gcy: number) => boolean
): void {
  if (isHexGrid(setting.gridType)) {
    fillHexGridCells(context, setting, hitTest);
  } else {
    fillSquareGridCells(context, setting, offsets, hitTest);
  }
}
