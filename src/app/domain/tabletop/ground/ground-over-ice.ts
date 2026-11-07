import { type CellGrid, cellIndexAt, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import {
  type GroundSurface,
  heightBetweenSamples,
  lowestSampleOneByOne,
  type SampleBox,
} from '@axe/domain/tabletop/ground/ground-surface';
import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';

/** How much of the surface of water has to be frozen for what stands on it to stand on the ice. */
export const ICE_BEARS_AT = 0.5;

/**
 * How far round a sample of the ground the cells it touches are looked for, as a share of a cell: a
 * sample on the side or the corner of a cell of ice belongs to the ice as well as to the land.
 */
const TOUCH_CELLS = 0.02;

/**
 * The ground as what stands on the floor stands on it: the ground itself, lifted to the surface of the
 * ice wherever water is frozen hard enough over it, so a piece walks on the ice rather than on the
 * bed of the lake under it, and what is laid on the floor, as where a piece may move, lies on the ice.
 * Every sample of the ground a cell of ice touches, on its sides and corners as well as inside it,
 * stands at least as high as the ice; elsewhere the ground is as it is. Given no ice, it is the ground
 * given, the very same.
 */
export function groundOverIce(
  ground: GroundSurface,
  frozen: ReadonlyMap<number, WaterCell>,
  grid: CellGrid | null
): GroundSurface {
  if (!grid || !(grid.sizePx > 0)) return ground;
  const lifted = new Map<string, number>();
  const size = grid.sizePx;
  const touch = TOUCH_CELLS * size;
  for (const cell of frozen.values()) {
    if ((cell.ice ?? 0) < ICE_BEARS_AT) continue;
    const top = cell.surfacePx / size;
    const outline = cellPolygonOf(grid, cell.index);
    const xs = outline.map((point) => point.x);
    const ys = outline.map((point) => point.y);
    const fromI = Math.floor((Math.min(...xs) / size) * GROUND_SAMPLES_PER_CELL);
    const toI = Math.ceil((Math.max(...xs) / size) * GROUND_SAMPLES_PER_CELL);
    const fromJ = Math.floor((Math.min(...ys) / size) * GROUND_SAMPLES_PER_CELL);
    const toJ = Math.ceil((Math.max(...ys) / size) * GROUND_SAMPLES_PER_CELL);
    for (let j = Math.max(0, fromJ); j <= toJ; j++) {
      for (let i = Math.max(0, fromI); i <= toI; i++) {
        const x = (i / GROUND_SAMPLES_PER_CELL) * size;
        const y = (j / GROUND_SAMPLES_PER_CELL) * size;
        const touches = [
          [x, y],
          [x - touch, y - touch],
          [x + touch, y - touch],
          [x - touch, y + touch],
          [x + touch, y + touch],
        ].some(([px, py]) => cellIndexAt(grid, px, py) === cell.index);
        if (!touches) continue;
        const key = `${i},${j}`;
        lifted.set(key, Math.max(lifted.get(key) ?? -Infinity, top));
      }
    }
  }
  if (lifted.size < 1) return ground;
  const sampleAt = (i: number, j: number): number => {
    const own = ground.sampleAt(i, j);
    const ice = lifted.get(`${i},${j}`);
    return ice === undefined ? own : Math.max(own, ice);
  };
  const iced = [...lifted.keys()].map((key) => key.split(',').map(Number) as [number, number]);
  const icedIn = (box: SampleBox): boolean =>
    iced.some(([i, j]) => i >= box.i0 && i <= box.i1 && j >= box.j0 && j <= box.j1);
  return {
    isFlat: false,
    sampleAt,
    paintAt: (i, j) => ground.paintAt(i, j),
    heightAt: (x, y) => heightBetweenSamples(sampleAt, x * GROUND_SAMPLES_PER_CELL, y * GROUND_SAMPLES_PER_CELL),
    extent: extentWithIce(ground.extent, iced),
    lowestSampleIn: (box) =>
      icedIn(box)
        ? lowestSampleOneByOne(sampleAt, box)
        : (ground.lowestSampleIn?.(box) ?? lowestSampleOneByOne(ground.sampleAt, box)),
  };
}

/**
 * The samples a ground with ice laid over it may stand off the board at: those of the ground and those
 * the ice lifts. Unknown where the ground's own are.
 */
function extentWithIce(
  extent: SampleBox | null | undefined,
  iced: readonly (readonly [number, number])[]
): SampleBox | null | undefined {
  if (extent === undefined) return undefined;
  let box: SampleBox | null = extent;
  for (const [i, j] of iced) {
    box = box
      ? { i0: Math.min(box.i0, i), j0: Math.min(box.j0, j), i1: Math.max(box.i1, i), j1: Math.max(box.j1, j) }
      : { i0: i, j0: j, i1: i, j1: j };
  }
  return box;
}
