import { mergeMaskToRects } from '@axe/domain/tabletop/dungeon/rect-merge';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import type { MapAmbience, MapRect } from '@axe/domain/tabletop/map-blocks';

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

/** What a stretch of water a generator lays looks like and does: how high it stands, its look and its run. */
export type GeneratedWater = NonNullable<MapAmbience['water']>;

/** How thick the water a generator lays is: as the settings of water lay a pond. */
const GENERATED_WATER_DENSITY = 0.6;

/**
 * The water a generator lays over the cells of a mask: as few areas as cover them and no others, each
 * the same water. Every generator lays its water through here, so that all of it is laid alike.
 */
export function watersOver(
  mask: Uint8Array,
  width: number,
  height: number,
  gridType: GridType,
  water: GeneratedWater
): MapAmbience[] {
  return areasOver(mask, width, height, gridType).map((rect) => ({
    rect,
    kind: 'water',
    density: GENERATED_WATER_DENSITY,
    name: 'water',
    water,
  }));
}

/**
 * The water a generator lays where cells of it differ, as running water differs by the way it runs:
 * the cells sorted into lots, one for each kind named, and each lot laid as {@link watersOver} lays a
 * mask, so that no two areas overlap. The lots are laid in the order their first cells lie on the
 * board, row by row, however the cells were handed over.
 */
export function watersInLots(
  cells: Iterable<{ readonly index: number; readonly lot: string }>,
  width: number,
  height: number,
  gridType: GridType,
  waterOf: (lot: string) => GeneratedWater
): MapAmbience[] {
  const lots = new Map<string, { first: number; mask: Uint8Array }>();
  for (const { index, lot } of cells) {
    let held = lots.get(lot);
    if (!held) lots.set(lot, (held = { first: index, mask: new Uint8Array(width * height) }));
    held.first = Math.min(held.first, index);
    held.mask[index] = 1;
  }
  return [...lots]
    .sort(([, a], [, b]) => a.first - b.first)
    .flatMap(([lot, { mask }]) => watersOver(mask, width, height, gridType, waterOf(lot)));
}
