import { SyncObject, SyncVar } from '@axe/core/sync/decorator';
import { ObjectNode } from '@axe/core/sync/object-node';
import { CellBits, decodeCellBits, encodeCellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, sameCellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';

@SyncObject('move-block-map')
export class MoveBlockMap extends ObjectNode {
  @SyncVar() cols: number = 0;
  @SyncVar() rows: number = 0;
  @SyncVar() gridType: GridType = GridType.SQUARE;
  @SyncVar() bits: string = '';

  /** The grid shape the stored cells were marked on; the cell size is not kept. */
  get grid(): CellGrid {
    return { cols: this.cols, rows: this.rows, type: this.gridType, sizePx: 0 };
  }

  /** Whether the stored cells belong to a grid of the same columns, rows and cell shape. */
  matches(grid: CellGrid): boolean {
    return sameCellGrid(this.grid, grid);
  }

  /** The blocked cells for a grid; empty when they were marked on a different grid, such as before a resize. */
  read(grid: CellGrid): CellBits {
    const count = cellCount(grid);
    if (!this.matches(grid)) return new CellBits(count);
    return decodeCellBits(this.bits, count);
  }

  /** Stores the blocked cells together with the grid they belong to, which syncs them to the other peers. */
  write(grid: CellGrid, bits: CellBits): void {
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.gridType = grid.type;
    this.bits = encodeCellBits(bits);
  }

  /** Clears every blocked cell. */
  reset(): void {
    this.bits = '';
  }

  /** Whether no cells are stored. */
  get isEmpty(): boolean {
    return this.bits.length === 0;
  }
}

/** The table's map of cells pieces may not move into, or null when none has been made for it. */
export function moveBlockMapOn(table: GameTable): MoveBlockMap | null {
  return table.children.find((child): child is MoveBlockMap => child instanceof MoveBlockMap) ?? null;
}

/** The fixed identifier of a table's movement block map, so every peer that makes one makes the same object. */
export function moveBlockMapIdentifierOf(table: GameTable): string {
  return `move-block-map_${table.identifier}`;
}

/** The table's movement block map, making it and adding it under the table first when there is none. */
export function ensureMoveBlockMapOn(table: GameTable): MoveBlockMap {
  const held = moveBlockMapOn(table);
  if (held) return held;
  const map = new MoveBlockMap(moveBlockMapIdentifierOf(table));
  map.initialize();
  table.appendChild(map);
  return map;
}
