import { DIE_SHAPES, polyhedronOf } from '@axe/domain/dice/dice-3d/polyhedra';
import { cross, dot, length, sub, Vec3 } from '@axe/domain/dice/dice-3d/rotation';
import { atlasOf, cellUv, diceMeshOf, faceFramesOf } from '@axe/infrastructure/dice-3d/dice-geometry';

describe('the rounded dice', () => {
  for (const shape of DIE_SHAPES) {
    describe(shape, () => {
      const mesh = diceMeshOf(shape);
      const poly = polyhedronOf(shape);
      const point = (i: number): Vec3 => [mesh.positions[i * 3], mesh.positions[i * 3 + 1], mesh.positions[i * 3 + 2]];
      const normal = (i: number): Vec3 => [mesh.normals[i * 3], mesh.normals[i * 3 + 1], mesh.normals[i * 3 + 2]];

      it('lights every corner of every triangle by a normal of unit length', () => {
        for (let i = 0; i < mesh.normals.length / 3; i++) expect(length(normal(i))).toBeCloseTo(1, 5);
      });

      it('turns every triangle outward, the way its normals point', () => {
        for (let t = 0; t < mesh.indices.length; t += 3) {
          const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
          const facing = cross(sub(point(b), point(a)), sub(point(c), point(a)));
          if (length(facing) < 1e-9) continue;
          expect(dot(facing, normal(a)) + dot(facing, normal(b)) + dot(facing, normal(c))).toBeGreaterThan(0);
        }
      });

      it('stays inside the solid the physics throws, its flat faces on the same planes', () => {
        for (let i = 0; i < mesh.positions.length / 3; i++) {
          const p = point(i);
          expect(length(p)).toBeLessThanOrEqual(1 + 1e-6);
          poly.normals.forEach((n, face) => {
            expect(dot(p, n)).toBeLessThanOrEqual(dot(n, poly.vertices[poly.faces[face][0]]) + 1e-6);
          });
        }
        poly.normals.forEach((n, face) => {
          const plane = dot(n, poly.vertices[poly.faces[face][0]]);
          const onIt = [...Array(mesh.normals.length / 3).keys()].filter((i) => dot(normal(i), n) > 1 - 1e-5);
          expect(onIt.length).toBeGreaterThan(0);
          onIt.forEach((i) => expect(dot(point(i), n)).toBeCloseTo(plane, 6));
        });
      });

      it('runs the texture square to the normal at every point, so the engraving tilts the light', () => {
        for (let i = 0; i < mesh.tangents.length / 4; i++) {
          const tangent: Vec3 = [mesh.tangents[i * 4], mesh.tangents[i * 4 + 1], mesh.tangents[i * 4 + 2]];
          expect(length(tangent)).toBeCloseTo(1, 5);
          expect(dot(tangent, normal(i))).toBeCloseTo(0, 5);
          expect(mesh.tangents[i * 4 + 3]).toBe(1);
        }
      });

      it('maps every point into the texture', () => {
        mesh.uvs.forEach((uv) => {
          expect(uv).toBeGreaterThanOrEqual(0);
          expect(uv).toBeLessThanOrEqual(1);
        });
      });

      it('lays each face square to its own normal in its cell', () => {
        faceFramesOf(shape).forEach((frame, face) => {
          expect(length(frame.up)).toBeCloseTo(1, 9);
          expect(dot(frame.up, poly.normals[face])).toBeCloseTo(0, 9);
          expect(dot(frame.right, poly.normals[face])).toBeCloseTo(0, 9);
          expect(dot(frame.right, frame.up)).toBeCloseTo(0, 9);
        });
      });
    });
  }

  it('gives every face of a shape a cell of its own, and one plain cell more', () => {
    for (const shape of DIE_SHAPES) {
      const atlas = atlasOf(shape);
      expect(atlas.columns * atlas.rows).toBeGreaterThanOrEqual(polyhedronOf(shape).faces.length + 1);
      expect(atlas.plainCell).toBe(polyhedronOf(shape).faces.length);
    }
  });

  it('counts the cells from the top left, as the texture is drawn', () => {
    const atlas = { columns: 4, rows: 2, plainCell: 7 };
    expect(cellUv(atlas, 0, 0, 1)).toEqual([0, 1]);
    expect(cellUv(atlas, 5, 1, 0)).toEqual([0.5, 0]);
  });
});
