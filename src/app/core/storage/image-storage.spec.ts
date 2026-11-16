import { Network } from '@axe/core/network/network';
import { ASSET_RETRY_DELAY_MS, receivedUploadTurnMs } from '@axe/core/storage/asset-retries';
import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { describeSharedAssetStorage } from '@axe/testing/shared-asset-storage-cases';

/** A picture held whole under the identifier, with its thumbnail, as one received from a peer. */
const contextOf = (identifier: string): ImageContext => ({
  identifier,
  name: '',
  type: 'image/png',
  blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  url: 'blob:full',
  thumbnail: { type: 'image/png', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), url: 'blob:thumb' },
});

describeSharedAssetStorage<ImageStorage, ImageFile, ImageContext>(
  {
    name: 'ImageStorage',
    noun: 'picture',
    storage: () => ImageStorage.instance,
    files: (storage) => storage.images,
    file: ImageFile,
    contextOf,
    uploadName: '',
  },
  {
    held: (h) => {
      describe('a picture held by a link', () => {
        it('adds and returns an image by url', () => {
          const img = h.storage.add('https://example.com/test.png');
          expect(img).toBeTruthy();
          expect(img.identifier).toBe('https://example.com/test.png');
          const retrieved = h.storage.get('https://example.com/test.png');
          expect(retrieved).toBe(img);
        });

        it('removes an image', () => {
          h.storage.add('https://example.com/del.png');
          expect(h.storage.delete('https://example.com/del.png')).toBe(true);
          expect(h.storage.get('https://example.com/del.png')).toBeFalsy();
        });

        it('lists what has been added', () => {
          h.storage.add('https://example.com/a.png');
          h.storage.add('https://example.com/b.png');
          expect(h.storage.images.length).toBeGreaterThanOrEqual(2);
        });

        it('catalogues the images it holds in full', () => {
          h.storage.add('https://example.com/catalog.png');
          const catalog = h.storage.getCatalog();
          expect(catalog.length).toBeGreaterThanOrEqual(1);
          const item = catalog.find((c) => c.identifier === 'https://example.com/catalog.png');
          expect(item).toBeTruthy();
        });

        it('names no picture, as a room holds many', () => {
          h.storage.add('https://example.com/unnamed.png');

          const item = h.storage.getCatalog().find((c) => c.identifier === 'https://example.com/unnamed.png');

          expect(item).toEqual({ identifier: 'https://example.com/unnamed.png', state: 1000 });
          expect(item).not.toHaveProperty('name');
        });
      });

      describe('a placeholder', () => {
        it('is added and found under its identifier', () => {
          const file = ImageFile.createEmpty('img-123');
          const added = h.storage.add(file);
          expect(added).toBe(file);
          expect(h.storage.get('img-123')).toBe(file);
        });
      });
    },
    assetServer: (h) => {
      it('waits for the whole picture to have come before taking its turn, not its thumbnail', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        h.storage.receivedUploadTurn = () => 1;
        try {
          h.storage.add({ ...contextOf(h.heldId), blob: undefined, url: '' } as unknown as ImageContext);
          h.storage.uploadReceived(h.heldId);
          h.storage.add(contextOf(h.heldId));
          await vi.advanceTimersByTimeAsync(receivedUploadTurnMs(1));
          expect(h.upload).not.toHaveBeenCalled();

          h.storage.uploadReceived(h.heldId);
          await vi.advanceTimersByTimeAsync(receivedUploadTurnMs(h.storage.get(h.heldId)!.blob!.size));
          expect(h.upload).toHaveBeenCalledTimes(1);
        } finally {
          h.storage.receivedUploadTurn = () => 0;
        }
      });

      it('names the picture in the catalogue sent to peers only once it is there', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        const image = ImageFile.create(contextOf(h.heldId));

        h.storage.add(image);
        await vi.advanceTimersByTimeAsync(100);

        expect(h.upload).toHaveBeenCalledWith(h.heldId, image.blob, '', expect.objectContaining({ first: true }));
        expect(h.catalogued(h.heldId)).toBe(false);
        expect(h.sentCatalogues().flat()).not.toContain(h.heldId);

        h.finishUpload('stored');
        await vi.advanceTimersByTimeAsync(100);

        expect(h.catalogued(h.heldId)).toBe(true);
        expect(h.sentCatalogues().at(-1)).toContain(h.heldId);
      });

      it('names the image to peers only once its tries to go up have run out, so they ask this seat for it', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
        vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
        h.storage.add(ImageFile.create(contextOf(h.heldId)));
        h.upload.mockResolvedValue('failed');
        h.finishUpload('failed');
        await vi.advanceTimersByTimeAsync(0);
        expect(h.catalogued(h.heldId)).toBe(false);

        await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 7);
        expect(h.upload).toHaveBeenCalledTimes(4);
        expect(h.catalogued(h.heldId)).toBe(true);
      });

      it('sends no linked image, on entering a room either', () => {
        h.storage.add('https://example.com/linked.png');
        expect(h.upload).not.toHaveBeenCalled();

        h.storage.uploadAllToAssetStore();

        expect(h.upload).not.toHaveBeenCalled();
      });
    },
  }
);
