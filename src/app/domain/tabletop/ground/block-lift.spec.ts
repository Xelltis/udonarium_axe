import { GridType } from '@axe/domain/tabletop/grid-type';
import { blockLiftsTo } from '@axe/domain/tabletop/ground/block-lift';
import { groundRasterOver } from '@axe/domain/tabletop/ground/ground-raster';

const SIZE = { width: 6, height: 3 };

/** Ground dug a cell deep under the two columns on the left, and left on the board beyond them. */
function dugOnTheLeft(gridType = GridType.SQUARE) {
  return groundRasterOver(SIZE, gridType, (x) => (x < 2 ? -1 : 0));
}

describe('blockLiftsTo', () => {
  it('lifts nothing over ground no generator shaped', () => {
    const liftOf = blockLiftsTo(0, null, GridType.SQUARE);

    expect(liftOf({ x: 0, y: 0, w: 2, h: 1 })).toBeUndefined();
  });

  it('lifts a block by as much as the lowest ground under it falls short of the level', () => {
    const liftOf = blockLiftsTo(0, dugOnTheLeft(), GridType.SQUARE);

    expect(liftOf({ x: 0, y: 0, w: 2, h: 1 })).toBeCloseTo(1, 5);
    expect(liftOf({ x: 1, y: 1, w: 3, h: 1 })).toBeCloseTo(1, 5);
  });

  it('lifts nothing where the ground under the block already stands at the level', () => {
    const liftOf = blockLiftsTo(0, dugOnTheLeft(), GridType.SQUARE);

    expect(liftOf({ x: 3, y: 0, w: 2, h: 1 })).toBeUndefined();
  });

  it('never lets a block down to a level under its ground', () => {
    const liftOf = blockLiftsTo(-1, dugOnTheLeft(), GridType.SQUARE);

    expect(liftOf({ x: 0, y: 0, w: 2, h: 1 })).toBeUndefined();
    expect(liftOf({ x: 3, y: 0, w: 2, h: 1 })).toBeUndefined();
  });

  it('reads the ground under the foot alone where the foot is narrower than the rectangle', () => {
    const liftOf = blockLiftsTo(0, dugOnTheLeft(), GridType.SQUARE);
    const rect = { x: 1, y: 0, w: 5, h: 1 };

    expect(liftOf(rect)).toBeCloseTo(1, 5);
    expect(liftOf(rect, undefined, { w: 1, d: 1 })).toBeUndefined();
  });

  it('reads the ground where the block is shifted to', () => {
    const liftOf = blockLiftsTo(0, dugOnTheLeft(), GridType.SQUARE);
    const rect = { x: 3, y: 0, w: 1, h: 1 };

    expect(liftOf(rect)).toBeUndefined();
    expect(liftOf(rect, { x: -3, y: 0 })).toBeCloseTo(1, 5);
  });

  it('reads a hex board by where its cells lie', () => {
    const liftOf = blockLiftsTo(0, dugOnTheLeft(GridType.HEX_VERTICAL), GridType.HEX_VERTICAL);

    expect(liftOf({ x: 0, y: 0, w: 1, h: 1 })).toBeCloseTo(1, 5);
    expect(liftOf({ x: 5, y: 1, w: 1, h: 1 })).toBeUndefined();
  });
});
