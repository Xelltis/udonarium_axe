import { disposeObject, forgetDrawn, letGoOfRenderer } from '@axe/infrastructure/three-kit/dispose';
import { Bone, BoxGeometry, Group, Material, Mesh, MeshBasicMaterial, Skeleton, SkinnedMesh } from 'three';

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

describe('disposeObject', () => {
  it('gives back the texture a skinned mesh sends its bones in, with its geometry and material', () => {
    const skeleton = new Skeleton([new Bone(), new Bone()]);
    skeleton.computeBoneTexture();
    const bones = vi.spyOn(skeleton.boneTexture!, 'dispose');
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const shape = vi.spyOn(geometry, 'dispose');
    const look = vi.spyOn(material, 'dispose');
    const skinned = new SkinnedMesh(geometry, material);
    skinned.bind(skeleton);
    const root = new Group();
    root.add(skinned);

    disposeObject(root);

    expect(bones).toHaveBeenCalledTimes(1);
    expect(shape).toHaveBeenCalledTimes(1);
    expect(look).toHaveBeenCalledTimes(1);
  });
});

describe('letGoOfRenderer', () => {
  function webglBackend() {
    const loseContext = vi.fn();
    return { loseContext, backend: { isWebGLBackend: true, gl: { getExtension: () => ({ loseContext }) } } };
  }

  it('loses the WebGL context once the renderer has let go of what it built', async () => {
    const { loseContext, backend } = webglBackend();
    const order: string[] = [];
    loseContext.mockImplementation(() => order.push('lost'));
    const dispose = vi.fn(async () => {
      order.push('disposed');
    });

    await letGoOfRenderer({ dispose, backend });

    expect(order).toEqual(['disposed', 'lost']);
  });

  it('loses the context even where the renderer fails to let go', async () => {
    const { loseContext, backend } = webglBackend();

    await letGoOfRenderer({
      dispose: () => {
        throw new Error('the card is gone');
      },
      backend,
    });

    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('leaves a WebGPU renderer to let go by itself', async () => {
    const dispose = vi.fn();

    await letGoOfRenderer({ dispose, backend: { isWebGPUBackend: true } });

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
