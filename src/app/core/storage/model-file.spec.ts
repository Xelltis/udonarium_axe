import { isBinaryGltf, MODEL_TYPE, ModelFile, ModelState } from '@axe/core/storage/model-file';

const GLB_HEAD = [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0];

describe('ModelFile', () => {
  it('keeps an added file under the hash of its bytes, as a binary glTF file, with the name it came with', async () => {
    const model = await ModelFile.createAsync(new File([new Uint8Array(GLB_HEAD)], 'tree.glb'));

    expect(model.identifier).toMatch(/^[0-9a-f]{64}$/);
    expect(model.name).toBe('tree.glb');
    expect(model.blob?.type).toBe(MODEL_TYPE);
    expect(model.url).toMatch(/^blob:/);
    expect(model.state).toBe(ModelState.COMPLETE);
    model.destroy();
  });

  it('holds nothing for one known only from a catalogue, until the bytes come', () => {
    const model = ModelFile.createEmpty('a'.repeat(64), 'rock.glb');
    expect(model.isReady).toBe(false);

    model.apply({
      identifier: model.identifier,
      name: '',
      type: '',
      blob: new Blob([new Uint8Array(GLB_HEAD)]),
      url: '',
    });

    expect(model.isReady).toBe(true);
    expect(model.name).toBe('rock.glb');
    expect(model.url).toMatch(/^blob:/);
    expect(model.toContext().url).toBe('');
    model.destroy();
  });

  it('tells a binary glTF file of version 2 by its first bytes', () => {
    expect(isBinaryGltf(new Uint8Array(GLB_HEAD))).toBe(true);
    expect(isBinaryGltf(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 1, 0, 0, 0]))).toBe(false);
    expect(isBinaryGltf(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(false);
    expect(isBinaryGltf(new Uint8Array([0x67, 0x6c]))).toBe(false);
  });
});
