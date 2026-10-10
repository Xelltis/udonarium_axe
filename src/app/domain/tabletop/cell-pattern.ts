export interface CellCoord {
  readonly gx: number;
  readonly gy: number;
}

export interface CellPatternBoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly width: number;
  readonly height: number;
}

const CELL_SEPARATOR = ';';
const COORD_SEPARATOR = ',';

/**
 * Reads the cell pattern of a custom range, written as `x,y` pairs separated by semicolons.
 *
 * Malformed pairs and repeats are skipped, and an empty string reads as no cells.
 */
export function parseCellPattern(serialized: string): CellCoord[] {
  if (!serialized) return [];
  const seen = new Set<string>();
  const cells: CellCoord[] = [];
  for (const token of serialized.split(CELL_SEPARATOR)) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(COORD_SEPARATOR);
    if (parts.length !== 2) continue;
    const rawX = parts[0].trim();
    const rawY = parts[1].trim();
    if (!rawX || !rawY) continue;
    const gx = Number(rawX);
    const gy = Number(rawY);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    const key = `${gx},${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cells.push({ gx, gy });
  }
  return cells;
}

/**
 * Writes cells in the form parseCellPattern reads, truncating coordinates to whole cells and
 * dropping repeats.
 */
export function serializeCellPattern(cells: readonly CellCoord[]): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const cell of cells) {
    const gx = Math.trunc(cell.gx);
    const gy = Math.trunc(cell.gy);
    const key = `${gx},${gy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parts.push(key);
  }
  return parts.join(CELL_SEPARATOR);
}

/**
 * The smallest box holding every cell, with its width and height counted in cells. An empty pattern
 * gives an all-zero box.
 */
export function cellPatternBoundingBox(cells: readonly CellCoord[]): CellPatternBoundingBox {
  if (cells.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = cells[0].gx;
  let maxX = cells[0].gx;
  let minY = cells[0].gy;
  let maxY = cells[0].gy;
  for (const c of cells) {
    if (c.gx < minX) minX = c.gx;
    if (c.gx > maxX) maxX = c.gx;
    if (c.gy < minY) minY = c.gy;
    if (c.gy > maxY) maxY = c.gy;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** Rotate the cell set by 90° clockwise the given number of times (0..3). */
export function rotateCellPattern(cells: readonly CellCoord[], quadrants: number): CellCoord[] {
  const q = ((quadrants % 4) + 4) % 4;
  if (q === 0) return cells.map((c) => ({ gx: c.gx, gy: c.gy }));
  return cells.map((c) => {
    let gx: number;
    let gy: number;
    switch (q) {
      case 1:
        gx = -c.gy;
        gy = c.gx;
        break;
      case 2:
        gx = -c.gx;
        gy = -c.gy;
        break;
      default:
        gx = c.gy;
        gy = -c.gx;
        break;
    }
    return { gx: gx === 0 ? 0 : gx, gy: gy === 0 ? 0 : gy };
  });
}

/** Shift the pattern so its bounding box top-left is at (0, 0). */
export function normalizeCellPattern(cells: readonly CellCoord[]): CellCoord[] {
  if (cells.length === 0) return [];
  const bb = cellPatternBoundingBox(cells);
  return cells.map((c) => ({ gx: c.gx - bb.minX, gy: c.gy - bb.minY }));
}

/** The `x,y` key a cell is known by in sets and maps, truncated to whole cells. */
export function cellKey(gx: number, gy: number): string {
  return `${Math.trunc(gx)},${Math.trunc(gy)}`;
}

/** The cells as a set of cellKey strings, for quick membership tests. */
export function cellPatternToSet(cells: readonly CellCoord[]): Set<string> {
  const set = new Set<string>();
  for (const c of cells) set.add(cellKey(c.gx, c.gy));
  return set;
}
