import { pieceCentreOf, pieceCentreOffsetPx, placedCentreOf } from '@axe/domain/tabletop/move/piece-on-grid';

describe('the middle of a piece', () => {
  const at = { x: 100, y: 40 };

  it('is half its width in from the corner it is placed by', () => {
    expect(pieceCentreOf({ location: at, size: 1 }, 50)).toEqual({ x: 125, y: 65 });
    expect(pieceCentreOf({ location: at, size: 2 }, 50)).toEqual({ x: 150, y: 90 });
    expect(pieceCentreOffsetPx({ location: at, size: 3 }, 50)).toBe(75);
  });

  it('is the corner itself for a piece of no size, which is drawn as a point there', () => {
    expect(pieceCentreOf({ location: at, size: 0 }, 50)).toEqual(at);
    expect(pieceCentreOffsetPx({ location: at, size: 0 }, 50)).toBe(0);
  });

  it('takes a size that is not a number of cells as none', () => {
    expect(pieceCentreOf({ location: at, size: -2 }, 50)).toEqual(at);
    expect(pieceCentreOf({ location: at, size: Number.NaN }, 50)).toEqual(at);
  });
});

describe('the middle of anything placed on the table', () => {
  const at = { x: 100, y: 40 };

  it('is half the width and half the height in for a thing that measures both', () => {
    expect(placedCentreOf({ location: at, width: 2, height: 4 }, 50)).toEqual({ x: 150, y: 140 });
  });

  it('is where the piece has its middle for a thing of one size, a point for a piece of none', () => {
    expect(placedCentreOf({ location: at, size: 2 }, 50)).toEqual({ x: 150, y: 90 });
    expect(placedCentreOf({ location: at, size: 0 }, 50)).toEqual(at);
  });

  it('takes a thing that says neither as filling one cell', () => {
    expect(placedCentreOf({ location: at }, 50)).toEqual({ x: 125, y: 65 });
    expect(placedCentreOf({ location: at, width: 'wide' }, 50)).toEqual({ x: 125, y: 65 });
  });
});
