import { Network } from '@axe/core/network/network';
import { AssetHttpStore, AssetUploadResult } from '@axe/core/storage/asset-http-store';
import {
  ASSET_LAST_TRY_DELAY_MS,
  ASSET_RETRY_DELAY_MS,
  AssetRetries,
  RECEIVED_UPLOAD_TURN_MS,
  receivedUploadTurnMs,
} from '@axe/core/storage/asset-retries';
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
      store.configure('https://rooms.example');
      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      cancelWaiting();
      vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const pending = new Promise<AssetUploadResult>((resolve) => (finishUpload = resolve));
      upload = vi.spyOn(store, 'upload').mockReturnValue(pending);
    });

    afterEach(() => {
      store.configure(null);
      store.useAccess(null);
      cancelWaiting();
      (storage as unknown as { uploadRetries: AssetRetries }).uploadRetries.clear();
      (storage as unknown as { missedUploads: Set<string> }).missedUploads.clear();
      (storage as unknown as { uploading: Set<string> }).uploading.clear();
      (storage as unknown as { gaveUp: Set<string> }).gaveUp.clear();
      (storage as unknown as { clearLastTries(): void }).clearLastTries();
      vi.useRealTimers();
    });

    it('puts up a picture added while the room was out of reach once back, and asks about nothing else', async () => {
      storage.add(ImageFile.create(contextOf('b'.repeat(64))));
      upload.mockClear();
      store.useAccess(() => null);
      storage.add(ImageFile.create(contextOf(pictureId)));
      expect(upload).not.toHaveBeenCalled();

      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      storage.uploadMissedToAssetStore();
      storage.uploadMissedToAssetStore();

      expect(upload.mock.calls.map(([identifier]) => identifier)).toEqual([pictureId]);
      finishUpload('stored');
      await new Promise((resolve) => setTimeout(resolve, 0));
      storage.delete('b'.repeat(64));
    });

    it('sends an image made on this seat to the server, and names it to peers only once it is there', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const image = ImageFile.create(contextOf(pictureId));

      storage.add(image);
      await vi.advanceTimersByTimeAsync(100);

      expect(upload).toHaveBeenCalledWith(pictureId, image.blob, '', expect.objectContaining({ first: true }));
      expect(catalogued(pictureId)).toBe(false);
      expect(sentCatalogues().flat()).not.toContain(pictureId);

      finishUpload('stored');
      await vi.advanceTimersByTimeAsync(100);

      expect(catalogued(pictureId)).toBe(true);
      expect(sentCatalogues().at(-1)).toContain(pictureId);
    });

    it('names the image to peers only once its tries to go up have run out, so they ask this seat for it', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      upload.mockResolvedValue('failed');
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      expect(catalogued(pictureId)).toBe(false);

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 7);
      expect(upload).toHaveBeenCalledTimes(4);
      expect(catalogued(pictureId)).toBe(true);
    });

    it('keeps an image turned away while the room was out of reach for when the seat is back, its tries unspent', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      store.useAccess(() => null);
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(1);
      expect(catalogued(pictureId)).toBe(false);

      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      upload.mockResolvedValue('failed');
      storage.uploadMissedToAssetStore();
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

      // Back in reach, it has every try still to spend: the one just made and three more.
      expect(upload).toHaveBeenCalledTimes(5);
    });

    it.each([
      ['made a guest', 'guest', 'room-a'],
      ['gone to another room', 'pl', 'room-b'],
    ] as const)('tries no failed upload again for a seat %s since', async (_case, roleThen, roomThen) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(ImageFile.create(contextOf(pictureId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear().mockResolvedValue('failed');

      role.mockReturnValue(roleThen);
      room.mockReturnValue(roomThen);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);

      expect(upload).not.toHaveBeenCalled();
    });

    it('has something yet to go up while it is going up or kept for later, and nothing once it is there', async () => {
      storage.add(ImageFile.create(contextOf(pictureId)));
      expect(storage.hasUploadsPending).toBe(true);
      finishUpload('stored');
      await vi.waitFor(() => expect(storage.hasUploadsPending).toBe(false));

      store.useAccess(() => null);
      storage.add(ImageFile.create(contextOf('b'.repeat(64))));

      expect(storage.hasUploadsPending).toBe(true);
    });

    it('waits its turn to put up one a peer sent, and puts nothing up for a room left meanwhile', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(contextOf(pictureId));
      storage.receivedUploadTurn = () => 2;
      const turns = 2 * receivedUploadTurnMs(storage.get(pictureId)!.blob!.size);
      try {
        storage.uploadReceived(pictureId);
        await vi.advanceTimersByTimeAsync(turns - 1);
        expect(upload).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(upload).toHaveBeenCalledTimes(1);

        finishUpload('stored');
        await vi.advanceTimersByTimeAsync(0);
        storage.uploadReceived(pictureId);
        room.mockReturnValue('room-b');
        await vi.advanceTimersByTimeAsync(turns);
        expect(upload).toHaveBeenCalledTimes(1);
      } finally {
        storage.receivedUploadTurn = () => 0;
      }
    });

    it('waits for the whole picture to have come before taking its turn, not its thumbnail', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.receivedUploadTurn = () => 1;
      try {
        storage.add({ ...contextOf(pictureId), blob: undefined, url: '' } as unknown as ImageContext);
        storage.uploadReceived(pictureId);
        storage.add(contextOf(pictureId));
        await vi.advanceTimersByTimeAsync(receivedUploadTurnMs(1));
        expect(upload).not.toHaveBeenCalled();

        storage.uploadReceived(pictureId);
        await vi.advanceTimersByTimeAsync(receivedUploadTurnMs(storage.get(pictureId)!.blob!.size));
        expect(upload).toHaveBeenCalledTimes(1);
      } finally {
        storage.receivedUploadTurn = () => 0;
      }
    });

    it('waits a turn long enough for the bytes to go up over a slow line', () => {
      expect(receivedUploadTurnMs(0)).toBe(RECEIVED_UPLOAD_TURN_MS);
      expect(receivedUploadTurnMs(10 * 1024 * 1024)).toBeGreaterThan(40_000);
    });

    it('gives one whose tries ran out a last try a while later, once in the room, and counts it till then', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      upload.mockResolvedValue('failed');
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(4);
      expect(storage.hasUploadsPending).toBe(true);

      storage.uploadMissedToAssetStore();
      await vi.advanceTimersByTimeAsync(0);
      expect(upload).toHaveBeenCalledTimes(4);

      await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS + ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(5);
      await vi.advanceTimersByTimeAsync((ASSET_LAST_TRY_DELAY_MS + ASSET_RETRY_DELAY_MS * 8) * 3);
      expect(upload).toHaveBeenCalledTimes(5);
      expect(storage.hasUploadsPending).toBe(true);
    });

    it('stops counting one still to go up once the room is found to hold it, or it is deleted', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      upload.mockResolvedValue('failed');
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(storage.hasUploadsPending).toBe(true);

      storage.forgetUploaded([pictureId]);
      expect(storage.hasUploadsPending).toBe(false);
      await vi.advanceTimersByTimeAsync(ASSET_LAST_TRY_DELAY_MS);
      expect(upload).toHaveBeenCalledTimes(4);

      store.useAccess(() => null);
      storage.add(ImageFile.create(contextOf('d'.repeat(64))));
      expect(storage.hasUploadsPending).toBe(true);
      storage.delete('d'.repeat(64));
      expect(storage.hasUploadsPending).toBe(false);
    });

    it('has nothing yet to go up for a guest, who puts nothing up, but for one going up', () => {
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');
      store.useAccess(() => null);
      storage.add(ImageFile.create(contextOf(pictureId)));
      expect(storage.hasUploadsPending).toBe(false);

      role.mockReturnValue('pl');

      expect(storage.hasUploadsPending).toBe(true);
    });

    it('has something yet to go up while a failed one waits to be tried again', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);

      expect(storage.hasUploadsPending).toBe(true);
    });

    it.each([
      ['waiting to be tried again', true],
      ['waiting for the room to be in reach', false],
    ] as const)('names to peers one %s once the seat is a guest, who puts nothing up', async (_case, inReach) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      if (!inReach) store.useAccess(() => null);
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      expect(catalogued(pictureId)).toBe(false);

      role.mockReturnValue('guest');

      expect(catalogued(pictureId)).toBe(true);
    });

    it('puts one that went up to a room left meanwhile up to the room it is in now as well', async () => {
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(ImageFile.create(contextOf(pictureId)));
      room.mockReturnValue('room-b');
      upload.mockResolvedValue('stored');

      finishUpload('stored');

      await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
      expect(upload.mock.calls[1][0]).toBe(pictureId);
    });

    it.each([
      ['still in the room it went up to', 'room-a', 'pl', 'stored'],
      ['made a guest in the room it is in now', 'room-b', 'guest', 'exists'],
      ['whose try failed, left to the tries to come', 'room-b', 'pl', 'failed'],
    ] as const)('puts it up only once for a seat %s', async (_case, roomThen, roleThen, result) => {
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      const room = vi.spyOn(Network.instance, 'roomKey', 'get').mockReturnValue('room-a');
      storage.add(ImageFile.create(contextOf(pictureId)));
      room.mockReturnValue(roomThen);
      role.mockReturnValue(roleThen);
      upload.mockResolvedValue('stored');

      finishUpload(result);
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(upload).toHaveBeenCalledTimes(1);
    });

    it('tries an upload that failed again a few times, further apart each time', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
      vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('pl');
      storage.add(ImageFile.create(contextOf(pictureId)));
      finishUpload('failed');
      await vi.advanceTimersByTimeAsync(0);
      upload.mockClear().mockResolvedValue('failed');

      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS);
      expect(upload).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2);
      expect(upload).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 4);
      expect(upload).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 8);
      expect(upload).toHaveBeenCalledTimes(3);
    });

    it('puts one a peer sent up for a GM or a PL, where the store was found to lack it, but not for a guest', async () => {
      storage.add(contextOf(pictureId));
      const role = vi.spyOn(Network.instance, 'serverRole', 'get').mockReturnValue('guest');

      storage.uploadReceived(pictureId);
      expect(upload).not.toHaveBeenCalled();

      role.mockReturnValue('pl');
      storage.uploadReceived(pictureId);
      expect(upload).toHaveBeenCalledWith(pictureId, expect.any(Blob), '', expect.objectContaining({ first: false }));
      finishUpload('stored');
      await vi.waitFor(() => expect(catalogued(pictureId)).toBe(true));
    });

    it('leaves an image received from a peer where it came from', () => {
      storage.add(contextOf(pictureId));

      expect(upload).not.toHaveBeenCalled();
      expect(catalogued(pictureId)).toBe(true);
    });

    it('sends every image held in full up to a room just entered, received ones too', async () => {
      storage.add(contextOf(pictureId));
      storage.add('https://example.com/linked.png');
      upload.mockClear();

      storage.uploadAllToAssetStore();

      expect(upload).toHaveBeenCalledTimes(1);
      expect(upload).toHaveBeenCalledWith(pictureId, expect.any(Blob), '', expect.objectContaining({ first: false }));
      finishUpload('exists');
      await vi.waitFor(() => expect(catalogued(pictureId)).toBe(true));
    });

    it('sends nothing while no server is configured', () => {
      store.configure(null);
      store.useAccess(null);

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
