import {
  CellCoord,
  cellKey,
  cellPatternToSet,
  parseCellPattern,
  patternCellToWorld,
  rotateCellPattern,
  worldCellToPattern,
} from '@axe/domain/tabletop/cell-pattern';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';
import { RangeRenderSetting } from '@axe/infrastructure/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  fillGridCells,
  fillHexCellsWhere,
  makeBrush,
} from '@axe/infrastructure/tabletop/range/range-render-util';

export interface CustomRenderInput {
  cellPattern: string;
  /** rotate in degrees; snapped to 0/90/180/270 quadrants. */
  rotationDegrees: number;
}

export interface CustomRenderBoundingBox {
  /** Half-extents in pixels relative to the range origin (center of canvas). */
  halfWidthPx: number;
  halfHeightPx: number;
}

function quadrantsFromDegrees(degrees: number): number {
  const normalized = (((degrees % 360) + 360) % 360) / 90;
  return Math.round(normalized) % 4;
}

function computeBaseCellOffset(setting: RangeRenderSetting, gridSize: number): { dx: number; dy: number } {
  if (isHexGrid(setting.gridType)) {
    const isFlatTop = isFlatTopGrid(setting.gridType);
    const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
    const { col: baseCol, row: baseRow } = pixelToHexCell(setting.centerX, setting.centerY, gridSize, isFlatTop);
    const { x: baseX, y: baseY } = hexCellCenter(baseCol, baseRow, colSpacing, rowSpacing, isFlatTop);
    return { dx: baseX - setting.centerX, dy: baseY - setting.centerY };
  }
  const baseCol = Math.floor(setting.centerX / gridSize);
  const baseRow = Math.floor(setting.centerY / gridSize);
  return {
    dx: baseCol * gridSize + gridSize / 2 - setting.centerX,
    dy: baseRow * gridSize + gridSize / 2 - setting.centerY,
  };
}

function resolveCells(input: CustomRenderInput): CellCoord[] {
  const cells = parseCellPattern(input.cellPattern);
  if (cells.length === 0) return [];
  return rotateCellPattern(cells, quadrantsFromDegrees(input.rotationDegrees));
}

/**
 * Build a hit test that matches if a relative pixel position (gcx, gcy) — measured from the range
 * origin — lands inside one of the pattern cells. The cells are anchored to the table grid so the
 * rendered fills line up with the visible grid lines.
 */
export function makeCustomHitTest(
  setting: RangeRenderSetting,
  cells: readonly CellCoord[]
): (gcx: number, gcy: number) => boolean {
  const gridSize = setting.gridSize;
  const cellKeys = cellPatternToSet(cells);
  if (isHexGrid(setting.gridType)) {
    const isFlatTop = isFlatTopGrid(setting.gridType);
    const { col: baseCol, row: baseRow } = pixelToHexCell(setting.centerX, setting.centerY, gridSize, isFlatTop);
    return (gcx, gcy) => {
      const worldX = setting.centerX + gcx;
      const worldY = setting.centerY + gcy;
      const { col, row } = pixelToHexCell(worldX, worldY, gridSize, isFlatTop);
      const { gx, gy } = worldCellToPattern(baseCol, baseRow, col, row, isFlatTop);
      return cellKeys.has(cellKey(gx, gy));
    };
  }
  const baseCol = Math.floor(setting.centerX / gridSize);
  const baseRow = Math.floor(setting.centerY / gridSize);
  return (gcx, gcy) => {
    const worldX = setting.centerX + gcx;
    const worldY = setting.centerY + gcy;
    const col = Math.floor(worldX / gridSize);
    const row = Math.floor(worldY / gridSize);
    return cellKeys.has(cellKey(col - baseCol, row - baseRow));
  };
}

/**
 * Fills the hexes a pattern covers, worked out from the cells themselves.
 *
 * Which cells those are is known by number from the pattern and the cell the range stands in, so
 * nothing is found again by measuring where a hex centre falls.
 */
