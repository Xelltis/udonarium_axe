import { CellKey, parseCellKey } from '@axe/domain/tabletop/cell-key';

/**
 * Painted cells gathered into as few blocks as they will go.
 *
 * A wall painted across ten cells is one wall ten cells long, not ten walls standing in a
 * row: the table has one object to draw, one to drag and one to light, and the map reads as
 * something that was built rather than something that was stippled.
 */

export interface CellRect {
  col: number;
  row: number;
  width: number;
  height: number;
}

export function cellKeyOf(col: number, row: number): string {
  return `${col},${row}`;
}

/** The key a block is known by, which is enough to tell one block from another. */
export function rectKey(rect: CellRect): string {
  return `${rect.col},${rect.row},${rect.width},${rect.height}`;
}

/** Every cell a block covers. */
export function rectCells(rect: CellRect): string[] {
  const cells: string[] = [];
  for (let row = rect.row; row < rect.row + rect.height; row++) {
    for (let col = rect.col; col < rect.col + rect.width; col++) cells.push(cellKeyOf(col, row));
  }
  return cells;
}

/** A key read the one way keys are read, and only where it names a cell of the board. */
function parseCell(key: string): CellKey | null {
  const cell = parseCellKey(key);
  return cell && cell.col >= 0 && cell.row >= 0 ? cell : null;
}

/**
 * The painted cells cut into blocks, taking the widest one that will fit each time.
 *
 * Walked from the top left down, so the same painting always comes out as the same blocks:
 * the answer has to be steady, or every laying of it would tear the table's walls down and
 * build them again.
 */
export function largestRectangles(cells: readonly string[]): CellRect[] {
  const held = new Set<string>();
  let maxCol = -1;
  let maxRow = -1;
  for (const key of cells) {
    const cell = parseCell(key);
    if (!cell) continue;
    held.add(cellKeyOf(cell.col, cell.row));
    maxCol = Math.max(maxCol, cell.col);
    maxRow = Math.max(maxRow, cell.row);
  }
  if (held.size < 1) return [];

  const taken = new Set<string>();
  const rects: CellRect[] = [];

  const free = (col: number, row: number): boolean => {
    const key = cellKeyOf(col, row);
    return held.has(key) && !taken.has(key);
  };

  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      if (!free(col, row)) continue;

      let width = 1;
      while (free(col + width, row)) width++;

      let height = 1;
      while (rowIsFree(col, row + height, width)) height++;

      for (const key of rectCells({ col, row, width, height })) taken.add(key);
      rects.push({ col, row, width, height });
    }
  }
  return rects;

  function rowIsFree(col: number, row: number, width: number): boolean {
    for (let step = 0; step < width; step++) {
      if (!free(col + step, row)) return false;
    }
    return true;
  }
}
