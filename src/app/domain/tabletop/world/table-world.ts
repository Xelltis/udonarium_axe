import { GameTable, GridType } from '@axe/domain/tabletop/game-table';

/** The board of the table in view, as the scene lays it out, in table pixels. */
export interface TableWorldBoard {
  readonly widthPx: number;
  readonly depthPx: number;
  readonly gridSize: number;
  readonly gridType: GridType;
}

/**
 * What the table in view puts in front of the camera: everything a renderer draws, worked out from
 * the objects of the room and nothing else. A table with no board in view draws nothing.
 */
export interface TableWorld {
  readonly board: TableWorldBoard | null;
}

/** The scene with nothing in it. */
export const EMPTY_TABLE_WORLD: TableWorld = { board: null };

/** The scene of a table, or the empty scene where there is none in view. */
export function tableWorldOf(table: GameTable | null | undefined): TableWorld {
  if (!table) return EMPTY_TABLE_WORLD;
  const gridSize = table.gridSize > 0 ? table.gridSize : 50;
  return {
    board: {
      widthPx: table.width * gridSize,
      depthPx: table.height * gridSize,
      gridSize,
      gridType: table.gridType,
    },
  };
}
