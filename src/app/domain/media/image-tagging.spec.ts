import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag } from '@axe/domain/media/image-tag';
import { ImageTagLock } from '@axe/domain/media/image-tag-lock';
import { fileUntaggedImage, tagImage, tagImageUnlessKept } from '@axe/domain/media/image-tagging';

describe('tagImage', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('makes the tag of a picture that has none', () => {
    const tag = tagImage('picture-1', 'テクスチャ');

    expect(ImageTag.get('picture-1')).toBe(tag);
    expect(tag.tag).toBe('テクスチャ');
  });

  it('files a picture already tagged under the new tag, on the tag the room holds', () => {
    const held = ImageTag.create('picture-1');
    held.tag = 'モンスター';

    const tag = tagImage('picture-1', 'テクスチャ');

    expect(tag).toBe(held);
    expect(ImageTag.get('picture-1')?.tag).toBe('テクスチャ');
    expect(ObjectStore.instance.getObjects(ImageTag)).toHaveLength(1);
  });
});

describe('tagImageUnlessKept', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('files a picture with no tag, and one under a tag nobody keeps, as tagImage does', () => {
    ImageTag.create('picture-2').tag = 'モンスター';

    expect(tagImageUnlessKept('picture-1', 'テクスチャ')).toBeNull();
    expect(tagImageUnlessKept('picture-2', 'テクスチャ')).toBeNull();

    expect(ImageTag.get('picture-1')?.tag).toBe('テクスチャ');
    expect(ImageTag.get('picture-2')?.tag).toBe('テクスチャ');
  });

  it('leaves a picture under a tag kept to someone where it is, and answers that tag', () => {
    ImageTag.create('picture-1').tag = '秘蔵';
    ImageTagLock.lock('秘蔵', 'owner_me');

    expect(tagImageUnlessKept('picture-1', 'テクスチャ')).toBe('秘蔵');

    expect(ImageTag.get('picture-1')?.tag).toBe('秘蔵');
  });

  it('files a picture under a tag that was kept and is kept no longer', () => {
    ImageTag.create('picture-1').tag = '秘蔵';
    ImageTagLock.lock('秘蔵', 'owner_me');
    ImageTagLock.unlock('秘蔵');

    expect(tagImageUnlessKept('picture-1', 'テクスチャ')).toBeNull();

    expect(ImageTag.get('picture-1')?.tag).toBe('テクスチャ');
  });
});

describe('fileUntaggedImage', () => {
  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('makes the tag of a picture that has none', () => {
    const tag = fileUntaggedImage('picture-1', '地形');

    expect(ImageTag.get('picture-1')).toBe(tag);
    expect(tag.tag).toBe('地形');
  });

  it('files a picture whose tag is empty', () => {
    const held = ImageTag.create('picture-1');

    expect(fileUntaggedImage('picture-1', '地形')).toBe(held);
    expect(held.tag).toBe('地形');
  });

  it('leaves a picture a person has filed under the tag they gave it', () => {
    const held = ImageTag.create('picture-1');
    held.tag = 'モンスター';

    expect(fileUntaggedImage('picture-1', '地形')).toBe(held);
    expect(held.tag).toBe('モンスター');
    expect(ObjectStore.instance.getObjects(ImageTag)).toHaveLength(1);
  });
});
