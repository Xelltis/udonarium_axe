import { computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ImageTagLockService } from '@axe/application/file/image-tag-lock.service';
import { textureImagesOf } from '@axe/application/file/texture-images';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_ASSET_URLS, TEXTURE_IMAGE_TAG } from '@axe/domain/media/texture-catalog';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('textureImagesOf', () => {
  let listed: () => string[];

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    const objectChange = TestBed.inject(ObjectChangeService);
    const tagLock = TestBed.inject(ImageTagLockService);
    const textures = computed(() => textureImagesOf(objectChange, tagLock));
    listed = () => textures().map((file) => file.identifier);
  });

  afterEach(() => {
    ImageStorage.instance.images.forEach((image) => ImageStorage.instance.delete(image.identifier));
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.delete(object, false);
    ObjectStore.instance.clearDeleteHistory();
  });

  it('lists the pictures filed as textures, and no other', () => {
    ImageStorage.instance.add('tex-1');
    ImageStorage.instance.add('other');
    ImageTag.create('tex-1').tag = TEXTURE_IMAGE_TAG;
    ImageTag.create('other').tag = 'スタンプ';

    expect(listed()).toEqual(['tex-1']);
  });

  it('leaves out the pictures the tool is built with', () => {
    ImageStorage.instance.add(TEXTURE_ASSET_URLS.marble);
    ImageStorage.instance.add('mine');
    ImageTag.create(TEXTURE_ASSET_URLS.marble).tag = TEXTURE_IMAGE_TAG;
    ImageTag.create('mine').tag = TEXTURE_IMAGE_TAG;

    expect(listed()).toEqual(['mine']);
  });

  it('follows a picture being filed once it has been read', () => {
    expect(listed()).toEqual([]);

    ImageStorage.instance.add('late');
    ImageTag.create('late').tag = TEXTURE_IMAGE_TAG;
    TestBed.inject(ObjectChangeService).notifyCollectionChanged('image-tag');

    expect(listed()).toEqual(['late']);
  });

  it('follows a picture already tagged being filed as a texture at another seat', () => {
    ImageStorage.instance.add('refiled');
    const tag = ImageTag.create('refiled');
    tag.tag = 'スタンプ';
    expect(listed()).toEqual([]);

    tag.tag = TEXTURE_IMAGE_TAG;
    TestBed.inject(ObjectChangeService).notifyChanged(tag.identifier);

    expect(listed()).toEqual(['refiled']);
  });
});
