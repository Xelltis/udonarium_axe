import { GridType } from '@axe/domain/tabletop/grid-type';
import { hexCellCenter, hexLayoutOf, isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { MapPoint, MapRect, MapSize } from '@axe/domain/tabletop/map-blocks';

/** The board a generated map is laid out on: what shape its cells are and how big they are. */
export interface MapGrid {
  type: GridType;
  sizePx: number;
}

/**
 * How many cells may be gathered into one block.
 *
 * On squares, a run of cells is a rectangle and one block can stand for a great many of them,
 * which is most of what keeps a generated map affordable. On a hex board every cell is its own
 * block, and the board is made smaller to pay for it.
 *
 * Not because the cells will not gather: a column of a flat-top board stands squarely one cell
 * above the next, and the squares of a run of them cover exactly what the cells did. It is that
 * a terrain on a hex table is drawn as a hex flower of `Math.min(width, depth)` cells across, so
 * a block standing for five would be drawn as one and the other four would go unpainted. Making
 * a run of them worth having means teaching the terrain to draw a run first.
 */
export function mergeSpanFor(grid: MapGrid, span: number): number {
  return isHexGrid(grid.type) ? 1 : span;
}

/** Where a block goes, in table pixels: its top left corner. */
export function blockOrigin(rect: MapRect, grid: MapGrid): MapPoint {
  if (!isHexGrid(grid.type)) return { x: rect.x * grid.sizePx, y: rect.y * grid.sizePx };
  const middle = cellCentre({ x: rect.x, y: rect.y }, grid);
  return { x: middle.x - grid.sizePx / 2, y: middle.y - grid.sizePx / 2 };
}

/** The middle of a cell, which is where anything that stands on one rather than over it goes. */
export function cellCentre(cell: MapPoint, grid: MapGrid): MapPoint {
  if (!isHexGrid(grid.type)) {
    return { x: (cell.x + 0.5) * grid.sizePx, y: (cell.y + 0.5) * grid.sizePx };
  }
  const { colSpacing, rowSpacing, isFlatTop } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  return hexCellCenter(cell.x, cell.y, colSpacing, rowSpacing, isFlatTop);
}

/**
 * How much smaller a hex board is made than the square board asked for.
 *
 * Every cell of a hex board is its own block, where a square board gathers a dozen into one,
 * so the same board would cost more terrain than a table can carry. A quarter off each side
 * takes nearly half the area, which measured across every mood, room count and a spread of
 * seeds brings the worst of them to about four fifths of what the table will take.
 */
export const HEX_BOARD_FACTOR = 0.75;

/**
 * The board size to generate on this grid: as asked for on squares, and three quarters of each side
 * on hexes, never under four cells.
 */
export function boardSizeOn(size: MapSize, grid: MapGrid): MapSize {
  if (!isHexGrid(grid.type)) return size;
  return {
    width: Math.max(4, Math.round(size.width * HEX_BOARD_FACTOR)),
    height: Math.max(4, Math.round(size.height * HEX_BOARD_FACTOR)),
  };
}

/**
 * How much room a board of this many cells actually takes, in table pixels.
 *
 * A board of squares is as wide as it has cells and no wider. A hex board is neither: its
 * columns overlap by a quarter of a hex and every other one is dropped half a row, so a board
 * of the same count of cells is narrower one way and longer the other.
 */
export function boardExtentPx(size: MapSize, grid: MapGrid): { widthPx: number; heightPx: number } {
  if (!isHexGrid(grid.type)) {
    return { widthPx: size.width * grid.sizePx, heightPx: size.height * grid.sizePx };
  }
  const { colSpacing, rowSpacing, circumradius, isFlatTop } = hexLayoutOf(grid.sizePx, isFlatTopGrid(grid.type));
  const across = circumradius * 2;
  return isFlatTop
    ? {
        widthPx: colSpacing * (size.width - 1) + across,
        heightPx: rowSpacing * size.height + rowSpacing / 2,
      }
    : {
        widthPx: colSpacing * size.width + colSpacing / 2,
        heightPx: rowSpacing * (size.height - 1) + across,
      };
}

/**
 * How many cells of table it takes to hold a board of this many cells.
 *
 * A table counts its cells the way a board does — a hex table is so many hex columns across,
 * not so many grid squares — so a board of any shape is held by a table of the same count.
 * Measuring the board in pixels and dividing by the grid instead made a hex table three
 * columns short of the map laid on it, and the far side of the map hung off the table.
 */
export function tableSizeFor(size: MapSize, _grid: MapGrid): MapSize {
  return size;
}
