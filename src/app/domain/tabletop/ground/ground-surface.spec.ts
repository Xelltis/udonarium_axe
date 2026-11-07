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

  it('finds the lowest ground under a block exactly, at a point between samples where its edge crosses a dip', () => {
    const ground = groundSurfaceOf([chunk(0, 0, [[1, 1, -64]])]);

    expect(groundLiftOfBlock(ground, 50, { location: { x: 5, y: 12.5 }, width: 0.8, depth: 0.2 })).toBeCloseTo(-45, 9);
    expect(groundLiftOfBlock(ground, 50, { location: { x: 0, y: 0 }, width: 1, depth: 1 })).toBe(-50);
    expect(groundLiftOfBlock(ground, 50, { location: { x: 100, y: 0 }, width: 1, depth: 1 })).toBe(0);
  });

  it('weighs a block reaching past the ground kept by the samples kept and the board beyond, however vast it is', () => {
    const kept = groundSurfaceOf([
      chunk(0, 0, [
        [1, 1, 64],
        [3, 3, -32],
      ]),
      chunk(1, 1, [[0, 0, 64]]),
    ]);
    let read = 0;
    const ground: GroundSurface = {
      ...kept,
      sampleAt: (i, j) => {
        read++;
        return kept.sampleAt(i, j);
      },
    };

    expect(groundLiftOfBlock(ground, 50, { location: { x: -500, y: -500 }, width: 10000, depth: 10000 })).toBe(-25);
    expect(read).toBeLessThan(2_000);
    expect(groundLiftOfBlock(ground, 50, { location: { x: 25, y: 25 }, width: 0, depth: 0 })).toBe(50);
    expect(groundLiftOfBlock(ground, 50, { location: { x: 50, y: 50 }, width: 0.5, depth: 0.5 })).toBe(-25);
  });

  it('reads the ground sloping from the last sample kept back down to the board beside it', () => {
    const plateau = groundSurfaceOf([
      chunk(
        0,
        0,
        Array.from({ length: GROUND_CHUNK_SAMPLE_COUNT }, (_, at): [number, number, number] => [
          at % GROUND_CHUNK_SAMPLES,
          Math.floor(at / GROUND_CHUNK_SAMPLES),
          64,
        ])
      ),
    ]);
    const dipped = groundSurfaceOf([
      chunk(0, 0, [
        [31, 10, -64],
        [31, 11, 64],
      ]),
    ]);

    expect(groundLiftOfBlock(plateau, 50, { location: { x: 760, y: 0 }, width: 0.6, depth: 1 })).toBeCloseTo(20, 9);
    expect(groundLiftOfBlock(dipped, 50, { location: { x: 750, y: 262.5 }, width: 5, depth: 2 })).toBeCloseTo(-25, 9);
  });

  it('reads a surface that cannot say where it stands off the board at a bounded number of points, however vast the block', () => {
    let read = 0;
    const dug: GroundSurface = {
      isFlat: false,
      sampleAt: () => {
        read++;
        return -0.5;
      },
      paintAt: () => null,
      heightAt: () => -0.5,
    };

    expect(groundLiftOfBlock(dug, 50, { location: { x: 0, y: 0 }, width: Number.POSITIVE_INFINITY, depth: 1 })).toBe(
      -25
    );
    expect(groundLiftOfBlock(dug, 50, { location: { x: 0, y: 0 }, width: 2000, depth: 2000 })).toBe(-25);
    expect(read).toBeLessThan(4 * 514 * 514);
  });

  it('takes no ground under a block of no size or of no place, nor any off the board', () => {
    const ground = groundSurfaceOf([chunk(0, 0, [[0, 0, 64]])]);

    expect(groundLiftOfBlock(ground, 50, { location: { x: 0, y: 0 }, width: 0, depth: 0 })).toBe(50);
    expect(groundLiftOfBlock(ground, 50, { location: { x: Number.NaN, y: 0 }, width: 1, depth: 1 })).toBe(0);
    expect(groundLiftOfBlock(FLAT_GROUND, 50, { location: { x: 0, y: 0 }, width: 1, depth: 1 })).toBe(0);
    expect(ground.lowestSampleIn?.({ i0: -2, j0: -2, i1: -1, j1: -1 })).toBe(0);
    expect(ground.lowestSampleIn?.({ i0: 1, j0: 1, i1: 0, j1: 0 })).toBe(Infinity);
  });

  it('reads a surface that cannot tell the lowest of its samples one by one, in the box it may stand off the board in', () => {
    const kept = groundSurfaceOf([chunk(0, 0, [[2, 2, -64]])]);
    const { lowestSampleIn: _lowest, ...ground } = kept;

    expect(groundLiftOfBlock(ground, 50, { location: { x: 0, y: 0 }, width: 3, depth: 3 })).toBe(-50);
  });
});
