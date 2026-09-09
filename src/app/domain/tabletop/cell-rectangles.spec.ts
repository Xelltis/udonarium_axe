import { parseCellKey } from '@axe/domain/tabletop/cell-key';
import {
  CellRect,
  largestRectangles,
  largestRectanglesOf,
  rectCells,
  rectKey,
} from '@axe/domain/tabletop/cell-rectangles';

function keysOf(rects: readonly CellRect[]): string[] {
  return rects.map(rectKey).sort();
}

describe('rectCells()', () => {
  it('walks every cell a block covers', () => {
    expect(rectCells({ col: 1, row: 2, width: 2, height: 2 }).sort()).toEqual(['1,2', '1,3', '2,2', '2,3']);
  });
});

describe('largestRectangles()', () => {
  it('makes nothing out of nothing', () => {
    expect(largestRectangles([])).toEqual([]);
  });

  it('makes one block of one cell', () => {
    expect(largestRectangles(['3,4'])).toEqual([{ col: 3, row: 4, width: 1, height: 1 }]);
  });

  it('makes one long block out of a row', () => {
    expect(largestRectangles(['0,0', '1,0', '2,0'])).toEqual([{ col: 0, row: 0, width: 3, height: 1 }]);
  });

  it('makes one tall block out of a column', () => {
    expect(largestRectangles(['0,0', '0,1', '0,2'])).toEqual([{ col: 0, row: 0, width: 1, height: 3 }]);
  });

  it('makes one block out of a square', () => {
    expect(largestRectangles(rectCells({ col: 2, row: 2, width: 3, height: 3 }))).toEqual([
      { col: 2, row: 2, width: 3, height: 3 },
    ]);
  });

  it('cuts a shape that is not a block into as few as it can', () => {
    // An L: three across the top, one hanging below the left of it.
    const rects = largestRectangles(['0,0', '1,0', '2,0', '0,1']);

    expect(rects).toHaveLength(2);
    expect(keysOf(rects)).toEqual(['0,0,3,1', '0,1,1,1']);
  });

  it('leaves a gap between two blocks that do not touch', () => {
    expect(keysOf(largestRectangles(['0,0', '2,0']))).toEqual(['0,0,1,1', '2,0,1,1']);
  });

  it('covers every cell it was given exactly once', () => {
    const cells = ['0,0', '1,0', '2,0', '0,1', '1,1', '2,2'];

    const covered = largestRectangles(cells).flatMap(rectCells);

    expect(covered.sort()).toEqual([...cells].sort());
    expect(new Set(covered).size).toBe(covered.length);
  });

  it('answers the same way twice, so laying it twice builds the same walls', () => {
    const cells = ['1,1', '2,1', '1,2', '2,2', '3,2'];

    expect(keysOf(largestRectangles(cells))).toEqual(keysOf(largestRectangles([...cells].reverse())));
  });

  it('passes over a key it cannot read', () => {
    expect(largestRectangles(['nonsense', '-1,0', '1,1'])).toEqual([{ col: 1, row: 1, width: 1, height: 1 }]);
  });
});

describe('largestRectanglesOf()', () => {
  const paintings = [
    ['0,0', '1,0', '0,1', '1,1'],
    ['2,2'],
    ['0,0', '2,0', '4,0', '0,2', '2,2', '4,2'],
    ['3,1', '4,1', '5,1', '3,2', '4,2', '5,2', '5,3'],
    [],
  ];

  it('cuts the same blocks as the same painting written as keys', () => {
    for (const painting of paintings) {
      const cells = painting.map((key) => parseCellKey(key)!);

      expect(largestRectanglesOf(cells)).toEqual(largestRectangles(painting));
    }
  });

  it('passes over a cell off the board', () => {
    expect(
      largestRectanglesOf([
        { col: -1, row: 0 },
        { col: 0, row: -1 },
        { col: 4, row: 4 },
      ])
    ).toEqual([{ col: 4, row: 4, width: 1, height: 1 }]);
  });
});
