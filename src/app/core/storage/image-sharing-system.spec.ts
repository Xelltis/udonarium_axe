import { Network } from '@axe/core/network/network';
import { localDispatch } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
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
    const sharingStatic = ImageSharingSystem as unknown as { _instance?: { cleanups: (() => void)[] } };
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
      download = vi.spyOn(store, 'download').mockResolvedValue(fetchedBlob);
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
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
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

    it('asks the peer that named the image when the server does not have it', async () => {
      download.mockResolvedValue(null);

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');

      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));
      expect(requestsSent()[0]).toMatchObject({
        sendTo: 'peer-a',
        data: { identifiers: [{ identifier: pictureId, state: ImageState.NULL }], receiver: 'self-peer' },
      });
    });

    it('goes straight to peers for an image the server once lacked', async () => {
      download.mockResolvedValue(null);
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);
      await vi.waitFor(() => expect(requestsSent()).toHaveLength(1));

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }]);

      expect(download).toHaveBeenCalledTimes(1);
      expect(requestsSent()).toHaveLength(2);
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

    it('takes a picture the room lists, though no catalogue names it', async () => {
      ImageSharingSystem.instance.fetchListed([pictureId]);

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(download).toHaveBeenCalledWith(pictureId);
    });

    it('asks no peer for a listed picture the server cannot give, and tries the server again in another room', async () => {
      download.mockResolvedValue(null);
      ImageSharingSystem.instance.fetchListed([pictureId]);
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(requestsSent()).toEqual([]);

      ImageSharingSystem.instance.fetchListed([pictureId]);
      expect(download).toHaveBeenCalledTimes(1);
      ImageSharingSystem.instance.forgetMisses();
      ImageSharingSystem.instance.fetchListed([pictureId]);
      expect(download).toHaveBeenCalledTimes(2);
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
