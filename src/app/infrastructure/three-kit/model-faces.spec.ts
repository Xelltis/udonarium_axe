import { cutGeometry, meshesOf, triangleCountOf } from '@axe/infrastructure/three-kit/model-faces';
import { BufferAttribute, BufferGeometry, Group, Mesh, Object3D } from 'three';
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
