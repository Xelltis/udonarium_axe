import { clamp } from '@axe/core/util/clamp';
import { GridType } from '@axe/domain/tabletop/grid-type';
import {
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GROUND_SAMPLES_PER_CELL,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';
import type { MapSize } from '@axe/domain/tabletop/map-blocks';
import { boardExtentPx } from '@axe/domain/tabletop/map-grid';

/**
 * Heights of the ground laid out over the board, one to every sample from its top left corner, row by
 * row and in cells, the way something that works the whole board out at once hands them over.
 */
export interface GroundRaster {
  readonly columns: number;
  readonly rows: number;
  readonly heights: Float32Array;
}

const HEIGHT_LIMIT = 32767;

/**
 * The ground laid over a whole board: a sample to every half cell from its top left corner out to its
 * far edges, hex boards measured by how far their cells reach. Each height is asked for by where its
 * sample lies, in cells across and down; left unasked the ground lies on the board everywhere.
 *
 * Everything that works out the ground of a whole board lays it here, so every such raster has the
 * samples the table reads the board by.
 */
export function groundRasterOver(
  size: MapSize,
  gridType: GridType,
  heightAt?: (x: number, y: number) => number
): GroundRaster {
  const extent = boardExtentPx(size, { type: gridType, sizePx: 1 });
  const columns = Math.ceil(extent.widthPx * GROUND_SAMPLES_PER_CELL) + 1;
  const rows = Math.ceil(extent.heightPx * GROUND_SAMPLES_PER_CELL) + 1;
  const heights = new Float32Array(columns * rows);
  if (heightAt) {
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        heights[row * columns + column] = heightAt(column / GROUND_SAMPLES_PER_CELL, row / GROUND_SAMPLES_PER_CELL);
      }
    }
  }
  return { columns, rows, heights };
}

/**
 * The chunks that keep a raster of heights, unpainted: one for every chunk the raster reaches that
 * stands anywhere off the board, and none where it is flat, which is what a missing chunk already is.
 */
export function groundChunksOfRaster(raster: GroundRaster): GroundChunkData[] {
  const chunks: GroundChunkData[] = [];
  const across = Math.ceil(raster.columns / GROUND_CHUNK_SAMPLES);
  const down = Math.ceil(raster.rows / GROUND_CHUNK_SAMPLES);
  for (let cy = 0; cy < down; cy++) {
    for (let cx = 0; cx < across; cx++) {
      const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
      let raised = false;
      for (let j = 0; j < GROUND_CHUNK_SAMPLES; j++) {
        const row = cy * GROUND_CHUNK_SAMPLES + j;
        if (row >= raster.rows) break;
        for (let i = 0; i < GROUND_CHUNK_SAMPLES; i++) {
          const column = cx * GROUND_CHUNK_SAMPLES + i;
          if (column >= raster.columns) break;
          const steps = Math.round(raster.heights[row * raster.columns + column] / GROUND_HEIGHT_STEP);
          const height = clamp(steps, -HEIGHT_LIMIT, HEIGHT_LIMIT);
          heights[j * GROUND_CHUNK_SAMPLES + i] = height;
          if (height !== 0) raised = true;
        }
      }
      if (raised) chunks.push({ cx, cy, heights, paint: null });
    }
  }
  return chunks;
}
