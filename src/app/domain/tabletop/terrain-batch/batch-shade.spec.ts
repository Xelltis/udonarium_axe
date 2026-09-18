import { capShadeRows, wallShade } from '@axe/domain/tabletop/terrain-batch/batch-shade';
import { SquareBlock, squareCapsOf } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { SquareWall } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function block(identifier: string, col: number, cols = 1): SquareBlock {
  return { identifier, col, row: 0, cols, rows: 1, topPx: 100, look: 'stone' };
}

describe('the shade across a cap', () => {
  it('runs smoothly across one block, from the middle of one cell to the middle of the next', () => {
    const [cap] = squareCapsOf([block('long', 0, 2)], GRID);
    const light = [1, 0.5];

    expect(capShadeRows(cap, GRID, (cell) => light[cell.index])).toEqual([
      [
        { at: 1, value: 1 },
        { at: 26, value: 1 },
        { at: 76, value: 0.5 },
      ],
    ]);
  });

  it('changes at once where one block meets the next', () => {
    const [cap] = squareCapsOf([block('lit', 0), block('dark', 1)], GRID);

    expect(capShadeRows(cap, GRID, (cell) => (cell.identifier === 'lit' ? 1 : 0.5))).toEqual([
      [
        { at: 1, value: 1 },
        { at: 51, value: 1 },
        { at: 51, value: 0.5 },
      ],
    ]);
  });

  it('runs on towards the next cell of a block that goes on into the cap beside it', () => {
    const [west, east] = squareCapsOf([{ ...block('long', 6, 4) }], GRID);
    const light = [1, 1, 0.5, 0.5];

    // The block's third cell is the first one past the edge of the chunk.
    expect(capShadeRows(west, GRID, (cell) => light[cell.index])).toEqual([
      [
        { at: 1, value: 1 },
        { at: 76, value: 1 },
        { at: 126, value: 0.5 },
      ],
    ]);
    expect(capShadeRows(east, GRID, (cell) => light[cell.index])).toEqual([
      [
        { at: -24, value: 1 },
        { at: 26, value: 0.5 },
      ],
    ]);
  });

  it('comes down to one stop for a row lit evenly', () => {
    const [cap] = squareCapsOf([block('a', 0), block('b', 1), block('c', 2)], GRID);

    expect(capShadeRows(cap, GRID, () => 0.25)).toEqual([[{ at: 1, value: 0.25 }]]);
  });
});

describe('the shade along a wall', () => {
  const wall: SquareWall = {
    key: 'a:south',
    identifier: 'a',
    side: 'south',
    startX: 0,
    startY: 50,
    lengthPx: 100,
    heightPx: 100,
  };

  it('runs smoothly from the middle of one cell to the middle of the next, holding out to the ends', () => {
    expect(wallShade(wall, [0.2, 0.6])).toEqual([
      { at: 0, value: 0.2 },
      { at: 25, value: 0.2 },
      { at: 75, value: 0.6 },
    ]);
  });

  it('spreads one reading for a whole wall over all of it', () => {
    expect(wallShade(wall, [0.4])).toEqual([{ at: 0, value: 0.4 }]);
  });
});
