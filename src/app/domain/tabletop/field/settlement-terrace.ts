import { clamp } from '@axe/core/util/clamp';
import {
  cellOfLayoutPoint,
  layoutPointOfSample,
  sampleOfLayoutPoint,
} from '@axe/domain/tabletop/field/field-sample-points';
import { SETTLEMENT_ZONES, SettlementLayout } from '@axe/domain/tabletop/field/settlement-layout';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { GroundRaster } from '@axe/domain/tabletop/ground/ground-raster';

/** How far round the settlement the ground is kept as level as the settlement itself, in cells. */
export const TERRACE_APRON_CELLS = 1;
/** Over how many cells past the apron the ground goes from the settlement's level to the open country's. */
export const TERRACE_BLEND_CELLS = 2;

/**
 * The cells a settlement stands on: everything it laid down (roads, yards, floors, fields and
 * paddies, walls and gates, buildings, crops, things and fires), each as 1.
 */
export function settlementSiteOf(layout: SettlementLayout, width: number, height: number): Uint8Array {
  const site = new Uint8Array(width * height);
  for (let index = 0; index < site.length; index++) {
    if (layout.zones[index] !== SETTLEMENT_ZONES.ground || layout.walls[index] !== 0 || layout.taken[index]) {
      site[index] = 1;
    }
  }
  const mark = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) site[y * width + x] = 1;
  };
  for (const crop of layout.crops) {
    for (let y = crop.rect.y; y < crop.rect.y + crop.rect.h; y++) {
      for (let x = crop.rect.x; x < crop.rect.x + crop.rect.w; x++) mark(x, y);
    }
  }
  for (const point of [...layout.doors, ...layout.things, ...layout.fires]) mark(point.x, point.y);
  return site;
}

/**
 * The middle of a settlement: what a fort's wall rings round, or the middle of all the cells a
 * village stands on. The middle of the board when it stands on nothing.
 */
export function settlementMiddleOf(
  layout: SettlementLayout,
  site: Uint8Array,
  width: number,
  height: number
): { x: number; y: number } {
  if (layout.ring) return layout.ring.middle;
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  for (let index = 0; index < site.length; index++) {
    if (!site[index]) continue;
    count++;
    sumX += index % width;
    sumY += Math.floor(index / width);
  }
  if (count === 0) return { x: Math.floor(width / 2), y: Math.floor(height / 2) };
  return { x: Math.round(sumX / count), y: Math.round(sumY / count) };
}

/**
 * How far each cell stands from the nearest cell of the site, counting a step to any of the eight
 * neighbours as one; 0 on the site itself.
 */
export function cellDistancesFrom(site: Uint8Array, width: number, height: number): Float32Array {
  const distance = new Float32Array(site.length).fill(Infinity);
  const queue: number[] = [];
  for (let index = 0; index < site.length; index++) {
    if (site[index]) {
      distance[index] = 0;
      queue.push(index);
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (distance[next] !== Infinity) continue;
        distance[next] = distance[index] + 1;
        queue.push(next);
      }
    }
  }
  return distance;
}

/**
 * Levels the ground under a settlement into a terrace.
 *
 * Buildings, walls, fences and crops are laid for level ground, so the whole site, and an apron of
 * cells round it, is brought to one height: the open country's height at the settlement's middle,
 * never below the floor. Past the apron the ground runs from that height to the open country's
 * over a band of cells, so there is no step; beyond the band it is the open country's raster as it
 * was. The raster is read by the layout cell each sample falls in, which holds on a hex board too.
 */
export function terraceSettlement(
  raster: GroundRaster,
  layout: SettlementLayout,
  size: { width: number; height: number },
  gridType: GridType,
  apronCells = TERRACE_APRON_CELLS,
  blendCells = TERRACE_BLEND_CELLS
): GroundRaster {
  const { width, height } = size;
  const site = settlementSiteOf(layout, width, height);
  const distance = cellDistancesFrom(site, width, height);
  const middle = settlementMiddleOf(layout, site, width, height);
  const level = Math.max(0, sampleHeightAt(raster, gridType, middle.x, middle.y));
  const heights = new Float32Array(raster.heights.length);
  for (let row = 0; row < raster.rows; row++) {
    for (let column = 0; column < raster.columns; column++) {
      const index = row * raster.columns + column;
      const cell = cellOfLayoutPoint(layoutPointOfSample(gridType, column, row));
      const x = clamp(cell.x, 0, width - 1);
      const y = clamp(cell.y, 0, height - 1);
      const away = clamp((distance[y * width + x] - apronCells) / blendCells, 0, 1);
      heights[index] = level * (1 - away) + raster.heights[index] * away;
    }
  }
  return { columns: raster.columns, rows: raster.rows, heights };
}

/** The height of the raster at the sample nearest the middle of a cell of the layout. */
function sampleHeightAt(raster: GroundRaster, gridType: GridType, x: number, y: number): number {
  const sample = sampleOfLayoutPoint(gridType, { x, y });
  const column = clamp(sample.column, 0, raster.columns - 1);
  const row = clamp(sample.row, 0, raster.rows - 1);
  return raster.heights[row * raster.columns + column];
}
