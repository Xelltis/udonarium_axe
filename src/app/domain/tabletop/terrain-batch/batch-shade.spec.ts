import { capShadeRows, runShade } from '@axe/domain/tabletop/terrain-batch/batch-shade';
import { SquareBlock, squareCapsOf } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { wallRunsOf } from '@axe/domain/tabletop/terrain-batch/wall-runs';
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

  it('comes down to one stop for a row lit evenly', () => {
    const [cap] = squareCapsOf([block('a', 0), block('b', 1), block('c', 2)], GRID);

    expect(capShadeRows(cap, GRID, () => 0.25)).toEqual([[{ at: 1, value: 0.25 }]]);
  });
});

describe('the shade along a run of wall', () => {
  it('shades each face by its own cells and changes at once between faces', () => {
    const [run] = wallRunsOf([
      { identifier: 'a', side: 'south', startX: 0, startY: 50, lengthPx: 100, heightPx: 100, look: 'stone' },
      { identifier: 'b', side: 'south', startX: 100, startY: 50, lengthPx: 50, heightPx: 100, look: 'stone' },
    ]);

    expect(runShade(run, (face) => (face.identifier === 'a' ? [0.2, 0.6] : [1]))).toEqual([
      { at: 0, value: 0.2 },
      { at: 25, value: 0.2 },
      { at: 75, value: 0.6 },
      { at: 100, value: 0.6 },
      { at: 100, value: 1 },
    ]);
  });

  it('spreads one reading for a whole face over all of it', () => {
    const [run] = wallRunsOf([
      { identifier: 'a', side: 'north', startX: 0, startY: 0, lengthPx: 150, heightPx: 100, look: 'stone' },
    ]);

    expect(runShade(run, () => [0.4])).toEqual([{ at: 0, value: 0.4 }]);
  });
});
