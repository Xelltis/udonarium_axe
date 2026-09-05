import { inject, Injectable } from '@angular/core';
import { cellColRow, CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { moveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { parsePaintedCell } from '@axe/domain/tabletop/painted-cell';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { Terrain } from '@axe/domain/tabletop/terrain';

function cellKeyOf(col: number, row: number): string {
  return `${col},${row}`;
}

/** The cells a table is closed on, in the editor's own way of naming them. */
export function blockedCellKeysOn(table: GameTable, grid: CellGrid): string[] {
  const map = moveBlockMapOn(table);
  if (!map) return [];
  const bits = map.read(grid);
  const keys: string[] = [];
  for (let index = 0; index < grid.cols * grid.rows; index++) {
    if (!bits.get(index)) continue;
    const { col, row } = cellColRow(grid, index);
    keys.push(cellKeyOf(col, row));
  }
  return keys;
}

/** The cells the editor painted an object onto. Anything placed by hand answers with nothing. */
export function paintedCellKeysOf(objects: readonly { paintCell: string }[]): string[] {
  const keys: string[] = [];
  for (const object of objects) {
    const cell = parsePaintedCell(object.paintCell);
    if (cell) keys.push(cellKeyOf(cell.col, cell.row));
  }
  return keys;
}

@Injectable({ providedIn: 'root' })
export class FunctionalPaintService {
  private readonly tableSelecter = inject(TableSelecter);

  /** The table the editor would be reading, or nothing where none is out. */
  snapshot(): TableSnapshot | null {
    const table = this.tableSelecter.viewTable;
    if (!table) return null;
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;

    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    return {
      cols: grid.cols,
      rows: grid.rows,
      cellPx: table.gridSize,
      gridType: table.gridType,
      floorImageIdentifier: table.imageIdentifier,
      blockedCells: blockedCellKeysOn(table, grid),
      terrainCells: paintedCellKeysOf(table.children.filter((child): child is Terrain => child instanceof Terrain)),
      maskCells: paintedCellKeysOf(
        table.children.filter((child): child is GameTableMask => child instanceof GameTableMask)
      ),
    };
  }
}
