import { MAX_MODEL_TRIANGLES } from '@axe/core/storage/gltf-facts';
import { HeldModelReader } from '@axe/infrastructure/three-kit/held-model-reader';
import { binaryGltf } from '@axe/testing/binary-gltf';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** A binary glTF file of a JSON chunk alone, of one mesh of as many triangles as given, using the extensions given. */
function glbOf(triangles: number, extensionsUsed: string[]): ArrayBuffer {
  return binaryGltf({
    asset: { version: '2.0' },
    extensionsUsed,
    scenes: [{ nodes: [0] }],
    scene: 0,
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    accessors: [
      { count: 3, componentType: 5126, type: 'VEC3' },
      { count: triangles * 3, componentType: 5125, type: 'SCALAR' },
    ],
  });
}

describe('HeldModelReader', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads no motion for VRM models that draws more triangles than a model may, as it reads no such model', async () => {
    const bytes = glbOf(MAX_MODEL_TRIANGLES + 1, ['VRMC_vrm_animation']);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(bytes.slice(0)));
    const parsed = vi.spyOn(GLTFLoader.prototype, 'parseAsync');
    const reader = new HeldModelReader(() => ({}) as never);

    expect(await reader.readMotion('blob:motion')).toBeNull();
    expect(await reader.read('blob:model')).toBeNull();
    expect(parsed).not.toHaveBeenCalled();
  });
});
