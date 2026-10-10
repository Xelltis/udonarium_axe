import { localDispatch } from '@axe/core/network/network-messaging';
import { ImageContext, ImageState } from '@axe/core/storage/image-file';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { CatalogItem, ImageStorage } from '@axe/core/storage/image-storage';

type ImageSharingSystemPrivate = {
  makeSendUpdateImages: (catalog: CatalogItem[], maxSize?: number) => ImageContext[];
};

describe('ImageSharingSystem', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      expect(ImageSharingSystem.instance).toBe(ImageSharingSystem.instance);
    });
  });

  describe('initialize', () => {
    it('survives being initialised', () => {
      ImageSharingSystem.instance.initialize();
      expect(true).toBe(true);
    });
  });

  describe('a peer connecting', () => {
    it('sends the catalogue to that peer alone, since everyone else has had it already', () => {
      ImageSharingSystem.instance.initialize();
      const synchronize = vi.spyOn(ImageStorage.instance, 'synchronize').mockImplementation(() => {});

      localDispatch('CONNECT_PEER', { peerId: 'newcomer' });

      expect(synchronize).toHaveBeenCalledWith('newcomer');
    });
  });

  describe('makeSendUpdateImages', () => {
    it('leaves an image with no bytes out of what it sends', () => {
      const imageLike = {
        identifier: 'broken-image',
        name: 'broken-image',
        state: ImageState.COMPLETE,
        url: '',
        blob: null,
        thumbnail: { type: '', blob: null, url: '' },
      };

      vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(imageLike as never);

      const catalog: CatalogItem[] = [{ identifier: 'broken-image', state: ImageState.COMPLETE }];

      const result = (ImageSharingSystem.instance as unknown as ImageSharingSystemPrivate).makeSendUpdateImages(
        catalog,
        1024
      );

      expect(result).toEqual([]);
    });
  });
});
