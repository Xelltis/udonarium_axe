import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, forEachCellInBox } from '@axe/domain/tabletop/fog/cell-grid';
import { zoneCovers, ZoneShape } from '@axe/domain/tabletop/zone/zone-geometry';

/** The cells of a grid whose middles lie in a zone, its edge included. */
export function zoneCells(grid: CellGrid, shape: ZoneShape): CellBits {
  const cells = new CellBits(cellCount(grid));
  const { centre, reach } = shape;
  forEachCellInBox(grid, centre.x - reach, centre.y - reach, centre.x + reach, centre.y + reach, (index, x, y) => {
    if (zoneCovers(shape, { x, y })) cells.set(index);
  });
  return cells;
}
