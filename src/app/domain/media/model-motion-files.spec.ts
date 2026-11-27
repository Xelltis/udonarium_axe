import { TestBed } from '@angular/core/testing';
import { type ModelFileContext } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { modelMotionFilesOf } from '@axe/domain/media/model-motion-files';
import { MAX_MODEL_MOTION_FILES, motionFileIdsOf, writeMotionFileIds } from '@axe/domain/media/model-motion-ids';
import { ModelTag } from '@axe/domain/media/model-tag';

/** A model known here by a name, its bytes held or not. */
function known(identifier: string, name: string, bytes = true): void {
  const context: ModelFileContext = {
    identifier,
    name,
    type: 'model/gltf-binary',
    blob: bytes ? new Blob([new Uint8Array([1])]) : null,
    url: '',
  };
  ModelStorage.instance.add(context);
}

describe('the motions given to a model', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects(ModelTag)) ObjectStore.instance.remove(object);
    for (const model of ModelStorage.instance.models) ModelStorage.instance.delete(model.identifier);
  });

  it('are read from what is written down, each once and no more than a model may have, and none from what cannot be read', () => {
    expect(motionFileIdsOf('["a","b","a",""]')).toEqual(['a', 'b']);
    const many = Array.from({ length: MAX_MODEL_MOTION_FILES + 3 }, (_, index) => `m${index}`);
    expect(motionFileIdsOf(JSON.stringify(many))).toHaveLength(MAX_MODEL_MOTION_FILES);
    for (const unread of ['', 'nonsense', '{"a":1}', '[1,2]']) expect(motionFileIdsOf(unread)).toEqual([]);
  });

  it('are written down as they are read back, and as nothing for none', () => {
    expect(writeMotionFileIds(['a', 'b', 'a'])).toBe('["a","b"]');
    expect(motionFileIdsOf(writeMotionFileIds(['a', 'b']))).toEqual(['a', 'b']);
    expect(writeMotionFileIds([])).toBe('');
  });

  it('are none for a model never given any, as one from a room saved before motions could be given', () => {
    expect(modelMotionFilesOf('avatar')).toEqual([]);
    ModelTag.tagWith('avatar', 'people');
    expect(modelMotionFilesOf('avatar')).toEqual([]);
  });

  it('are named as their files were, numbered where two would go by one name, read from their bytes held here', () => {
    known('wave-1', 'Wave.vrma');
    known('wave-2', 'Wave.vrma');
    known('bow', 'Bow.vrma', false);
    ModelTag.giveMotions('avatar', writeMotionFileIds(['wave-1', 'wave-2', 'bow', 'unknown']));

    const given = modelMotionFilesOf('avatar');

    expect(given.map(({ identifier, name }) => [identifier, name])).toEqual([
      ['wave-1', 'Wave'],
      ['wave-2', 'Wave (2)'],
      ['bow', 'Bow'],
      ['unknown', 'unknown'],
    ]);
    expect(given[0].url).toMatch(/^blob:/);
    expect(given[2].url).toBe('');
    expect(given[3].url).toBe('');
  });

  it('leave out one known here as no motion', () => {
    known('statue', 'statue.glb');
    ModelTag.giveMotions('avatar', writeMotionFileIds(['statue']));

    expect(modelMotionFilesOf('avatar')).toEqual([]);
  });
});
