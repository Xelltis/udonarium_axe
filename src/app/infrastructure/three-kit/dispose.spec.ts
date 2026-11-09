import { forgetDrawn } from '@axe/infrastructure/three-kit/dispose';
import { BoxGeometry, Group, Material, Mesh, MeshBasicMaterial } from 'three';

describe('forgetDrawn', () => {
  it('tells the renderer every mesh under an object is disposed of, leaving the geometry and material they share', () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const group = new Group();
    const meshes = [new Mesh(geometry, material), new Mesh(geometry, material)];
    group.add(...meshes);
    const told = meshes.map(() => vi.fn());
    meshes.forEach((mesh, index) =>
      (mesh as unknown as Mesh & { addEventListener(type: 'dispose', listener: () => void): void }).addEventListener(
        'dispose',
        told[index]
      )
    );
    const geometryDisposed = vi.fn();
    const materialDisposed = vi.fn();
    geometry.addEventListener('dispose', geometryDisposed);
    (material as Material).addEventListener('dispose', materialDisposed);

    forgetDrawn(group);

    expect(told.map((listener) => listener.mock.calls.length)).toEqual([1, 1]);
    expect(geometryDisposed).not.toHaveBeenCalled();
    expect(materialDisposed).not.toHaveBeenCalled();
  });
});
