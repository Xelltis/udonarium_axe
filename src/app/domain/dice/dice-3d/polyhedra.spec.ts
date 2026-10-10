import { DIE_SHAPES, dieRadiusOf, DieShape, oppositeFace, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { restingRotation } from '@axe/domain/dice/dice-3d/resting-pose';
import { add, cross, dot, length, normalize, quatRotate, scale, sub, Vec3 } from '@axe/domain/dice/dice-3d/rotation';

const FACE_COUNTS = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 } as const;
const OPPOSITE_SUMS = { d6: 7, d8: 9, d10: 9, d12: 13, d20: 21 } as const;

describe('the dice solids', () => {
  for (const shape of DIE_SHAPES) {
    describe(shape, () => {
      const poly = polyhedronOf(shape);

      it('has the faces its name says', () => {
        expect(poly.faces).toHaveLength(FACE_COUNTS[shape]);
      });

      it('closes up, corners less edges plus faces making two', () => {
        const edges = new Set<string>();
        poly.faces.forEach((face) =>
          face.forEach((a, i) => {
            const b = face[(i + 1) % face.length];
            edges.add(a < b ? `${a}-${b}` : `${b}-${a}`);
          })
        );
        expect(poly.vertices.length - edges.size + poly.faces.length).toBe(2);
      });

      it('reaches one unit at its farthest corner', () => {
        expect(Math.max(...poly.vertices.map(length))).toBeCloseTo(1, 9);
      });

      it('has flat faces', () => {
        poly.faces.forEach((face, index) => {
          const n = poly.normals[index];
          const plane = dot(n, poly.vertices[face[0]]);
          face.forEach((corner) => expect(dot(n, poly.vertices[corner])).toBeCloseTo(plane, 9));
        });
      });

      it('points each face outward and turns its corners anticlockwise seen from outside', () => {
        poly.faces.forEach((face, index) => {
          const n = poly.normals[index];
          expect(length(n)).toBeCloseTo(1, 9);
          const centre = scale(
            face.reduce<Vec3>((sum, corner) => add(sum, poly.vertices[corner]), [0, 0, 0]),
            1 / face.length
          );
          expect(dot(n, centre)).toBeGreaterThan(0);
          const turn = normalize(
            cross(
              sub(poly.vertices[face[1]], poly.vertices[face[0]]),
              sub(poly.vertices[face[2]], poly.vertices[face[1]])
            )
          );
          expect(dot(turn, n)).toBeGreaterThan(0.99);
        });
      });

      it('gives every face, or every corner of a d4, a number of its own', () => {
        const numbered = poly.readsCorners ? poly.vertices.length : poly.faces.length;
        expect(poly.values).toHaveLength(numbered);
        expect(new Set(poly.values).size).toBe(numbered);
      });

      it('rests at the same height on whichever face it lands', () => {
        poly.faces.forEach((face, index) => {
          expect(dot(poly.normals[index], poly.vertices[face[0]])).toBeCloseTo(poly.inradius, 9);
        });
      });
    });
  }

  for (const [shape, sum] of Object.entries(OPPOSITE_SUMS) as [keyof typeof OPPOSITE_SUMS, number][]) {
    it(`numbers a ${shape} so the faces across from each other add up to ${sum}`, () => {
      const poly = polyhedronOf(shape);
      poly.faces.forEach((_, face) => {
        expect(poly.values[face] + poly.values[oppositeFace(poly, face)]).toBe(sum);
      });
    });
  }

  it('numbers a d10 from 0 to 9 and a d6 from 1 to 6 with the 1 on top', () => {
    expect([...polyhedronOf('d10').values].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const d6 = polyhedronOf('d6');
    expect(d6.values[d6.normals.findIndex((n) => n[2] > 0.99)]).toBe(1);
  });

  it('numbers the corners of a d4 from 1 to 4', () => {
    expect([...polyhedronOf('d4').values].sort()).toEqual([1, 2, 3, 4]);
  });
});

describe('dieRadiusOf', () => {
  /** The area of the outline a die resting with a face up casts straight down. */
  function footprintOf(shape: DieShape): number {
    const poly = polyhedronOf(shape);
    const rest = restingRotation(shape, 0, 0.3);
    const points = poly.vertices
      .map((v) => quatRotate(rest, v))
      .map(([x, y]): [number, number] => [x * dieRadiusOf(shape), y * dieRadiusOf(shape)])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const turn = (o: number[], a: number[], b: number[]) =>
      (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = (from: [number, number][]) => {
      const hull: [number, number][] = [];
      for (const p of from) {
        while (hull.length >= 2 && turn(hull[hull.length - 2], hull[hull.length - 1], p) <= 0) hull.pop();
        hull.push(p);
      }
      return hull.slice(0, -1);
    };
    const hull = [...half(points), ...half([...points].reverse())];
    return (
      Math.abs(
        hull.reduce(
          (sum, p, i) => sum + p[0] * hull[(i + 1) % hull.length][1] - hull[(i + 1) % hull.length][0] * p[1],
          0
        )
      ) / 2
    );
  }

  it('makes every shape cover about the same patch of floor as it rests, so a mixed roll looks one size', () => {
    const across = DIE_SHAPES.map((shape) => 2 * Math.sqrt(footprintOf(shape) / Math.PI));
    const mean = across.reduce((sum, d) => sum + d, 0) / across.length;
    for (const d of across) expect(Math.abs(d - mean) / mean).toBeLessThan(0.06);
  });
});
