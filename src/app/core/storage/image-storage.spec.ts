import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetUploadResult } from '@axe/core/storage/asset-http-store';
import { ImageContext, ImageFile } from '@axe/core/storage/image-file';
import { CatalogItem, ImageStorage } from '@axe/core/storage/image-storage';
import type { MockInstance } from 'vitest';

describe('ImageStorage', () => {
  let storage: ImageStorage;

  beforeEach(() => {
    storage = ImageStorage.instance;
  });

  afterEach(() => {
    // clean up the images that were added
    for (const img of storage.images) {
      storage.delete(img.identifier);
    }
    vi.restoreAllMocks();
  });

  describe('instance (singleton)', () => {
    it('returns the one instance', () => {
      expect(ImageStorage.instance).toBe(ImageStorage.instance);
    });
  });

  describe('add / get / delete', () => {
    it('adds and returns an image by url', () => {
      const img = storage.add('https://example.com/test.png');
      expect(img).toBeTruthy();
      expect(img.identifier).toBe('https://example.com/test.png');
      const retrieved = storage.get('https://example.com/test.png');
      expect(retrieved).toBe(img);
    });

    it('adds an image file', () => {
      const file = ImageFile.createEmpty('img-123');
      const added = storage.add(file);
      expect(added).toBe(file);
      expect(storage.get('img-123')).toBe(file);
    });

    it('returns nothing for an id it does not know', () => {
      expect(storage.get('nonexistent')).toBeFalsy();
    });

    it('removes an image', () => {
      storage.add('https://example.com/del.png');
      expect(storage.delete('https://example.com/del.png')).toBe(true);
      expect(storage.get('https://example.com/del.png')).toBeFalsy();
    });

    it('reports failure removing an image that is not there', () => {
      expect(storage.delete('nonexistent')).toBe(false);
    });
  });

  describe('images', () => {
    it('lists what has been added', () => {
      storage.add('https://example.com/a.png');
      storage.add('https://example.com/b.png');
      expect(storage.images.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getCatalog', () => {
    it('catalogues the images it holds in full', () => {
      // an image held by url counts as complete enough to catalogue
      storage.add('https://example.com/catalog.png');
      const catalog = storage.getCatalog();
      expect(catalog.length).toBeGreaterThanOrEqual(1);
      const item = catalog.find((c) => c.identifier === 'https://example.com/catalog.png');
      expect(item).toBeTruthy();
    });
  });

  describe('sending the catalogue', () => {
    const cancelWaiting = () =>
      (storage as unknown as { catalogSchedule: { cancel(): void } }).catalogSchedule.cancel();

    const catalogueTargets = () =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.filter(([context]) => (context as { eventName: string }).eventName === 'SYNCHRONIZE_FILE_LIST')
        .map(([, sendTo]) => sendTo);

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      cancelWaiting();
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
    });

    afterEach(() => {
      cancelWaiting();
      vi.useRealTimers();
    });

    it('sends a later waiting call to the peer that call names', () => {
      storage.lazySynchronize(1000, 'peer-a');
      vi.advanceTimersByTime(1000);
      storage.lazySynchronize(1000, 'peer-b');
      vi.advanceTimersByTime(1000);

      expect(catalogueTargets()).toEqual(['peer-a', 'peer-b']);
    });

    it('still tells everyone later after telling one peer now', () => {
      storage.lazySynchronize(1000);
      storage.synchronize('peer-a');
      vi.advanceTimersByTime(1000);

      expect(catalogueTargets()).toEqual(['peer-a', undefined]);
    });

    it('sends one catalogue once a quick run of added images stops', () => {
      for (let n = 0; n < 10; n++) {
        storage.add(`https://example.com/run-${n}.png`);
        vi.advanceTimersByTime(50);
      }

      expect(catalogueTargets()).toEqual([]);
      vi.advanceTimersByTime(50);
      expect(catalogueTargets()).toEqual([undefined]);
    });
  });

  describe('the asset server', () => {
    const store = AssetHttpStore.instance;
    const pictureId = 'a'.repeat(64);

    const cancelWaiting = () =>
      (storage as unknown as { catalogSchedule: { cancel(): void } }).catalogSchedule.cancel();
    const contextOf = (identifier: string): ImageContext => ({
      identifier,
      name: '',
      type: 'image/png',
      blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
      url: 'blob:full',
      thumbnail: { type: 'image/png', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), url: 'blob:thumb' },
    });
    const catalogued = (identifier: string) => storage.getCatalog().some((item) => item.identifier === identifier);
    const sentCatalogues = () =>
      vi
        .mocked(Network.instance.send)
        .mock.calls.map(([context]) => context as { eventName: string; data: CatalogItem[] })
        .filter((context) => context.eventName === 'SYNCHRONIZE_FILE_LIST')
        .map((context) => context.data.map((item) => item.identifier));

    let finishUpload: (result: AssetUploadResult) => void;
    let upload: MockInstance<AssetHttpStore['upload']>;

    beforeEach(() => {
      store.configure('https://assets.example');
      cancelWaiting();
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      upload = vi
        .spyOn(store, 'upload')
        .mockReturnValue(new Promise<AssetUploadResult>((resolve) => (finishUpload = resolve)));
    });

    afterEach(() => {
      store.configure(null);
      cancelWaiting();
      vi.useRealTimers();
    });

    it('sends an image made on this seat to the server, and names it to peers only once it is there', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const image = ImageFile.create(contextOf(pictureId));

      storage.add(image);
      await vi.advanceTimersByTimeAsync(100);

      expect(upload).toHaveBeenCalledWith(pictureId, image.blob);
      expect(catalogued(pictureId)).toBe(false);
      expect(sentCatalogues().flat()).not.toContain(pictureId);

      finishUpload('stored');
      await vi.advanceTimersByTimeAsync(100);

      expect(catalogued(pictureId)).toBe(true);
      expect(sentCatalogues().at(-1)).toContain(pictureId);
    });

    it('still names the image to peers when the upload fails, so they ask this seat for it', async () => {
      storage.add(ImageFile.create(contextOf(pictureId)));
      finishUpload('failed');

      await vi.waitFor(() => expect(catalogued(pictureId)).toBe(true));
    });

    it('leaves an image received from a peer where it came from', () => {
      storage.add(contextOf(pictureId));

      expect(upload).not.toHaveBeenCalled();
      expect(catalogued(pictureId)).toBe(true);
    });

    it('sends nothing while no server is configured', () => {
      store.configure(null);

      storage.add(ImageFile.create(contextOf(pictureId)));

      expect(upload).not.toHaveBeenCalled();
      expect(catalogued(pictureId)).toBe(true);
    });

    it('sends neither a linked image nor a placeholder, nor one not named by its hash', () => {
      storage.add('https://example.com/linked.png');
      storage.add(ImageFile.createEmpty('b'.repeat(64)));
      storage.add(ImageFile.create(contextOf('none_icon')));

      expect(upload).not.toHaveBeenCalled();
    });
  });
});
