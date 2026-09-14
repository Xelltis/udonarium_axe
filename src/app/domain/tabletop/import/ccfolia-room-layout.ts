export interface RoomGridGeometry {
  fieldWidth: number;
  fieldHeight: number;
  gridSize: number;
}

export const DEFAULT_ROOM_FIELD_WIDTH = 20;
export const DEFAULT_ROOM_FIELD_HEIGHT = 20;

/** The pieces alone are placed in pixels rather than cells, and this is what one cell comes to. */
export const PIECE_UNITS_PER_CELL = 25;

export interface TablePosition {
  x: number;
  y: number;
}

/**
 * The other tool measures its board from the centre and lets things sit off it, so the numbers run negative and past the size.
 * This one measures in pixels from the top left, so everything is moved half a board and scaled.
 */
export function roomCellToTablePosition(cellX: number, cellY: number, geometry: RoomGridGeometry): TablePosition {
  return {
    x: (cellX + geometry.fieldWidth / 2) * geometry.gridSize,
    y: (cellY + geometry.fieldHeight / 2) * geometry.gridSize,
  };
}

/**
 * Where a piece from the other tool's room lands on this table.
 *
 * Pieces are measured in their own units, 25 to a cell, from the centre of the board, so they are
 * moved half a board and scaled to the grid size.
 */
export function pieceUnitToTablePosition(unitX: number, unitY: number, geometry: RoomGridGeometry): TablePosition {
  const scale = geometry.gridSize / PIECE_UNITS_PER_CELL;
  return {
    x: (unitX + (geometry.fieldWidth / 2) * PIECE_UNITS_PER_CELL) * scale,
    y: (unitY + (geometry.fieldHeight / 2) * PIECE_UNITS_PER_CELL) * scale,
  };
}

/**
 * The board size in cells, taking the default 20 for a width or height the room left unset or below
 * 1.
 */
export function resolveFieldSize(fieldWidth: number, fieldHeight: number): { width: number; height: number } {
  return {
    width: fieldWidth >= 1 ? fieldWidth : DEFAULT_ROOM_FIELD_WIDTH,
    height: fieldHeight >= 1 ? fieldHeight : DEFAULT_ROOM_FIELD_HEIGHT,
  };
}
