import { cellColRow, type CellGrid, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

/**
 * Neighbouring cells of water that look alike, drawn as one piece: once on the floor and once
 * at the surface.
 *
 * Its box is given in table pixels and the cut is measured from the box's corner.
 */
export interface WaterSheet {
  readonly key: string;
  readonly floorPx: number;
  readonly surfacePx: number;
  readonly color: string;
  readonly density: number;
  readonly turbidity: number;
  readonly dirt: number;
  readonly leaves: number;
  readonly flowSpeed: number;
  readonly flowDirection: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The cells it covers, as the `d` of a path. */
  readonly path: string;
  /** The indices of the cells it covers. */
  readonly cells: readonly number[];
}

/**
 * How many columns and rows of cells one piece of water may span.
 *
 * One sheet over a whole lake is one surface the browser has to split against every piece and
 * wall standing in it, and a sheet it splits wrongly shows the floor drawn over what stands on
 * it. Pieces the size the tops of the terrain are gathered into have never shown that.
 */
export const WATER_CHUNK_CELLS = 8;

/**
 * Gathers the cells of water into sheets: one per look within each chunk of the board, the look
 * being what `lookOf` says it is.
 */
export function waterSheetsOf(
  grid: CellGrid,
  cells: Iterable<WaterCell>,
  lookOf: (cell: WaterCell) => string
): WaterSheet[] {
  const groups = new Map<string, WaterCell[]>();
  const ordered = [...cells].sort((a, b) => a.index - b.index);
  for (const cell of ordered) {
    const { col, row } = cellColRow(grid, cell.index);
    const key = `${Math.floor(col / WATER_CHUNK_CELLS)},${Math.floor(row / WATER_CHUNK_CELLS)}:${lookOf(cell)}`;
    const group = groups.get(key);
    if (group) group.push(cell);
    else groups.set(key, [cell]);
  }

  const sheets: WaterSheet[] = [];
  for (const [key, group] of groups) {
    const outlines = isHexGrid(grid.type) ? group.map((cell) => cellPolygonOf(grid, cell.index)) : rowRuns(grid, group);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const outline of outlines) {
      for (const point of outline) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
    }
    const path = outlines
      .map((outline) => `M${outline.map((point) => `${number(point.x - minX)} ${number(point.y - minY)}`).join('L')}Z`)
      .join('');
    const first = group[0];
    sheets.push({
      key,
      floorPx: first.floorPx,
      surfacePx: first.surfacePx,
      color: first.color,
      density: first.density,
      turbidity: first.turbidity,
      dirt: first.dirt,
      leaves: first.leaves,
      flowSpeed: first.flowSpeed,
      flowDirection: first.flowDirection,
      left: minX,
      top: minY,
      width: maxX - minX,
      height: maxY - minY,
      path,
      cells: group.map((cell) => cell.index),
    });
  }
  return sheets;
}

/** The cells of a square board as one rectangle per run along a row, which keeps the path short. */
function rowRuns(grid: CellGrid, group: readonly WaterCell[]): { x: number; y: number }[][] {
  const size = grid.sizePx;
  const runs: { x: number; y: number }[][] = [];
  let start: { col: number; row: number } | null = null;
  let last: { col: number; row: number } | null = null;
  const close = () => {
    if (!start || !last) return;
    const x0 = start.col * size;
    const x1 = (last.col + 1) * size;
    const y0 = start.row * size;
    const y1 = (start.row + 1) * size;
    runs.push([
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 },
    ]);
  };
  for (const cell of group) {
    const at = cellColRow(grid, cell.index);
    if (last && at.row === last.row && at.col === last.col + 1) {
      last = at;
      continue;
    }
    close();
    start = at;
    last = at;
  }
  close();
  return runs;
}

function number(value: number): string {
  return `${Math.round(value * 1000) / 1000}`;
}
