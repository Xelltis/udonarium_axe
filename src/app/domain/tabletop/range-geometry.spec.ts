import { chkInCircle, chkOuterProduct, insideConvexPolygon } from '@axe/domain/tabletop/range-geometry';

describe('range-geometry', () => {
  describe('chkOuterProduct', () => {
    it('is true inside a clockwise polygon', () => {
      expect(chkOuterProduct(0, 0, 10, 0, 5, 5)).toBe(true);
    });

    it('is false outside one', () => {
      expect(chkOuterProduct(0, 0, 10, 0, 5, -5)).toBe(false);
    });

    it('is true on an edge, within rounding', () => {
      expect(chkOuterProduct(0, 0, 10, 0, 5, 0)).toBe(true);
      expect(chkOuterProduct(0, 0, 10, 0, 5, -0.0005)).toBe(true);
    });
  });

  describe('chkInCircle', () => {
    it('is true inside a circle', () => {
      expect(chkInCircle(10, 3, 4)).toBe(true);
    });

    it('is false outside one', () => {
      expect(chkInCircle(5, 4, 4)).toBe(false);
    });

    it('is true on the rim', () => {
      expect(chkInCircle(5, 3, 4)).toBe(true);
    });

    it('is true at the centre', () => {
      expect(chkInCircle(1, 0, 0)).toBe(true);
    });
  });

  describe('insideConvexPolygon', () => {
    const square = [
      { x: -10, y: -10 },
      { x: 10, y: -10 },
      { x: 10, y: 10 },
      { x: -10, y: 10 },
    ];

    it('is true inside a clockwise square and on its edge', () => {
      expect(insideConvexPolygon(square, 0, 0)).toBe(true);
      expect(insideConvexPolygon(square, 10, 3)).toBe(true);
    });

    it('is false outside any one edge', () => {
      expect(insideConvexPolygon(square, 11, 0)).toBe(false);
      expect(insideConvexPolygon(square, 0, -11)).toBe(false);
    });

    it('is false everywhere outside a triangle turned to run anticlockwise', () => {
      const anticlockwise = [...square].reverse();
      expect(insideConvexPolygon(anticlockwise, 5, 5)).toBe(false);
    });
  });
});
