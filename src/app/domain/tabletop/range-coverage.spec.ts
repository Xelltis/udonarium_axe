import { rangeCovers, RangeShapeInput } from '@axe/domain/tabletop/range-coverage';

const GRID = 50;

function range(more: Partial<RangeShapeInput>): RangeShapeInput {
  return { type: 'CIRCLE', length: 2, width: 1, rotate: 0, origin: { x: 500, y: 500 }, ...more };
}

describe('rangeCovers', () => {
  it('takes in a circle up to its edge', () => {
    expect(rangeCovers(range({}), GRID, { x: 600, y: 500 })).toBe(true);
    expect(rangeCovers(range({}), GRID, { x: 571, y: 571 })).toBe(false);
  });

  it('takes in a square reaching its length each way, turned with the range', () => {
    expect(rangeCovers(range({ type: 'SQUARE' }), GRID, { x: 595, y: 595 })).toBe(true);
    expect(rangeCovers(range({ type: 'SQUARE', rotate: 45 }), GRID, { x: 595, y: 595 })).toBe(false);
  });

  it('takes in a line running out from its start, as wide as it is, turned with the range', () => {
    const line = range({ type: 'LINE', length: 4, width: 1 });
    expect(rangeCovers(line, GRID, { x: 690, y: 520 })).toBe(true);
    expect(rangeCovers(line, GRID, { x: 690, y: 530 })).toBe(false);
    expect(rangeCovers(line, GRID, { x: 490, y: 500 })).toBe(false);
    expect(rangeCovers({ ...line, rotate: 90 }, GRID, { x: 500, y: 690 })).toBe(true);
  });

  it('measures a range as it is drawn, at least a cell long and a tenth of a cell wide', () => {
    expect(rangeCovers(range({ length: 0 }), GRID, { x: 550, y: 500 })).toBe(true);
    expect(rangeCovers(range({ type: 'LINE', length: 3, width: 0 }), GRID, { x: 550, y: 502 })).toBe(true);
  });

  it('works out nothing for a shape it does not know', () => {
    expect(rangeCovers(range({ type: 'CORN' }), GRID, { x: 500, y: 500 })).toBeNull();
  });
});
