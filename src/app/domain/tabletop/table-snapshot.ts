import { GridType } from '@axe/domain/tabletop/game-table';

/**
 * A table read off as plain counts and keys.
 *
 * What the map editor needs of a table to bring it in, said without any of the objects it is
 * actually made of, so working out what it becomes needs nothing of the store or the network.
 */
export interface TableSnapshot {
  cols: number;
  rows: number;
  cellPx: number;
  gridType: GridType;
  /** The picture the floor is wearing, empty where it wears none. */
  floorImageIdentifier: string;
  /** The cells the table is closed on, as `"col,row"`. */
  blockedCells: readonly string[];
  /** The cells the editor painted a wall onto. */
  terrainCells: readonly string[];
  /** The cells the editor painted a cover onto. */
  maskCells: readonly string[];
}
