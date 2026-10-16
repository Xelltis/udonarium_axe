import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, ASSET_RETRY_LIMIT } from '@axe/core/storage/asset-retries';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { CatalogItem, ImageStorage } from '@axe/core/storage/image-storage';
import type { MockInstance } from 'vitest';

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

  describe('fetching from the asset server', () => {
    const store = AssetHttpStore.instance;
    const sharingStatic = ImageSharingSystem as unknown as {
      _instance?: { cleanups: (() => void)[]; forgetMisses: () => void };
    };
    const ORIGINAL_PEER_ID = Object.getOwnPropertyDescriptor(Network, 'peerId')!;
    const ORIGINAL_PEER_IDS = Object.getOwnPropertyDescriptor(Network, 'peerIds')!;
    const pictureId = 'c'.repeat(64);
    const fetchedBlob = new Blob([new Uint8Array([9, 9, 9])], { type: 'image/webp' });

    let download: MockInstance<AssetHttpStore['download']>;
    let send: MockInstance<Network['send']>;

    const requestsSent = () =>
      send.mock.calls
        .map(([context, sendTo]) => ({ ...(context as { eventName: string; data: unknown }), sendTo }))
        .filter((context) => context.eventName === 'REQUEST_FILE_RESOURE');
    const receiveCatalogue = (catalog: CatalogItem[], from = 'peer-a') =>
      localDispatch('SYNCHRONIZE_FILE_LIST', catalog, from);

    beforeEach(() => {
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      Object.defineProperty(Network, 'peerIds', { get: () => ['self-peer', 'peer-a'], configurable: true });
      Object.defineProperty(Network, 'peerId', { get: () => 'self-peer', configurable: true });
      send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      store.configure('https://rooms.example');
      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      download = vi.spyOn(store, 'download').mockResolvedValue({ blob: fetchedBlob, name: '' });
      vi.spyOn(ImageFile, 'contextFromBytesAsync').mockImplementation(async (identifier, blob) => ({
        identifier,
        name: '',
        type: blob.type,
        blob,
        url: '',
        thumbnail: { type: 'image/webp', blob: new Blob([new Uint8Array([1])], { type: 'image/webp' }), url: '' },
      }));
      vi.spyOn(ImageStorage.instance, 'synchronize').mockImplementation(() => {});
      vi.spyOn(ImageStorage.instance, 'lazySynchronize').mockImplementation(() => {});
      ImageSharingSystem.instance.initialize();
    });

    afterEach(() => {
      sharingStatic._instance?.forgetMisses();
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      vi.useRealTimers();
      store.configure(null);
      store.useAccess(null);
      for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
      Object.defineProperty(Network, 'peerId', ORIGINAL_PEER_ID);
      Object.defineProperty(Network, 'peerIds', ORIGINAL_PEER_IDS);
    });

    it('takes an image it lacks from the server, without asking a peer', async () => {
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(download).toHaveBeenCalledWith(pictureId);
      expect(requestsSent()).toEqual([]);
    });

    it('names a picture it took from the server by the name it was put up under', async () => {
      download.mockResolvedValue({ blob: fetchedBlob, name: 'map.png' });

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(ImageStorage.instance.get(pictureId)?.name).toBe('map.png');
    });

    it('asks the peer that named the image when the server does not have it', async () => {
      download.mockResolvedValue('missing');

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');

      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      expect(requestsSent()[0]).toMatchObject({
        sendTo: 'peer-a',
        data: { identifiers: [{ identifier: pictureId, state: ImageState.NULL }], receiver: 'self-peer' },
      });
    });

    it('puts an image the server lacked up once a peer has sent it, and no other', async () => {
      const upload = vi.spyOn(ImageStorage.instance, 'uploadReceived').mockImplementation(() => {});
      download.mockResolvedValue('missing');
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      const sent = (identifier: string) => ({
        identifier,
        name: '',
        type: 'image/png',
        blob: new Uint8Array([1, 2, 3]) as unknown as Blob,
        url: '',
        thumbnail: { type: 'image/png', blob: null, url: '' },
      });

      localDispatch('UPDATE_FILE_RESOURE', { updateImages: [sent(pictureId), sent('d'.repeat(64))] }, 'peer-a');

      expect(upload.mock.calls).toEqual([[pictureId]]);
    });

    it('goes straight to peers for an image the server once lacked', async () => {
      download.mockResolvedValue('missing');
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      expect(download).toHaveBeenCalledTimes(1);
      expect(requestsSent()).toHaveLength(2);
    });

    it('asks the peer for an image the server could not send just then, and the server again for the next catalogue', async () => {
      download.mockResolvedValue('failed');
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(2));
    });

    it('asks a peer whose catalogue named a listed picture while the server was failing to send it', async () => {
      let fail: () => void = () => undefined;
      download.mockReturnValue(new Promise((resolve) => (fail = () => resolve('failed'))));
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');
      expect(requestsSent()).toEqual([]);

      fail();

      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      expect(requestsSent()[0]).toMatchObject({ sendTo: 'peer-a' });
      expect(download).toHaveBeenCalledTimes(1);
    });

    it('fetches an image once although two catalogues name it', async () => {
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-b');

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(download).toHaveBeenCalledTimes(1);
    });

    it('asks peers for an image not named by its hash', () => {
      receiveCatalogue([{ identifier: 'none_icon', state: ImageState.COMPLETE }]);

      expect(download).not.toHaveBeenCalled();
      expect(requestsSent()).toHaveLength(1);
    });

    it('takes a picture the room lists, though no catalogue names it, keeping the name it was listed under', async () => {
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: 'map.png' }]);

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(download).toHaveBeenCalledWith(pictureId);
      expect(ImageStorage.instance.get(pictureId)?.name).toBe('map.png');
    });

    it('names a picture a catalogue made a place for by the name the room lists it under', async () => {
      download.mockReturnValue(new Promise(() => {}));
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: 'map.png' }]);

      expect(ImageStorage.instance.get(pictureId)?.name).toBe('map.png');
    });

    it('asks no peer for a listed picture the server lacks, and tries the server again in another room', async () => {
      download.mockResolvedValue('missing');
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requestsSent()).toEqual([]);

      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      expect(download).toHaveBeenCalledTimes(1);
      ImageSharingSystem.instance.forgetMisses();
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      expect(download).toHaveBeenCalledTimes(2);
    });

    it('tries a listed picture the server could not send again, waiting longer each time, a few times', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      download.mockResolvedValue('failed');
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(download).toHaveBeenCalledTimes(1);

      for (let attempt = 0; attempt < ASSET_RETRY_LIMIT; attempt++) {
        const wait = ASSET_RETRY_DELAY_MS * 2 ** attempt;
        await vi.advanceTimersByTimeAsync(wait - 1);
        expect(download).toHaveBeenCalledTimes(attempt + 1);
        await vi.advanceTimersByTimeAsync(1);
        expect(download).toHaveBeenCalledTimes(attempt + 2);
      }
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** ASSET_RETRY_LIMIT);
      expect(download).toHaveBeenCalledTimes(ASSET_RETRY_LIMIT + 1);
      expect(requestsSent()).toEqual([]);
    });

    it('stops trying a listed picture again on leaving the room', async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      download.mockResolvedValue('failed');
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: '' }]);
      await vi.advanceTimersByTimeAsync(0);

      ImageSharingSystem.instance.forgetMisses();
      await vi.advanceTimersByTimeAsync(ASSET_RETRY_DELAY_MS * 2 ** ASSET_RETRY_LIMIT);

      expect(download).toHaveBeenCalledTimes(1);
    });

    it('asks peers for everything while no server is configured', () => {
      store.configure(null);
      store.useAccess(null);

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      expect(download).not.toHaveBeenCalled();
      expect(requestsSent()).toHaveLength(1);
    });
  });
});
