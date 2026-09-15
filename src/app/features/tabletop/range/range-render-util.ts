import { GridType } from '@axe/domain/tabletop/game-table';
import {
  fillHexPath,
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  isHexGrid as isHexGridType,
} from '@axe/domain/tabletop/hex-geometry';
import {
  ClipAreaCorn,
  ClipAreaHexagon,
  ClipAreaLine,
  ClipAreaPentagon,
  ClipAreaSquare,
  ClipAreaTriangle,
  GridPosition,
  RangeRenderSetting,
  StrokeGridFunc,
} from '@axe/features/tabletop/range/range-render-types';

type ClipArea = ClipAreaLine | ClipAreaSquare | ClipAreaTriangle | ClipAreaPentagon | ClipAreaHexagon | ClipAreaCorn;

/** Turns the numbered clip fields into a css polygon, stopping at the first gap. Three points to nine. */
export function clipAreaToPolygonCss(clip: ClipArea): string {
  // The clip interfaces carry no index signature, so they are read through a record.
  const c = clip as unknown as Record<string, number>;
  const points: string[] = [];
  for (let i = 1; ; i++) {
    const key = `clip${i.toString().padStart(2, '0')}`;
    const x = c[`${key}x`];
    const y = c[`${key}y`];
    if (typeof x !== 'number' || typeof y !== 'number') break;
    points.push(`${x}px ${y}px`);
  }
  return `polygon(${points.join(', ')})`;
}

/** A circle of the given length plus half a cell of margin. */
export function clipCircleCss(lengthCells: number, gridSize: number): string {
  return `circle(${(lengthCells + 1.5) * gridSize}px)`;
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

// A shared buffer, so the hot loop allocates nothing. Safe on a single thread.
const _gridPos: GridPosition = { gx: 0, gy: 0 };

/**
 * A function giving the pixel corner of the cell at column `w`, row `h` across a range's canvas.
 *
 * Hex grids shift every other column or row by half a cell, in step with where the range stands.
 * The returned position is one shared object overwritten on each call, so read it before calling again.
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
      return (w, h) => {
        _gridPos.gx = w * gridSize;
        _gridPos.gy = (w + parity) % 2 === 1 ? h * gridSize : h * gridSize + gridSize / 2;
        return _gridPos;
      };
    }
    case GridType.HEX_HORIZONTAL: {
      const isHalfSlideYLine = centerY % (gridSize * 2) < gridSize ? 1 : 0;
      const idAreaHeightMulti4 = areaHeight % 4 === 0 ? 1 : 0;
      const parity = isHalfSlideYLine + idAreaHeightMulti4;
      return (w, h) => {
        _gridPos.gx = (h + parity) % 2 === 1 ? w * gridSize : w * gridSize + gridSize / 2;
        _gridPos.gy = h * gridSize;
        return _gridPos;
      };
    }
    default:
      return (w, h) => {
        _gridPos.gx = w * gridSize;
        _gridPos.gy = h * gridSize;
        return _gridPos;
      };
  }
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

/**
 * The edges run clockwise seen from above the board, so a positive cross product of
 * the edge with the line to the point puts that point inside.
 */
export function chkOuterProduct(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  pchkx: number,
  pchky: number
): boolean {
  const ax = p2x - p1x;
  const ay = p2y - p1y;
  const bx = pchkx - p1x;
  const by = pchky - p1y;
  const calc = ax * by - ay * bx;
  return calc >= -0.01; // 丸め誤差対策で許容範囲を少し広くする。
}

/** Whether a point, relative to a circle's centre, lies inside or on a circle of that radius. */
export function chkInCircle(radius: number, pchkx: number, pchky: number): boolean {
  return radius * radius >= pchkx * pchkx + pchky * pchky;
}

/** Fills one square grid cell whose top-left corner is at (gx, gy). */
export function fillSquare(context: CanvasRenderingContext2D, gx: number, gy: number, gridSize: number): void {
  context.fillRect(gx, gy, gridSize, gridSize);
}

/** Whether the table's grid is made of hexagons, either way up. */
export function isHexGrid(gridType: GridType): boolean {
  return isHexGridType(gridType);
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
  const isFlatTop = setting.gridType === GridType.HEX_VERTICAL;

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