function fillHexPatternCells(
  context: CanvasRenderingContext2D,
  setting: RangeRenderSetting,
  cells: readonly CellCoord[]
): void {
  const isFlatTop = isFlatTopGrid(setting.gridType);
  const { col: baseCol, row: baseRow } = pixelToHexCell(setting.centerX, setting.centerY, setting.gridSize, isFlatTop);
  const covered = new Set<string>();
  for (const cell of cells) {
    const { col, row } = patternCellToWorld(baseCol, baseRow, cell.gx, cell.gy, isFlatTop);
    covered.add(cellKey(col, row));
  }
  fillHexCellsWhere(context, setting, (col, row) => covered.has(cellKey(col, row)));
}

/**
 * Draws a custom-shaped range onto its two canvases and measures how far it reaches.
 *
 * The painted cells, turned by quarter turns, are filled on the grid canvas lined up with the table's
 * grid, and a dot marks the cell the range stands in on the outline canvas. The extent it returns is
 * what the range's clip is sized from; an empty pattern reaches half a cell.
 */
export function renderCustom(
  canvasElement: HTMLCanvasElement,
  canvasElementRange: HTMLCanvasElement,
  setting: RangeRenderSetting,
  input: CustomRenderInput
): CustomRenderBoundingBox {
  const offsets = calcGridOffsets(setting);
  const { gridSize } = offsets;
  const cells = resolveCells(input);

  canvasElement.width = setting.areaWidth * gridSize;
  canvasElement.height = setting.areaHeight * gridSize;
  const context = canvasElement.getContext('2d')!;

  if (cells.length > 0) {
    if (isHexGrid(setting.gridType)) {
      fillHexPatternCells(context, setting, cells);
    } else {
      fillGridCells(context, setting, offsets, makeCustomHitTest(setting, cells));
    }
  }

  canvasElementRange.width = setting.areaWidth * gridSize;
  canvasElementRange.height = setting.areaHeight * gridSize;
  const rangeCtx = canvasElementRange.getContext('2d')!;
  makeBrush(rangeCtx, gridSize, setting.rangeColor);
  rangeCtx.lineWidth = 2;
  // The origin dot sits at the centre of the cell the range stands in, the pattern's cell (0, 0).
  const canvasCx = setting.areaWidth * gridSize * 0.5;
  const canvasCy = setting.areaHeight * gridSize * 0.5;
  const baseOffset = computeBaseCellOffset(setting, gridSize);
  rangeCtx.beginPath();
  rangeCtx.arc(canvasCx + baseOffset.dx, canvasCy + baseOffset.dy, 5, 0, 2 * Math.PI, true);
  rangeCtx.fill();

  if (cells.length === 0) {
    return { halfWidthPx: gridSize / 2, halfHeightPx: gridSize / 2 };
  }

  let halfWidthPx = gridSize / 2;
  let halfHeightPx = gridSize / 2;
  if (isHexGrid(setting.gridType)) {
    const isFlatTop = isFlatTopGrid(setting.gridType);
    const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
    const s = hexCircumradius(gridSize);
    const { col: baseCol, row: baseRow } = pixelToHexCell(setting.centerX, setting.centerY, gridSize, isFlatTop);
    for (const cell of cells) {
      const { col, row } = patternCellToWorld(baseCol, baseRow, cell.gx, cell.gy, isFlatTop);
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const dx = x - setting.centerX;
      const dy = y - setting.centerY;
      halfWidthPx = Math.max(halfWidthPx, Math.abs(dx) + s);
      halfHeightPx = Math.max(halfHeightPx, Math.abs(dy) + s);
    }
  } else {
    const baseCol = Math.floor(setting.centerX / gridSize);
    const baseRow = Math.floor(setting.centerY / gridSize);
    for (const cell of cells) {
      const worldX = (baseCol + cell.gx) * gridSize + gridSize / 2;
      const worldY = (baseRow + cell.gy) * gridSize + gridSize / 2;
      const dx = worldX - setting.centerX;
      const dy = worldY - setting.centerY;
      halfWidthPx = Math.max(halfWidthPx, Math.abs(dx) + gridSize / 2);
      halfHeightPx = Math.max(halfHeightPx, Math.abs(dy) + gridSize / 2);
    }
  }
  return { halfWidthPx, halfHeightPx };
}
