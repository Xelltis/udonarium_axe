import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { fitsOnCell, isSquareGrid, SquareGrid } from '@axe/domain/tabletop/move/move-grid';
import { sizeShiftOf } from '@axe/domain/tabletop/move/piece-on-grid';

/**
 * Whether a piece standing on a cell would fit there, with every cell it covers clear.
 *
 * A reach is worked out one cell at a time, and that cell is where a piece's middle would be.
 * A piece one cell across is that cell and nothing else, but a golem three across covers nine:
 * a reach that asked only about the middle one would offer it a doorway it cannot enter and a
 * ledge two thirds of it would hang off.
 *
 * Nothing comes back for a piece that covers a single cell, since there is nothing to ask of it,
 * and the reach is then left exactly as fast as it was.
 *
 * `across` asks about a footprint other than the piece's own, which is what a piece folding
 * itself through a gap too small for it is answered by.
 *
 * On a grid of squares the footprint is counted in squares: as many as it takes to hold the piece,
 * whose size is kept in the table's cells. A piece one square holds is asked only, where the table's
 * edge cuts squares off, whether what is left of a square is wide enough for it.
 */
export function pieceFitsOn(
  grid: CellGrid,
  piece: GameCharacter,
  gridSize: number,
  blocked: CellBits,
  across?: number
): ((cell: number) => boolean) | null {
  const size = Math.max(1, Math.round(across ?? piece.size));
  if (isSquareGrid(grid)) {
    const squares = Math.ceil(size / grid.span);
    if (squares < 2) return fitsWhatIsOnTheTable(grid, size * grid.fine.sizePx);
    return footprintFitsOn(grid, squares, grid.sizePx, blocked);
  }
  return footprintFitsOn(grid, size, gridSize, blocked);
}

/**
 * Whether a piece `widthPx` across fits on what is on the table of a square: the whole of a square,
 * and as much of one as the table's edge leaves. Nothing where every square holds it, which is
 * every square the edge cuts nothing off.
 */
function fitsWhatIsOnTheTable(grid: SquareGrid, widthPx: number): ((cell: number) => boolean) | null {
  const clip = grid.clip;
  if (!clip) return null;
  const narrowest = Math.min(clip.width - (grid.cols - 1) * grid.sizePx, clip.height - (grid.rows - 1) * grid.sizePx);
  if (widthPx <= narrowest) return null;
  return (cell: number): boolean => fitsOnCell(grid, cell, widthPx);
}

/** Whether a footprint `span` cells across, each `gridSize` across, fits on a cell of the grid. */
function footprintFitsOn(
  grid: CellGrid,
  span: number,
  gridSize: number,
  blocked: CellBits
): ((cell: number) => boolean) | null {
  if (span < 2 || gridSize <= 0) return null;
  const shift = sizeShiftOf(span, gridSize);

  return (cell: number): boolean => {
    const centre = cellCenterOf(grid, cell);
    const x = centre.x - shift;
    const y = centre.y - shift;
    const far = { x: x + span * gridSize - 1, y: y + span * gridSize - 1 };
    // Ground that runs off the edge is ground a piece cannot stand on either, and the cells
    // beyond the border are not blocked so much as absent. The corners of the footprint are
    // asked for directly, since a box that hangs over the edge simply yields fewer cells.
    if (cellIndexAt(grid, x, y) < 0 || cellIndexAt(grid, far.x, far.y) < 0) return false;
    if (cellIndexAt(grid, far.x, y) < 0 || cellIndexAt(grid, x, far.y) < 0) return false;

    let fits = true;
    forEachCellInBox(grid, x, y, far.x, far.y, (held) => {
      if (blocked.get(held)) fits = false;
    });
    return fits;
  };
}
