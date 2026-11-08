import { GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundChunksOfRaster } from '@axe/domain/tabletop/ground/ground-raster';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';

describe('a raster of heights kept as chunks of the ground', () => {
  it('keeps every sample at its height, in the chunk it falls in', () => {
    const columns = GROUND_CHUNK_SAMPLES + 5;
    const rows = 3;
    const heights = new Float32Array(columns * rows);
    heights[1 * columns + 2] = 1.5;
    heights[2 * columns + GROUND_CHUNK_SAMPLES + 4] = -0.25;

    const chunks = groundChunksOfRaster({ columns, rows, heights });

    expect(chunks.map((chunk) => [chunk.cx, chunk.cy])).toEqual([
      [0, 0],
      [1, 0],
    ]);
    const ground = groundSurfaceOf(chunks);
    expect(ground.sampleAt(2, 1)).toBe(1.5);
    expect(ground.sampleAt(GROUND_CHUNK_SAMPLES + 4, 2)).toBe(-0.25);
  });

  it('keeps no chunk where the raster is flat', () => {
    const columns = GROUND_CHUNK_SAMPLES * 2;
    const heights = new Float32Array(columns * 2);
    heights[3] = 1;

    expect(groundChunksOfRaster({ columns, rows: 2, heights }).map((chunk) => chunk.cx)).toEqual([0]);
  });
});
