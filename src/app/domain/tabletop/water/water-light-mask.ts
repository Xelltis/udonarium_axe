import { type CellGrid, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';

/** How much of a sheet of water shows, sampled over its box, as alpha from 0 to 255. */
export interface WaterLightMask {
  readonly cols: number;
  readonly rows: number;
  readonly alpha: Uint8ClampedArray;
}

/** How many samples a cell is read at across. A sample per cell would draw each cell as a square of light. */
const SAMPLES_PER_CELL = 2;

/**
 * How much of a sheet of water shows in the dark, or null where it shows the same everywhere.
 *
 * Water standing above the floor stands above the dark painted on the floor too, so it wears
 * the light of each cell itself: what is lit shows and what is not fades out with the floor
 * under it. The samples are spread at half a cell and the picture is stretched over the sheet,
 * so the light falls off smoothly rather than cell by cell. A sample off the water takes the
 * sheet's own light, which keeps the stretching from darkening its edge.
 */
export function waterLightMaskOf(
  grid: CellGrid,
  sheet: { left: number; top: number; width: number; height: number; cells: readonly number[] },
  lightOf: (index: number) => number
): WaterLightMask | null {
  if (sheet.cells.length < 1 || grid.sizePx <= 0) return null;
  let total = 0;
  let first = -1;
  let even = true;
  for (const index of sheet.cells) {
    const light = clamp01(lightOf(index));
    total += light;
    if (first < 0) first = light;
    else if (Math.abs(light - first) > 0.002) even = false;
  }
  if (even && first >= 0.998) return null;
  return sampleOverSheet(grid, sheet, (index) => clamp01(lightOf(index)), total / sheet.cells.length);
}

/**
 * A value read cell by cell over a sheet's box at half a cell, as alpha from 0 to 255, to stretch
 * over the sheet so that the value runs smoothly from cell to cell. A sample off the sheet's cells
 * takes `fallback`, which keeps the stretching from bleeding something else in at its edge.
 */
export function sampleOverSheet(
  grid: CellGrid,
  sheet: { left: number; top: number; width: number; height: number; cells: readonly number[] },
  valueOf: (index: number) => number,
  fallback: number
): WaterLightMask {
  const step = grid.sizePx / SAMPLES_PER_CELL;
  const cols = Math.max(1, Math.ceil(sheet.width / step));
  const rows = Math.max(1, Math.ceil(sheet.height / step));
  const inSheet = new Set(sheet.cells);
  const alpha = new Uint8ClampedArray(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = sheet.left + ((col + 0.5) / cols) * sheet.width;
      const y = sheet.top + ((row + 0.5) / rows) * sheet.height;
      const index = cellIndexAt(grid, x, y);
      const value = inSheet.has(index) ? valueOf(index) : fallback;
      alpha[row * cols + col] = Math.round(clamp01(value) * 255);
    }
  }
  return { cols, rows, alpha };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, 0), 1);
}
