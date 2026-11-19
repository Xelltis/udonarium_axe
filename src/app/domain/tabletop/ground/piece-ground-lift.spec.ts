import { GridType } from '@axe/domain/tabletop/grid-type';
import { GROUND_CHUNK_SAMPLE_COUNT, GROUND_CHUNK_SAMPLES } from '@axe/domain/tabletop/ground/ground-chunk-data';
import { FLAT_GROUND, groundSurfaceOf } from '@axe/domain/tabletop/ground/ground-surface';
import { pieceGroundLiftAt, standingTopPxAt } from '@axe/domain/tabletop/ground/piece-ground-lift';
import { Terrain } from '@axe/domain/tabletop/terrain';

const GRID = 50;

/** Ground raised a cell all over the first chunk, but for the sample at the given place, left at the floor. */
function raisedButFor(i: number, j: number) {
  const heights = new Int16Array(GROUND_CHUNK_SAMPLE_COUNT).fill(64);
  heights[j * GROUND_CHUNK_SAMPLES + i] = 0;
  return groundSurfaceOf([{ cx: 0, cy: 0, heights, paint: null }]);
}

/** A block two cells square and a cell high, its corner at the point given. */
function blockAt(x: number, y: number): Terrain {
  const terrain = Terrain.create('台', 2, 2, 1, 'stone', 'slab');
  terrain.location = { name: 'table', x, y };
  return terrain;
}

describe('pieceGroundLiftAt', () => {
  it('lifts nothing on flat ground', () => {
    expect(pieceGroundLiftAt(FLAT_GROUND, GRID, GridType.SQUARE, [blockAt(100, 100)], 150, 150, 0)).toBe(0);
  });

  it('lifts a piece on the floor by the ground under its middle', () => {
    const ground = raisedButFor(4, 4);

    expect(pieceGroundLiftAt(ground, GRID, GridType.SQUARE, [blockAt(100, 100)], 150, 150, 0)).toBe(GRID);
  });

  it('lifts a piece on a block as far as the block, the lowest ground under it, to keep it on the top', () => {
    const ground = raisedButFor(4, 4);

    expect(pieceGroundLiftAt(ground, GRID, GridType.SQUARE, [blockAt(100, 100)], 150, 150, GRID)).toBe(0);
  });
});

describe('standingTopPxAt', () => {
  it('is the ground where no block stands over the point', () => {
    expect(standingTopPxAt(FLAT_GROUND, GRID, GridType.SQUARE, [blockAt(100, 100)], 50, 50, 500)).toBe(0);
    expect(standingTopPxAt(raisedButFor(4, 4), GRID, GridType.SQUARE, [], 50, 50, 500)).toBe(GRID);
  });

  it('is the top of a block over the point that can be stood on, rather than the ground under it', () => {
    expect(standingTopPxAt(FLAT_GROUND, GRID, GridType.SQUARE, [blockAt(100, 100)], 150, 150, 500)).toBe(GRID);
  });

  it('is the higher of two blocks standing one on the other', () => {
    const upper = blockAt(100, 100);
    upper.posZ = GRID;

    expect(standingTopPxAt(FLAT_GROUND, GRID, GridType.SQUARE, [blockAt(100, 100), upper], 150, 150, 500)).toBe(
      2 * GRID
    );
  });

  it('passes by a block whose top stands over where the thing comes down from', () => {
    const bridge = blockAt(100, 100);
    bridge.posZ = 4 * GRID;

    expect(standingTopPxAt(FLAT_GROUND, GRID, GridType.SQUARE, [blockAt(100, 100), bridge], 150, 150, 3 * GRID)).toBe(
      GRID
    );
  });

  it('passes by a block that cannot be stood on', () => {
    const wall = blockAt(100, 100);
    wall.blocksClimb = true;

    expect(standingTopPxAt(FLAT_GROUND, GRID, GridType.SQUARE, [wall], 150, 150, 500)).toBe(0);
  });

  it('stands a block on raised ground as high as the ground lifts it', () => {
    const ground = raisedButFor(0, 0);

    expect(standingTopPxAt(ground, GRID, GridType.SQUARE, [blockAt(100, 100)], 150, 150, 500)).toBe(2 * GRID);
  });
});
