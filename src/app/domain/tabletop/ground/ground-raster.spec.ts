import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_CHUNK_SAMPLES, GROUND_SAMPLES_PER_CELL } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { groundChunksOfRaster, groundRasterOver } from '@axe/domain/tabletop/ground/ground-raster';
import { groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { boardExtentPx } from '@axe/domain/tabletop/map-grid';

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

describe('the ground laid over a whole board', () => {
  it('has a sample to every half cell of a square board, its far edges included', () => {
    const raster = groundRasterOver({ width: 4, height: 3 }, GridType.SQUARE);

    expect([raster.columns, raster.rows]).toEqual([4 * GROUND_SAMPLES_PER_CELL + 1, 3 * GROUND_SAMPLES_PER_CELL + 1]);
    expect(raster.heights).toHaveLength(raster.columns * raster.rows);
    expect(Array.from(raster.heights).every((height) => height === 0)).toBe(true);
  });

  it.each([GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL])(
    'reaches as far as the cells of hex board %s do',
    (type) => {
      const size = { width: 5, height: 4 };
      const extent = boardExtentPx(size, { type, sizePx: 1 });

      const raster = groundRasterOver(size, type);

      expect((raster.columns - 1) / GROUND_SAMPLES_PER_CELL).toBeGreaterThanOrEqual(extent.widthPx);
      expect((raster.rows - 1) / GROUND_SAMPLES_PER_CELL).toBeGreaterThanOrEqual(extent.heightPx);
      expect((raster.columns - 2) / GROUND_SAMPLES_PER_CELL).toBeLessThan(extent.widthPx);
      expect((raster.rows - 2) / GROUND_SAMPLES_PER_CELL).toBeLessThan(extent.heightPx);
    }
  );

  it('asks each height by where its sample lies, in cells', () => {
    const raster = groundRasterOver({ width: 2, height: 1 }, GridType.SQUARE, (x, y) => x * 10 + y);

    expect(Array.from(raster.heights)).toEqual([0, 5, 10, 15, 20, 0.5, 5.5, 10.5, 15.5, 20.5, 1, 6, 11, 16, 21]);
  });
});
