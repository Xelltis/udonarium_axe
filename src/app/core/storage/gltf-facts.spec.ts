import { gltfFactsOf, gltfFactsOfBlob } from '@axe/core/storage/gltf-facts';
import { gltfNamesOf, gltfNamesOfBlob, materialKeyOf } from '@axe/core/storage/gltf-names';
import { binaryGltf } from '@axe/testing/binary-gltf';

/** A binary glTF file of a JSON chunk alone, which is all the facts are read from. */
const glb = binaryGltf;

/** One mesh of one primitive with `corners` indices, placed by the nodes given. */
function scene(nodes: unknown[], roots: number[], primitive: Record<string, unknown> = { indices: 0 }) {
  return {
    scenes: [{ nodes: roots }],
    nodes,
    meshes: [{ primitives: [{ attributes: { POSITION: 1 }, ...primitive }] }],
    accessors: [{ count: 36 }, { count: 24 }],
  };
}

describe('gltfFactsOf', () => {
  it('counts the triangles of a list drawn from its indices, or from its corners where it has none', () => {
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0])))?.triangles).toBe(12);
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0], { indices: undefined })))?.triangles).toBe(8);
  });

  it('counts strips and fans as one triangle a corner past the first two, and lines and points as none', () => {
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0], { indices: 0, mode: 5 })))?.triangles).toBe(34);
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0], { indices: 0, mode: 6 })))?.triangles).toBe(34);
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0], { indices: 0, mode: 1 })))?.triangles).toBe(0);
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0], { indices: 0, mode: 0 })))?.triangles).toBe(0);
  });

  it('counts a mesh as many times as it is placed, by two nodes, by one node under two, or as instances', () => {
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }, { mesh: 0 }], [0, 1])))?.triangles).toBe(24);
    expect(gltfFactsOf(glb(scene([{ children: [2] }, { children: [2] }, { mesh: 0 }], [0, 1])))?.triangles).toBe(24);
    const instanced = scene(
      [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 2 } } } }],
      [0]
    );
    instanced.accessors.push({ count: 5 });
    expect(gltfFactsOf(glb(instanced))?.triangles).toBe(60);
  });

  it('counts only the scene a loader shows, the one named or else the first', () => {
    const two = { ...scene([{ mesh: 0 }, { mesh: 0 }], [0]), scenes: [{ nodes: [0] }, { nodes: [0, 1] }] };
    expect(gltfFactsOf(glb(two))?.triangles).toBe(12);
    expect(gltfFactsOf(glb({ ...two, scene: 1 }))?.triangles).toBe(24);
  });

  it('comes to an end on nodes that hold each other, and counts nothing it cannot find', () => {
    expect(gltfFactsOf(glb(scene([{ mesh: 0, children: [1] }, { children: [0] }], [0])))?.triangles).toBe(12);
    expect(gltfFactsOf(glb(scene([{ mesh: 3 }, { children: [9] }], [0, 1, 7])))?.triangles).toBe(0);
    expect(gltfFactsOf(glb({ asset: { version: '2.0' } }))).toEqual({ triangles: 0, extensions: [], fit: '' });
  });

  it('names the extensions the file uses', () => {
    const used = { ...scene([{ mesh: 0 }], [0]), extensionsUsed: ['KHR_draco_mesh_compression', 'KHR_texture_basisu'] };
    expect(gltfFactsOf(glb(used))?.extensions).toEqual(['KHR_draco_mesh_compression', 'KHR_texture_basisu']);
  });

  it('names how the scene a loader shows says it is laid, and nothing where it says nothing', () => {
    const joined = { ...scene([{ mesh: 0 }], [0]), scenes: [{ nodes: [0], extras: { fit: 'joined' } }] };
    expect(gltfFactsOf(glb(joined))?.fit).toBe('joined');
    expect(gltfFactsOf(glb(scene([{ mesh: 0 }], [0])))?.fit).toBe('');
    const odd = { ...scene([{ mesh: 0 }], [0]), scenes: [{ nodes: [0], extras: { fit: 3 } }] };
    expect(gltfFactsOf(glb(odd))?.fit).toBe('');
  });

  it('reads the same from a file held as a blob, from its head and its JSON alone, and nothing from a blob too short', async () => {
    const joined = { ...scene([{ mesh: 0 }], [0]), scenes: [{ nodes: [0], extras: { fit: 'joined' } }] };
    const bytes = new Uint8Array(glb(joined));
    const whole = new Uint8Array(bytes.length + 64);
    whole.set(bytes);

    expect(await gltfFactsOfBlob(new Blob([whole]))).toEqual(gltfFactsOf(glb(joined)));
    expect(await gltfFactsOfBlob(new Blob([bytes.slice(0, 12)]))).toBeNull();
  });

  it('reads nothing from bytes that are not a binary glTF file or whose JSON is cut short or unreadable', () => {
    expect(gltfFactsOf(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    const whole = new Uint8Array(glb(scene([{ mesh: 0 }], [0])));
    expect(gltfFactsOf(whole.slice(0, 40).buffer)).toBeNull();
    const garbled = whole.slice();
    garbled[20] = 0x7b;
    garbled[21] = 0x7b;
    expect(gltfFactsOf(garbled.buffer)).toBeNull();
    const binFirst = whole.slice();
    new DataView(binFirst.buffer).setUint32(16, 0x004e4942, true);
    expect(gltfFactsOf(binFirst.buffer)).toBeNull();
  });
});

