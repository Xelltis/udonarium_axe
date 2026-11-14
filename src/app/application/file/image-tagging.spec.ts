import { tagImage } from '@axe/application/file/image-tagging';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag } from '@axe/domain/media/image-tag';

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
