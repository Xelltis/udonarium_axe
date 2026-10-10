/**
 * How a table's cells are laid: none, squares, or hexagons standing on a point or on a side.
 *
 * Kept apart from the table itself so that code drawing or measuring a board, such as the replay
 * video worker, can know the grid without loading the synchronised objects.
 */
export enum GridType {
  NONE = -1,
  SQUARE = 0,
  HEX_VERTICAL = 1,
  HEX_HORIZONTAL = 2,
}
