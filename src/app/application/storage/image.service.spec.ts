import { TestBed } from '@angular/core/testing';
import { ImageService } from '@axe/application/storage/image.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('ImageService', () => {
  let service: ImageService;
  let storage: ImageStorage;
  const added: string[] = [];

  function held(url: string): ImageFile {
    const image = storage.add(url);
    added.push(image.identifier);
    return image;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(ImageService);
    storage = TestBed.inject(ImageStorage);
  });

  afterEach(() => {
    for (const identifier of added.splice(0)) storage.delete(identifier);
  });

  describe('getSkeletonOr', () => {
    it('gives the skeleton for nothing named', () => {
      expect(service.getSkeletonOr(null).url).toBe('./assets/images/skeleton.png');
      expect(service.getSkeletonOr('').url).toBe('./assets/images/skeleton.png');
    });

    it('gives the skeleton for an identifier the storage does not hold', () => {
      expect(service.getSkeletonOr('no-such-picture').url).toBe('./assets/images/skeleton.png');
    });

    it('gives the skeleton for a picture with nothing to draw yet', () => {
      expect(service.getSkeletonOr(ImageFile.createEmpty('empty-picture')).url).toBe('./assets/images/skeleton.png');
    });

    it('gives the picture named, by its identifier or as itself', () => {
      const image = held('blob:drawn');

      expect(service.getSkeletonOr(image.identifier)).toBe(image);
      expect(service.getSkeletonOr(image)).toBe(image);
    });
  });

  describe('getEmptyOr', () => {
    it('gives the empty image for nothing named', () => {
      expect(service.getEmptyOr(null)).toBe(ImageFile.Empty);
      expect(service.getEmptyOr('')).toBe(ImageFile.Empty);
    });

    it('gives the empty image for an identifier the storage does not hold', () => {
      expect(service.getEmptyOr('no-such-picture')).toBe(ImageFile.Empty);
    });

    it('gives the empty image for a picture with nothing to draw yet', () => {
      expect(service.getEmptyOr(ImageFile.createEmpty('empty-picture'))).toBe(ImageFile.Empty);
    });

    it('gives the picture named, by its identifier or as itself', () => {
      const image = held('blob:drawn');

      expect(service.getEmptyOr(image.identifier)).toBe(image);
      expect(service.getEmptyOr(image)).toBe(image);
    });
  });
});
