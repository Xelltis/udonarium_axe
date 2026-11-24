import { TestBed } from '@angular/core/testing';
import { ModelFile, ModelFileContext } from '@axe/core/storage/model-file';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ModelTag } from '@axe/domain/media/model-tag';
import { ModelTagList } from '@axe/domain/media/model-tag-list';

/** A model held here in full, under an identifier given. */
function held(identifier: string): ModelFile {
  const context: ModelFileContext = {
    identifier,
    name: `${identifier}.glb`,
    type: 'model/gltf-binary',
    blob: new Blob([new Uint8Array([1])]),
    url: '',
  };
  return ModelStorage.instance.add(context);
}

describe('ModelTag', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects(ModelTag)) ObjectStore.instance.remove(object);
    for (const model of ModelStorage.instance.models) ModelStorage.instance.delete(model.identifier);
  });

  it('knows no tag of a model never tagged, and makes one the first time a model is tagged', () => {
    expect(ModelTag.get('statue')).toBeNull();

    const made = ModelTag.tagWith('statue', '家具');
    expect(ModelTag.get('statue')).toBe(made);
    expect(made.identifier).toBe('modeltag_statue');
    expect(ModelTag.tagWith('statue', '彫像')).toBe(made);
    expect(made.tag).toBe('彫像');
  });

  it('comes back from a saved room onto the model’s own tag, the copy read let go of', () => {
    const oak = held('oak');
    ModelTag.tagWith('oak', '自然');
    const xml = ModelTagList.create([oak]).toXml();
    ModelTag.get('oak')!.tag = '';

    ObjectSerializer.instance.parseXml(xml);

    expect(ModelTag.get('oak')?.tag).toBe('自然');
    expect(ObjectStore.instance.getObjects(ModelTag)).toHaveLength(1);
  });

  it('writes the tags of the models listed for a saved room, each once, and none for a model never tagged', () => {
    const oak = held('oak');
    const rock = held('rock');
    ModelTag.tagWith('oak', '自然');

    const xml = ModelTagList.create([oak, oak, rock]).innerXml();

    expect(xml.match(/<model-tag /g)).toHaveLength(1);
    expect(xml).toContain('自然');
  });

  it('comes back from a saved room with the motions the model was given, and reads one saved before motions as given none', () => {
    const avatar = held('avatar');
    ModelTag.giveMotions('avatar', '["wave"]');
    const xml = ModelTagList.create([avatar]).toXml();
    ModelTag.get('avatar')!.motions = '';

    ObjectSerializer.instance.parseXml(xml);
    expect(ModelTag.get('avatar')?.motions).toBe('["wave"]');

    ObjectSerializer.instance.parseXml('<model-tag modelIdentifier="oak" tag="自然"></model-tag>');
    expect(ModelTag.get('oak')?.motions).toBe('');
  });

  it('keeps the shelf the room has put a model on over the one a file names, and takes the file’s where it has none', () => {
    const knight = held('knight');
    ModelTag.tagWith('knight', '英雄');
    const saved = ModelTagList.create([knight]).toXml();
    ModelTag.tagWith('knight', '保管');

    ObjectSerializer.instance.parseXml(saved);
    expect(ModelTag.get('knight')?.tag).toBe('保管');

    ModelTag.tagWith('knight', '');
    ObjectSerializer.instance.parseXml(saved);
    expect(ModelTag.get('knight')?.tag).toBe('英雄');
  });

  it('adds the motions a file names after those the model is given already, taking none away', () => {
    const avatar = held('avatar');
    ModelTag.giveMotions('avatar', '["wave"]');
    const saved = ModelTagList.create([avatar]).toXml();
    ModelTag.giveMotions('avatar', '["bow","jump"]');

    ObjectSerializer.instance.parseXml(saved);
    expect(ModelTag.get('avatar')?.motions).toBe('["bow","jump","wave"]');

    ObjectSerializer.instance.parseXml('<model-tag modelIdentifier="avatar" tag="人"></model-tag>');
    expect(ModelTag.get('avatar')?.motions).toBe('["bow","jump","wave"]');
  });

  it('gives a model motions, making its tag where it has none, and keeps its tag as it was', () => {
    ModelTag.tagWith('avatar', 'people');

    const given = ModelTag.giveMotions('avatar', '["wave"]');

    expect(given).toBe(ModelTag.get('avatar'));
    expect([given.tag, given.motions]).toEqual(['people', '["wave"]']);
    expect(ModelTag.giveMotions('statue', '["bow"]').motions).toBe('["bow"]');
  });
});
