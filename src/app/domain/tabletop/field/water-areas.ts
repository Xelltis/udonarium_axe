import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { MapRect } from '@axe/domain/tabletop/map-blocks';

/**
 * The fewest areas that cover the cells of a mask and no others, on a board of the grid given. An
 * area is laid a cell's width to each cell along both ways, which on squares fits any rectangle; hexes
 * line up a cell apart only one way, along rows of pointy-topped ones and columns of flat-topped
 * ones, so there an area is one run of cells along that way.
 */
export function areasOver(mask: Uint8Array, width: number, height: number, gridType: GridType): MapRect[] {
  if (!isHexGrid(gridType)) return mergeMaskToRects(mask, width, height, Math.max(width, height));
  const down = isFlatTopGrid(gridType);
  const runs: MapRect[] = [];
  const lines = down ? width : height;
  const length = down ? height : width;
  for (let line = 0; line < lines; line++) {
    let start = -1;
    for (let at = 0; at <= length; at++) {
      const wet = at < length && mask[down ? at * width + line : line * width + at] === 1;
      if (wet && start < 0) start = at;
      if (wet || start < 0) continue;
      const run = at - start;
      runs.push(down ? { x: line, y: start, w: 1, h: run } : { x: start, y: line, w: run, h: 1 });
      start = -1;
    }
  }
  return runs;
}
