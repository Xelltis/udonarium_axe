import {
  correctionFor,
  correctionsFor,
  rotationGroupOf,
  upAlignment,
  upFace,
} from '@axe/domain/dice/dice-3d/die-symmetry';
import { DIE_SHAPES, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import {
  dot,
  IDENTITY,
  length,
  Quat,
  quatFromAxisAngle,
  quatFromUnitVectors,
  quatMultiply,
  quatRotate,
  sub,
  UP,
} from '@axe/domain/dice/dice-3d/rotation';

const GROUP_ORDERS = { d4: 12, d6: 24, d8: 24, d10: 10, d12: 60, d20: 60 } as const;

/** A rest that leaves the given face, or the given corner of a d4, on top. */
function restingOn(shape: (typeof DIE_SHAPES)[number], index: number, yaw: number): Quat {
  const poly = polyhedronOf(shape);
  const up = poly.readsCorners ? poly.vertices[index] : poly.normals[index];
  return quatMultiply(quatFromAxisAngle(UP, yaw), quatFromUnitVectors(up, UP));
}

describe('the turns of a die onto itself', () => {
  for (const shape of DIE_SHAPES) {
    describe(shape, () => {
      const poly = polyhedronOf(shape);
      const group = rotationGroupOf(shape);

      it('number as many as the solid has', () => {
        expect(group).toHaveLength(GROUP_ORDERS[shape]);
      });

      it('each carry every corner onto a corner and keep the solid the right way out', () => {
        group.forEach((turn) => {
          poly.vertices.forEach((v) => {
            const moved = quatRotate(turn, v);
            expect(poly.vertices.some((w) => length(sub(moved, w)) < 1e-6)).toBe(true);
          });
          const n = poly.normals[0];
          expect(poly.normals.some((m) => dot(quatRotate(turn, n), m) > 1 - 1e-6)).toBe(true);
        });
      });

      it('read the number on top of a die resting on any face', () => {
        const count = poly.readsCorners ? poly.vertices.length : poly.faces.length;
        for (let index = 0; index < count; index++) {
          const rest = restingOn(shape, index, 0.7 + index);
          expect(upFace(poly, rest)).toBe(index);
          expect(upAlignment(poly, rest)).toBeCloseTo(1, 6);
        }
      });

      it('bring any number to wherever the physics left any other, the solid looking just the same', () => {
        const count = poly.readsCorners ? poly.vertices.length : poly.faces.length;
        for (let landed = 0; landed < count; landed++) {
          const body = restingOn(shape, landed, 1.3 * landed);
          for (let target = 0; target < count; target++) {
            const shown = quatMultiply(body, correctionFor(poly, landed, target));
            expect(upFace(poly, shown)).toBe(target);
          }
        }
      });

      it('offer one turn for each way the shown number can sit about the middle of its face', () => {
        const turns = correctionsFor(poly, 0, 1);
        expect(turns).toHaveLength(rotationGroupOf(shape).length / (poly.readsCorners ? 4 : poly.faces.length));
        const body = restingOn(shape, 0, 0.4);
        turns.forEach((turn) => expect(upFace(poly, quatMultiply(body, turn))).toBe(1));
      });
    });
  }

  it('reads a d4 by the corner across from the face it lies on, not by that face', () => {
    const d4 = polyhedronOf('d4');
    const corner = 2;
    const rest = restingOn('d4', corner, 0);
    expect(upFace(d4, rest)).toBe(corner);
    expect(d4.faces[corner]).not.toContain(corner);
  });

  it('measures a leaning die as less than square on its face', () => {
    const d6 = polyhedronOf('d6');
    const leaning = quatFromAxisAngle([1, 0, 0], Math.PI / 8);
    expect(upAlignment(d6, IDENTITY)).toBeCloseTo(1, 9);
    expect(upAlignment(d6, leaning)).toBeLessThan(0.95);
  });
});
