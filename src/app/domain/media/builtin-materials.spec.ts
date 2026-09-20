import { TestBed } from '@angular/core/testing';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ObjectStore } from '@axe/core/sync/object-store';
import { isBuiltinMaterial, registerBuiltinMaterials } from '@axe/domain/media/builtin-materials';
import { ImageTag } from '@axe/domain/media/image-tag';
import { TEXTURE_ASSET_URLS, TEXTURE_IMAGE_TAG, WALL_TEXTURE_ASSET_URLS } from '@axe/domain/media/texture-catalog';

describe('the materials a room is built with', () => {
  let imageStorage: ImageStorage;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    imageStorage = ImageStorage.instance;
  });

  afterEach(() => {
    for (const image of [...imageStorage.images]) imageStorage.delete(image.identifier);
    for (const tag of ObjectStore.instance.getObjects<ImageTag>(ImageTag)) tag.destroy();
    ObjectStore.instance.clearDeleteHistory();
  });

  it('puts every floor and wall picture in the library', () => {
    registerBuiltinMaterials(imageStorage);

    for (const url of Object.values(TEXTURE_ASSET_URLS)) expect(imageStorage.get(url)).not.toBeNull();
    for (const url of Object.values(WALL_TEXTURE_ASSET_URLS)) expect(imageStorage.get(url)).not.toBeNull();
  });

  it('files the floors and the walls alike as textures', () => {
    registerBuiltinMaterials(imageStorage);

    expect(ImageTag.get(TEXTURE_ASSET_URLS.stone_tile).tag).toBe(TEXTURE_IMAGE_TAG);
    expect(ImageTag.get(WALL_TEXTURE_ASSET_URLS.wall_brick).tag).toBe(TEXTURE_IMAGE_TAG);
  });

  it('names a picture after the material rather than the path it is kept at', () => {
    registerBuiltinMaterials(imageStorage);

    expect(imageStorage.get(TEXTURE_ASSET_URLS.stone_tile)!.name).toBe('stone_tile');
    expect(imageStorage.get(WALL_TEXTURE_ASSET_URLS.wall_brick)!.name).toBe('wall_brick');
  });

  it('answers a search for the tag with every one of them', () => {
    registerBuiltinMaterials(imageStorage);

    const textures = ImageTag.searchImages([TEXTURE_IMAGE_TAG]);
    expect(textures.length).toBe(Object.keys(TEXTURE_ASSET_URLS).length + Object.keys(WALL_TEXTURE_ASSET_URLS).length);
    expect(textures.some((image) => image.identifier === TEXTURE_ASSET_URLS.marble)).toBe(true);
    expect(textures.some((image) => image.identifier === WALL_TEXTURE_ASSET_URLS.wall_ice)).toBe(true);
  });

  it('knows its own pictures from the ones a person brought', () => {
    expect(isBuiltinMaterial(TEXTURE_ASSET_URLS.marble)).toBe(true);
    expect(isBuiltinMaterial(WALL_TEXTURE_ASSET_URLS.wall_ice)).toBe(true);
    expect(isBuiltinMaterial('a picture somebody added')).toBe(false);
  });

  it('leaves a picture somebody has filed for themselves where they put it', () => {
    const url = TEXTURE_ASSET_URLS.marble;
    imageStorage.add(url);
    ImageTag.create(url).tag = 'わたしの床';

    registerBuiltinMaterials(imageStorage);

    expect(ImageTag.get(url).tag).toBe('わたしの床');
  });

  it('files each picture once, however often the room is opened', () => {
    registerBuiltinMaterials(imageStorage);
    registerBuiltinMaterials(imageStorage);

    const tags = ObjectStore.instance
      .getObjects<ImageTag>(ImageTag)
      .filter((tag) => tag.imageIdentifier === TEXTURE_ASSET_URLS.marble);
    expect(tags.length).toBe(1);
  });
});
