import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import {
  FLAT_GROUND,
  groundLiftOfBlock,
  type GroundSurface,
  groundSurfaceOf,
} from '@axe/domain/tabletop/ground/ground-surface';

/** A chunk with the samples given raised, by their place across and down it, in steps of a 64th of a cell. */
function chunk(cx: number, cy: number, raised: [number, number, number][] = []) {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT);
  for (const [i, j, steps] of raised) heights[j * GROUND_CHUNK_SAMPLES + i] = steps;
  return { cx, cy, heights, paint: null };
}

describe('the ground of a table', () => {
  it('is the board itself where no chunk is kept, or where every chunk is flat', () => {
    expect(groundSurfaceOf([])).toBe(FLAT_GROUND);
    expect(groundSurfaceOf([chunk(0, 0)])).toBe(FLAT_GROUND);
    expect(FLAT_GROUND.heightAt(3, 4)).toBe(0);
  });

  it('reads a sample in cells, from the chunk it lies in, and nothing where no chunk is kept', () => {
    const ground = groundSurfaceOf([chunk(1, 0, [[2, 3, 128]]), chunk(0, 0, [[0, 0, -32]])]);

    expect(ground.isFlat).toBe(false);
    expect(ground.sampleAt(GROUND_CHUNK_SAMPLES + 2, 3)).toBe(2);
    expect(ground.sampleAt(0, 0)).toBe(-0.5);
    expect(ground.sampleAt(0, GROUND_CHUNK_SAMPLES)).toBe(0);
    expect(ground.sampleAt(-1, 0)).toBe(0);
  });

  it('stands at the height of a sample on the sample, a sample every half cell', () => {
    const ground = groundSurfaceOf([chunk(0, 0, [[2, 4, 64]])]);

    expect(ground.heightAt(1, 2)).toBe(1);
  });

  it('reads between samples as the triangle of them a point lies in, split from top left to bottom right', () => {
    const ground = groundSurfaceOf([chunk(0, 0, [[1, 0, 64]])]);

    expect(ground.heightAt(0.25, 0.125)).toBeCloseTo(0.25, 9);
    expect(ground.heightAt(0.125, 0.25)).toBeCloseTo(0, 9);
  });

  it('reads the ground under a vast block at a bounded number of points, and under a cell at every half cell', () => {
    let read = 0;
    const ground: GroundSurface = {
      ...groundSurfaceOf([chunk(0, 0, [[1, 1, 64]])]),
      heightAt: (x, y) => {
        read++;
        return x === 0 && y === 0 ? -1 : 0;
      },
    };

    expect(groundLiftOfBlock(ground, 50, { location: { x: 0, y: 0 }, width: 10000, depth: 10000 })).toBe(-50);
    expect(read).toBeLessThanOrEqual(513 * 513);
    read = 0;
    groundLiftOfBlock(ground, 50, { location: { x: 0, y: 0 }, width: 1, depth: 1 });
    expect(read).toBe(9);
  });
});
