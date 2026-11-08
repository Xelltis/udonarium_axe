import { Matrix3D } from '@axe/core/transform/matrix-3d';

describe('Matrix3D', () => {
  describe('constructor', () => {
    it('starts as the identity', () => {
      const m = new Matrix3D();
      expect(m.m11).toBe(1);
      expect(m.m22).toBe(1);
      expect(m.m33).toBe(1);
      expect(m.m44).toBe(1);
      expect(m.m12).toBe(0);
      expect(m.m13).toBe(0);
      expect(m.m14).toBe(0);
      expect(m.m21).toBe(0);
    });
  });

  describe('identity()', () => {
    it('resets to the identity', () => {
      const m = new Matrix3D();
      m.m11 = 5;
      m.m41 = 10;
      m.identity();
      expect(m.m11).toBe(1);
      expect(m.m41).toBe(0);
      expect(m.m44).toBe(1);
    });
  });

  describe('setData()', () => {
    it('takes a sixteen element array', () => {
      const m = new Matrix3D();
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
      m.setData(data);
      expect(m.m11).toBe(1);
      expect(m.m12).toBe(2);
      expect(m.m44).toBe(16);
      expect(m.m41).toBe(13);
    });

    it('takes a six element array, the two-dimensional form', () => {
      const m = new Matrix3D();
      m.setData([1, 0, 0, 1, 100, 200]);
      expect(m.m11).toBe(1);
      expect(m.m22).toBe(1);
      expect(m.m41).toBe(100);
      expect(m.m42).toBe(200);
      expect(m.m33).toBe(1);
      expect(m.m44).toBe(1);
    });

    it('does nothing with null', () => {
      const m = new Matrix3D();
      m.setData(null!);
      expect(m.m11).toBe(1);
    });
  });

  describe('scalar()', () => {
    it('multiplies every element by a scalar', () => {
      const m = new Matrix3D();
      m.scalar(2);
      expect(m.m11).toBe(2);
      expect(m.m22).toBe(2);
      expect(m.m33).toBe(2);
      expect(m.m44).toBe(2);
      expect(m.m12).toBe(0);
    });
  });

  describe('setPosition / getPosition', () => {
    it('sets and reads a position', () => {
      const m = new Matrix3D();
      m.setPosition({ x: 10, y: 20, z: 30, w: 1 });
      expect(m.m41).toBe(10);
      expect(m.m42).toBe(20);
      expect(m.m43).toBe(30);

      const pos = m.getPosition();
      expect(pos.x).toBe(10);
      expect(pos.y).toBe(20);
      expect(pos.z).toBe(30);
    });
  });

  describe('makePosition()', () => {
    it('builds a translation matrix', () => {
      const m = Matrix3D.makePosition({ x: 5, y: 10, z: 15, w: 1 });
      expect(m.m41).toBe(5);
      expect(m.m42).toBe(10);
      expect(m.m43).toBe(15);
      expect(m.m11).toBe(1);
    });
  });

  describe('multiply()', () => {
    it('multiplying two identities gives the identity', () => {
      const a = new Matrix3D();
      const b = new Matrix3D();
      const result = Matrix3D.multiply(a, b);
      expect(result.m11).toBe(1);
      expect(result.m22).toBe(1);
      expect(result.m33).toBe(1);
      expect(result.m44).toBe(1);
      expect(result.m12).toBe(0);
    });

    it('multiplying two translations adds them', () => {
      const a = new Matrix3D();
      a.setPosition({ x: 10, y: 0, z: 0, w: 1 });
      const b = new Matrix3D();
      b.setPosition({ x: 5, y: 0, z: 0, w: 1 });
      const result = Matrix3D.multiply(a, b);
      expect(result.m41).toBe(15);
    });
  });

  describe('setCSS()', () => {
    it('reads a two-dimensional matrix string', () => {
      const m = new Matrix3D();
      m.setCSS('matrix(1, 0, 0, 1, 100, 200)');
      expect(m.m11).toBe(1);
      expect(m.m22).toBe(1);
      expect(m.m41).toBe(100);
      expect(m.m42).toBe(200);
    });

    it('reads a three-dimensional matrix string', () => {
      const m = new Matrix3D();
      m.setCSS('matrix3d(1,0,0,0, 0,1,0,0, 0,0,1,0, 50,60,70,1)');
      expect(m.m11).toBe(1);
      expect(m.m41).toBe(50);
      expect(m.m42).toBe(60);
      expect(m.m43).toBe(70);
    });

    it('resets to the identity for none', () => {
      const m = new Matrix3D();
      m.m41 = 999;
      m.setCSS('none');
      expect(m.m41).toBe(0);
      expect(m.m11).toBe(1);
    });

    it('resets to the identity for an empty string', () => {
      const m = new Matrix3D();
      m.m41 = 999;
      m.setCSS('');
      expect(m.m41).toBe(0);
    });
  });

  describe('flatten()', () => {
    it('resets the values along z', () => {
      const m = new Matrix3D();
      m.m31 = 5;
      m.m32 = 5;
      m.m34 = 5;
      m.m14 = 5;
      m.m24 = 5;
      m.m43 = 5;
      m.flatten();
      expect(m.m31).toBe(0);
      expect(m.m32).toBe(0);
      expect(m.m33).toBe(1);
      expect(m.m34).toBe(0);
      expect(m.m14).toBe(0);
      expect(m.m24).toBe(0);
      expect(m.m43).toBe(0);
      expect(m.m44).toBe(1);
    });
  });

  describe('invert()', () => {
    it('the inverse of the identity is the identity', () => {
      const m = new Matrix3D();
      const inv = m.invert(new Matrix3D());
      expect(inv.m11).toBeCloseTo(1);
      expect(inv.m22).toBeCloseTo(1);
      expect(inv.m33).toBeCloseTo(1);
      expect(inv.m44).toBeCloseTo(1);
    });

    it('the inverse of a translation flips its sign', () => {
      const m = new Matrix3D();
      m.setPosition({ x: 10, y: 20, z: 30, w: 1 });
      const inv = m.invert(new Matrix3D());
      expect(inv.m41).toBeCloseTo(-10);
      expect(inv.m42).toBeCloseTo(-20);
      expect(inv.m43).toBeCloseTo(-30);
    });
  });

  describe('project / unproject', () => {
    it('projecting through the identity leaves a point where it is', () => {
      const m = new Matrix3D();
      const result = m.project({ x: 10, y: 20, z: 0, w: 1 });
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(20);
    });

    it('unprojecting through the identity leaves a point where it is', () => {
      const m = new Matrix3D();
      const result = m.unproject({ x: 10, y: 20 });
      expect(result.x).toBeCloseTo(10);
      expect(result.y).toBeCloseTo(20);
    });
  });

  describe('append()', () => {
    it('concatenates two matrices', () => {
      const a = new Matrix3D();
      a.setPosition({ x: 10, y: 0, z: 0, w: 1 });
      const b = new Matrix3D();
      b.setPosition({ x: 5, y: 0, z: 0, w: 1 });
      a.append(b);
      expect(a.m41).toBe(15);
    });
  });

  describe('toString()', () => {
    it('turns a matrix into a string', () => {
      const m = new Matrix3D();
      const str = m.toString();
      expect(str).toContain('m11=1.000');
      expect(str).toContain('m22=1.000');
    });

    it('takes the number of decimal places', () => {
      const m = new Matrix3D();
      const str = m.toString(1);
      expect(str).toContain('m11=1.0');
    });
  });

  describe('makePerspective()', () => {
    it('builds a perspective matrix', () => {
      const m = Matrix3D.makePerspective(1000);
      expect(m.m34).toBeCloseTo(-0.001);
      expect(m.m11).toBe(1);
    });

    it('a perspective of zero leaves the depth term at zero', () => {
      const m = Matrix3D.makePerspective(0);
      expect(m.m34).toBe(0);
    });
  });

  describe('toCss', () => {
    it('writes the numbers in the order CSS lists them, reading back as the same matrix', () => {
      const m = new Matrix3D().setData([1, 2, 3, 0.0003, 5, 6, 7, 0, 9, 10, 11, -0.00012, 1500, -40, 0.5, 1]);

      const written = m.toCss();

      expect(written).toBe('matrix3d(1, 2, 3, 0.0003, 5, 6, 7, 0, 9, 10, 11, -0.00012, 1500, -40, 0.5, 1)');
      const read = new Matrix3D().setCSS(written);
      expect([read.m14, read.m34, read.m41, read.m43]).toEqual([0.0003, -0.00012, 1500, 0.5]);
    });

    it('never writes a number in exponent form, nor a negative zero', () => {
      const m = new Matrix3D().setData([1e-7, -1e-12, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

      expect(m.toCss()).toBe('matrix3d(0.0000001, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)');
      expect(new Matrix3D().setData([100, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]).toCss(0)).toContain('(100, ');
    });
  });
});
