import {
  GROUND_CHUNK_SAMPLE_COUNT,
  GROUND_CHUNK_SAMPLES,
  GROUND_HEIGHT_STEP,
  GroundChunkData,
} from '@axe/domain/tabletop/ground/ground-chunk-data';

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
          const height = Math.max(-HEIGHT_LIMIT, Math.min(HEIGHT_LIMIT, steps));
          heights[j * GROUND_CHUNK_SAMPLES + i] = height;
          if (height !== 0) raised = true;
        }
      }
      if (raised) chunks.push({ cx, cy, heights, paint: null });
    }
  }
  return chunks;
}
