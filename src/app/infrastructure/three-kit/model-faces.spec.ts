import {
  cutGeometry,
  meshesOf,
  releaseCutShapes,
  sourceTriangleOf,
  triangleCentresOf,
  triangleCountOf,
} from '@axe/infrastructure/three-kit/model-faces';
import {
  Bone,
  BufferAttribute,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Skeleton,
  SkinnedMesh,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import { describe, expect, it } from 'vitest';

/** A shape of as many triangles as given, each its own three points. */
function triangles(count: number, indexed: boolean): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 9), 3));
  if (indexed) geometry.setIndex([...Array(count * 3).keys()]);
  return geometry;
}

describe('the faces of a model', () => {
  it('finds the meshes in the order the model is walked, in a copy as in the model', () => {
    const root = new Group();
    const a = new Mesh(triangles(1, true));
    const inner = new Group();
    const b = new Mesh(triangles(1, true));
    const c = new Mesh(triangles(1, true));
    inner.add(b);
    root.add(a, new Object3D(), inner, c);

    expect(meshesOf(root)).toEqual([a, b, c]);
    expect(meshesOf(root.clone()).map((mesh) => mesh.geometry)).toEqual([a.geometry, b.geometry, c.geometry]);
  });

  it('cuts the triangles given out of a shape, sharing its points, indexed or not', () => {
    for (const indexed of [true, false]) {
      const source = triangles(4, indexed);
      const cut = cutGeometry(source, new Set([1, 3]));

      expect(triangleCountOf(cut)).toBe(2);
      expect([...cut.getIndex()!.array]).toEqual([0, 1, 2, 6, 7, 8]);
      expect(cut.getAttribute('position')).toBe(source.getAttribute('position'));
    }
  });

  it('tells which triangle of the shape it was cut from each of a cut shape’s triangles is', () => {
    const source = triangles(6, true);
    const cut = cutGeometry(source, new Set([0, 1, 4]));

    expect([0, 1, 2].map((triangle) => sourceTriangleOf(cut, triangle))).toEqual([2, 3, 5]);
    expect(sourceTriangleOf(source, 4)).toBe(4);
  });

  it('lets go of the shapes cut from others under an object, but not of the points they share', () => {
    const source = triangles(4, true);
    const kept = new Mesh(triangles(2, true));
    const cutMesh = new Mesh(cutGeometry(source, new Set([1])));
    const root = new Group();
    root.add(kept, cutMesh);
    const cutShape = cutMesh.geometry;
    const disposed: BufferGeometry[] = [];
    for (const geometry of [cutShape, kept.geometry, source]) {
      geometry.addEventListener('dispose', () => disposed.push(geometry));
    }
    const position = source.getAttribute('position');

    releaseCutShapes(root);

    expect(disposed).toEqual([cutShape]);
    expect(Object.keys(cutShape.attributes)).toEqual([]);
    expect(source.getAttribute('position')).toBe(position);
  });

  it('cuts each run a material draws, keeping the runs in their order', () => {
    const source = triangles(4, true);
    source.addGroup(0, 6, 0);
    source.addGroup(6, 6, 1);

    const cut = cutGeometry(source, new Set([0, 2]));

    expect([...cut.getIndex()!.array]).toEqual([3, 4, 5, 9, 10, 11]);
    expect(cut.groups).toEqual([
      { start: 0, count: 3, materialIndex: 0 },
      { start: 3, count: 3, materialIndex: 1 },
    ]);
  });
});

describe('triangleCentresOf', () => {
  it('finds the middle of each triangle as the mesh is posed by its bones, not as it was bound', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 3, 0, 0, 0, 3, 0], 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    const bone = new Bone();
    const mesh = new SkinnedMesh(geometry, new MeshBasicMaterial());
    mesh.add(bone);
    mesh.bind(new Skeleton([bone]));
    bone.position.set(10, 0, 0);
    mesh.updateMatrixWorld(true);

    const centres = triangleCentresOf(mesh, new Vector3());

    expect([...centres].map((value) => Math.round(value))).toEqual([11, 1, 0]);
  });
});
