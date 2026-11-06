import { gltfFactsOf } from '@axe/core/storage/gltf-facts';

/** A binary glTF file of a JSON chunk alone, which is all the facts are read from. */
function glb(json: unknown): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const padded = new Uint8Array(Math.ceil(text.length / 4) * 4).fill(0x20);
  padded.set(text);
  const bytes = new Uint8Array(20 + padded.length);
  const view = new DataView(bytes.buffer);
  bytes.set([0x67, 0x6c, 0x54, 0x46], 0);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.set(padded, 20);
  return bytes.buffer;
}

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
