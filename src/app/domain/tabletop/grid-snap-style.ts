/**
 * Which points of a table's grid a piece put down on it snaps to.
 *
 * Kept apart from the table itself so that what measures a board, such as the grid a piece moves
 * over, can know how the table places its pieces without loading the synchronised objects.
 */
export enum GridSnapStyle {
  CENTER = 0,
  VERTEX = 1,
  BOTH = 2,
  ALL = 3,
  /**
   * Snaps to the cells as CENTER does, and keeps to them on a table counting several cells as one
   * square too, so a piece stays on the cell of the square it is put down on rather than going to
   * its middle.
   */
  GRID = 4,
}

/**
 * Whether the pieces on a table keep to the cells of its squares, rather than going to their
 * middles, where it counts several cells as one square; see {@link GridSnapStyle.GRID}.
 */
export function keepsPiecesOnCells(table: { gridSnap?: boolean; gridSnapStyle?: GridSnapStyle | number }): boolean {
  return !!table.gridSnap && Number(table.gridSnapStyle) === GridSnapStyle.GRID;
}
