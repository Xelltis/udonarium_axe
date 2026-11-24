import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { ModelMotionFilesService } from '@axe/application/tabletop/model-motion-files.service';
import { type ModelFileContext } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { MAX_MODEL_MOTION_FILES } from '@axe/domain/media/model-motion-ids';
import { ModelTag } from '@axe/domain/media/model-tag';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

/** A model held here in full under a name. */
function held(identifier: string, name: string): void {
  const context: ModelFileContext = {
    identifier,
    name,
    type: 'model/gltf-binary',
    blob: new Blob([new Uint8Array([1])]),
    url: '',
  };
  ModelStorage.instance.add(context);
}

describe('ModelMotionFilesService', () => {
  let motions: ModelMotionFilesService;
  let mayEdit: boolean;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    mayEdit = true;
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockImplementation(() => mayEdit);
    motions = TestBed.inject(ModelMotionFilesService);
    held('avatar', 'Avatar.vrm');
    held('wave', 'Wave.vrma');
    held('bow', 'Bow.vrma');
    held('oak', 'oak.glb');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects(ModelTag)) ObjectStore.instance.remove(object);
    for (const model of ModelStorage.instance.models) ModelStorage.instance.delete(model.identifier);
  });

  it('offers a model the motions held here it is not given yet, by name, and no model that is drawn', () => {
    expect(motions.givable('avatar').map((motion) => motion.name)).toEqual(['Bow', 'Wave']);

    expect(motions.give('avatar', 'wave')).toBe(true);

    expect(motions.givenTo('avatar').map((motion) => motion.name)).toEqual(['Wave']);
    expect(motions.givable('avatar').map((motion) => motion.name)).toEqual(['Bow']);
  });

  it('gives a motion once, takes it back, and gives no more than a model may have', () => {
    expect(motions.give('avatar', 'wave')).toBe(true);
    expect(motions.give('avatar', 'wave')).toBe(false);
    expect(motions.takeBack('avatar', 'wave')).toBe(true);
    expect(motions.takeBack('avatar', 'wave')).toBe(false);
    expect(motions.givenTo('avatar')).toEqual([]);
    expect(ModelTag.get('avatar')?.motions).toBe('');

    ModelTag.giveMotions('avatar', JSON.stringify(Array.from({ length: MAX_MODEL_MOTION_FILES }, (_, i) => `m${i}`)));
    expect(motions.give('avatar', 'wave')).toBe(false);
  });

  it('gives and takes back nothing for a seat that may not change the table', () => {
    motions.give('avatar', 'wave');
    mayEdit = false;

    expect(motions.canGive()).toBe(false);
    expect(motions.give('avatar', 'bow')).toBe(false);
    expect(motions.takeBack('avatar', 'wave')).toBe(false);
    expect(motions.givenTo('avatar').map((motion) => motion.name)).toEqual(['Wave']);
  });
});