describe('gltfNamesOf', () => {
  it('names the motions, a motion with no name as a loader names it, each once', () => {
    const named = { animations: [{ name: 'Idle' }, {}, { name: 'Idle' }, { name: '' }] };
    expect(gltfNamesOf(glb(named))?.motions).toEqual(['Idle', 'animation_1', 'animation_3']);
  });

  it('names the shapes a mesh can be blended towards, by the mesh or else by its first primitive', () => {
    const shaped = {
      meshes: [
        { primitives: [{ targets: [{}, {}] }], extras: { targetNames: ['Blink', 'Joy'] } },
        { primitives: [{ targets: [{}, {}], extras: { targetNames: ['Joy', 'Aa'] } }] },
        { primitives: [{ targets: [{}] }] },
        { primitives: [{}] },
      ],
    };
    expect(gltfNamesOf(glb(shaped))?.shapes).toEqual(['Blink', 'Joy', 'Aa', '0']);
  });

  it('names shapes by where they stand where the names given do not answer them one for one', () => {
    const odd = { meshes: [{ primitives: [{ targets: [{}, {}] }], extras: { targetNames: ['Only'] } }] };
    expect(gltfNamesOf(glb(odd))?.shapes).toEqual(['0', '1']);
  });

  it('names the shapes a VRM blends its face towards first, a VRM from before version 1 as the reader of VRMs does', () => {
    const one = {
      extensions: { VRMC_vrm: { expressions: { preset: { blink: {}, aa: {} }, custom: { smirk: {} } } } },
      meshes: [{ primitives: [{ targets: [{}] }], extras: { targetNames: ['Fcl_EYE_Close'] } }],
    };
    const zero = {
      extensions: {
        VRM: {
          blendShapeMaster: {
            blendShapeGroups: [
              { name: 'Joy', presetName: 'joy' },
              { name: 'A', presetName: 'a' },
              { name: 'Wink', presetName: 'unknown' },
              { presetName: 'nothing' },
              { name: 'Odd', presetName: 'constructor' },
            ],
          },
        },
      },
    };

    expect(gltfNamesOf(glb(one))?.shapes).toEqual(['blink', 'aa', 'smirk', 'Fcl_EYE_Close']);
    expect(gltfNamesOf(glb(zero))?.shapes).toEqual(['happy', 'aa', 'Wink', 'Odd']);
  });

  it('says whether the file is a VRM, of either version', () => {
    expect(gltfNamesOf(glb({ extensionsUsed: ['VRMC_vrm'] }))?.vrm).toBe(true);
    expect(gltfNamesOf(glb({ extensionsUsed: ['VRM'] }))?.vrm).toBe(true);
    expect(gltfNamesOf(glb({ extensionsUsed: ['VRMC_vrm_animation'] }))?.vrm).toBe(false);
    expect(gltfNamesOf(glb({}))?.vrm).toBe(false);
  });

  it('names the materials, one with no name by where it stands among them', () => {
    const made = { materials: [{ name: 'Blade' }, {}, { name: ' ' }, { name: 'Blade' }] };
    expect(gltfNamesOf(glb(made))?.materials).toEqual(['Blade', '#1', '#2']);
  });

  it('names nothing of a file that holds none of them, and is null for bytes that are no model', () => {
    expect(gltfNamesOf(glb({ asset: { version: '2.0' } }))).toEqual({
      motions: [],
      shapes: [],
      materials: [],
      vrm: false,
    });
    expect(gltfNamesOf(new ArrayBuffer(4))).toBeNull();
  });

  it('reads a blob as it reads its bytes', async () => {
    const bytes = glb({ animations: [{ name: 'Walk' }] });
    expect(await gltfNamesOfBlob(new Blob([bytes]))).toEqual(gltfNamesOf(bytes));
    expect(await gltfNamesOfBlob(new Blob([new Uint8Array(3)]))).toBeNull();
  });
});

describe('materialKeyOf', () => {
  it('tells a material by its name, or by where it stands among the model’s where it has none', () => {
    expect(materialKeyOf('Blade', 2)).toBe('Blade');
    expect(materialKeyOf(' ', 2)).toBe('#2');
    expect(materialKeyOf(undefined, 0)).toBe('#0');
    expect(materialKeyOf('#1', 4)).toBe('#4');
  });
});
