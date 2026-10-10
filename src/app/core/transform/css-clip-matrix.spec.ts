import {
  clipMatrixOf,
  eyeOf,
  invert,
  Matrix4,
  multiply,
  Point3,
  toPage,
  transform,
} from '@axe/core/transform/css-clip-matrix';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function translate(x: number, y: number, z = 0): number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];
}

function rotateX(degrees: number): number[] {
  const [c, s] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** A CSS perspective of a distance about an origin on the page. */
function perspective(distance: number, ox: number, oy: number): number[] {
  const flat = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / distance, 0, 0, 0, 1];
  return multiply(translate(ox, oy), multiply(flat, translate(-ox, -oy)));
}

/** A table tipped back under a perspective, as the page draws it. */
const PAGE: Matrix4 = multiply(
  perspective(3000, 800, 450),
  multiply(translate(200, 150), multiply(rotateX(35), translate(-100, -60)))
);
const RECT = { left: 320, top: 140, width: 600, height: 420 };
const BOUNDS: Point3[] = [-1, 1].flatMap((sx) =>
  [-1, 1].flatMap((sy) => [0, 120].map((z): Point3 => [400 + sx * 150, 300 + sy * 110, z]))
);

function ndcOf(clip: Matrix4, point: Point3): [number, number, number] {
  const [x, y, z, w] = transform(clip, point);
  return [x / w, y / w, z / w];
}

describe('clipMatrixOf', () => {
  const clip = clipMatrixOf(PAGE, RECT, BOUNDS);

  it('lays each point where the page draws it, across the rectangle from −1 to 1 and up it from −1 to 1', () => {
    for (const point of [...BOUNDS, [430, 280, 40] as Point3]) {
      const [px, py] = toPage(PAGE, point);
      const [x, y] = ndcOf(clip, point);
      expect(x).toBeCloseTo(((px - RECT.left) / RECT.width) * 2 - 1, 9);
      expect(y).toBeCloseTo(1 - ((py - RECT.top) / RECT.height) * 2, 9);
    }
  });

  it('keeps every bounding point inside the depth it draws, the nearer the viewer the nearer −1', () => {
    for (const point of BOUNDS) {
      const [, , z] = ndcOf(clip, point);
      expect(z).toBeGreaterThan(-1);
      expect(z).toBeLessThan(1);
    }
    const [, , low] = ndcOf(clip, [400, 300, 0]);
    const [, , high] = ndcOf(clip, [400, 300, 100]);
    expect(high).toBeLessThan(low);
  });
});

describe('eyeOf', () => {
  it('finds the eye of a perspective where the page stands it, in front of its origin', () => {
    const page = perspective(1000, 400, 300);
    const clip = clipMatrixOf(page, { left: 0, top: 0, width: 800, height: 600 }, [
      [0, 0, 0],
      [800, 600, 200],
    ]);

    const eye = eyeOf(clip)!;

    expect(eye[0]).toBeCloseTo(400, 6);
    expect(eye[1]).toBeCloseTo(300, 6);
    expect(eye[2]).toBeCloseTo(1000, 6);
  });

  it('finds no eye for a view without perspective, which looks from infinitely far', () => {
    const clip = clipMatrixOf(multiply(translate(10, 20), rotateX(30)), RECT, BOUNDS);

    expect(eyeOf(clip)).toBeNull();
  });
});

describe('invert', () => {
  it('undoes a matrix', () => {
    const product = multiply(PAGE, invert(PAGE)!);
    product.forEach((value, i) => expect(value).toBeCloseTo(IDENTITY[i], 9));
  });

  it('gives nothing for a matrix that flattens space', () => {
    expect(invert([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBeNull();
  });
});
