import { AlphaMask, picturePointOf, SEE_THROUGH_ALPHA, seesThroughAt } from '@axe/domain/ui/see-through';

describe('picturePointOf', () => {
  it('reads a picture stretched to its box straight across it', () => {
    expect(picturePointOf({ width: 200, height: 100 }, { width: 50, height: 50 }, 'fill', 50, 75)).toEqual({
      u: 0.25,
      v: 0.75,
    });
  });

  it('reads a point beside a picture contained in a wider box as off the picture', () => {
    // A square picture in a box twice as wide stands in its middle half.
    const box = { width: 200, height: 100 };
    const picture = { width: 40, height: 40 };

    expect(picturePointOf(box, picture, 'contain', 100, 50)).toEqual({ u: 0.5, v: 0.5 });
    expect(picturePointOf(box, picture, 'contain', 40, 50)!.u).toBeLessThan(0);
    expect(picturePointOf(box, picture, 'contain', 160, 50)!.u).toBeGreaterThanOrEqual(1);
  });

  it('scales a picture down to its box but never up', () => {
    const small = picturePointOf({ width: 200, height: 200 }, { width: 100, height: 100 }, 'scale-down', 50, 100)!;

    expect(small.u).toBe(0);
  });

  it('reads a picture covering its box across the middle of the picture', () => {
    const point = picturePointOf({ width: 100, height: 100 }, { width: 200, height: 100 }, 'cover', 50, 50)!;

    expect(point).toEqual({ u: 0.5, v: 0.5 });
  });

  it('tells nothing of a box or a picture with no size', () => {
    expect(picturePointOf({ width: 0, height: 100 }, { width: 10, height: 10 }, 'fill', 0, 0)).toBeNull();
    expect(picturePointOf({ width: 100, height: 100 }, { width: 0, height: 0 }, 'contain', 0, 0)).toBeNull();
  });
});

describe('seesThroughAt', () => {
  /** Two by two: clear at the top left, just below the line at the top right, just at it below. */
  const mask: AlphaMask = {
    width: 2,
    height: 2,
    alpha: new Uint8Array([0, SEE_THROUGH_ALPHA - 1, SEE_THROUGH_ALPHA, 255]),
  };

  it('lets a press through where the picture is all but clear', () => {
    expect(seesThroughAt(mask, { u: 0.1, v: 0.1 })).toBe(true);
    expect(seesThroughAt(mask, { u: 0.9, v: 0.1 })).toBe(true);
  });

  it('holds a press from a tenth of the way to opaque', () => {
    expect(seesThroughAt(mask, { u: 0.1, v: 0.9 })).toBe(false);
    expect(seesThroughAt(mask, { u: 0.9, v: 0.9 })).toBe(false);
  });

  it('lets a press through off the picture', () => {
    expect(seesThroughAt(mask, { u: -0.1, v: 0.9 })).toBe(true);
    expect(seesThroughAt(mask, { u: 0.9, v: 1 })).toBe(true);
  });
});
