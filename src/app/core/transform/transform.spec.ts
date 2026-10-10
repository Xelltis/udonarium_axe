import { Transform } from '@axe/core/transform/transform';

describe('Transform', () => {
  type TransformPrivateApi = {
    getPosition: (node: HTMLElement) => { x: number; y: number };
  };

  describe('constructor', () => {
    it('can be built from an element', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const transform = new Transform(el);
      expect(transform).toBeTruthy();
      document.body.removeChild(el);
    });
  });

  describe('clear', () => {
    it('resets its state when cleared', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const transform = new Transform(el);
      const result = transform.clear();
      expect(result).toBe(transform);
      document.body.removeChild(el);
    });
  });

  describe('globalToLocal', () => {
    it('converts a global point into a local one', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const transform = new Transform(el);
      const point = transform.globalToLocal(100, 200);
      expect(point).toHaveProperty('x');
      expect(point).toHaveProperty('y');
      expect(point).toHaveProperty('z');
      expect(point).toHaveProperty('w');
      document.body.removeChild(el);
    });
  });

  describe('localToGlobal', () => {
    it('converts a local point into a global one', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const transform = new Transform(el);
      const point = transform.localToGlobal(50, 75);
      expect(point).toHaveProperty('x');
      expect(point).toHaveProperty('y');
      expect(point).toHaveProperty('z');
      expect(point).toHaveProperty('w');
      document.body.removeChild(el);
    });
  });

  describe('localToLocal', () => {
    it('converts a point from one element to another', () => {
      const el1 = document.createElement('div');
      const el2 = document.createElement('div');
      document.body.appendChild(el1);
      document.body.appendChild(el2);
      const transform = new Transform(el1);
      const point = transform.localToLocal(10, 20, 0, el2);
      expect(point).toHaveProperty('x');
      expect(point).toHaveProperty('y');
      document.body.removeChild(el1);
      document.body.removeChild(el2);
    });
  });

  describe('getPosition', () => {
    it('measures a node with no parent without throwing', () => {
      const host = document.createElement('div');
      document.body.appendChild(host);
      const transform = new Transform(host) as unknown as TransformPrivateApi;

      const offsetParent = {
        clientLeft: 5,
        clientTop: 7,
      } as HTMLElement;

      const detached = {
        offsetLeft: 11,
        offsetTop: 13,
        offsetParent,
        parentElement: null,
      } as unknown as HTMLElement;

      expect(() => transform.getPosition(detached)).not.toThrow();
      expect(transform.getPosition(detached)).toEqual({ x: 5, y: 7 });

      document.body.removeChild(host);
    });
  });

  describe('sceneMatrix', () => {
    it('takes a point to where localToGlobal puts it on the page, through a tilt and a perspective', () => {
      const stage = document.createElement('div');
      stage.style.perspective = '1000px';
      stage.style.width = '800px';
      stage.style.height = '600px';
      const table = document.createElement('div');
      // A tilt of 40 degrees about x and a shift, written out, as the page's own engine would give it.
      const [c, n] = [Math.cos((40 * Math.PI) / 180), Math.sin((40 * Math.PI) / 180)];
      table.style.transform = `matrix3d(1.3, 0, 0, 0, 0, ${1.3 * c}, ${1.3 * n}, 0, 0, ${-n}, ${c}, 0, 30, -20, 0, 1)`;
      table.style.width = '400px';
      table.style.height = '300px';
      stage.appendChild(table);
      document.body.appendChild(stage);
      try {
        const transform = new Transform(table);
        const scene = transform.sceneMatrix();
        expect(scene.m22).not.toBeCloseTo(1, 3);
        expect(scene.m34).not.toBe(0);
        for (const [x, y, z] of [
          [0, 0, 0],
          [120, 80, 0],
          [300, 260, 45],
        ]) {
          const expected = transform.localToGlobal(x, y, z);
          const w = x * scene.m14 + y * scene.m24 + z * scene.m34 + scene.m44;
          expect((x * scene.m11 + y * scene.m21 + z * scene.m31 + scene.m41) / w).toBeCloseTo(expected.x, 6);
          expect((x * scene.m12 + y * scene.m22 + z * scene.m32 + scene.m42) / w).toBeCloseTo(expected.y, 6);
        }
      } finally {
        document.body.removeChild(stage);
      }
    });
  });
});
