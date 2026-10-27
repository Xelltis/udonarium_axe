import { pieceCentreOf, pieceCentreOffsetPx } from '@axe/domain/tabletop/move/piece-on-grid';

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
