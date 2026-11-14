import { Network } from '@axe/core/network/network';
import { FIRST_SYNC_SETTLED, localDispatch } from '@axe/core/network/network-messaging';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { ASSET_RETRY_DELAY_MS, ASSET_RETRY_LIMIT } from '@axe/core/storage/asset-retries';
import { BufferSharingTask } from '@axe/core/storage/buffer-sharing-task';
import { ImageContext, ImageFile, ImageState } from '@axe/core/storage/image-file';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { FIRST_SYNC_HOLD_MAX_MS } from '@axe/core/storage/shared-asset-sharing-system';
import { CatalogItem } from '@axe/core/storage/shared-asset-storage';
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

  describe('a peer asking for pictures', () => {
    it('sends none this seat holds back for the room server’s operator, and passes the request on', () => {
      ImageSharingSystem.instance.initialize();
      const held = ImageFile.create({
        identifier: 'e'.repeat(64),
        name: '',
        type: 'image/png',
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        url: 'blob:held',
        thumbnail: { type: 'image/png', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), url: 'blob:t' },
      });
      vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(held);
      vi.spyOn(ImageStorage.instance, 'isHeldBack').mockReturnValue(true);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('self-peer');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});

      localDispatch(
        'REQUEST_FILE_RESOURE',
        {
          identifiers: [{ identifier: held.identifier, state: ImageState.NULL }],
          receiver: 'asker',
          candidatePeers: ['other'],
        },
        'asker'
      );

      const sent = send.mock.calls.map(([context, to]) => [(context as { eventName: string }).eventName, to]);
      expect(sent).toEqual([['REQUEST_FILE_RESOURE', 'other']]);
    });
  });

  describe('a peer asking for a picture on its way to another peer alone', () => {
    it('sends it to nobody else meanwhile, and passes the request on', () => {
      ImageSharingSystem.instance.initialize();
      const held = ImageFile.create({
        identifier: 'f'.repeat(64),
        name: '',
        type: 'image/png',
        blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
        url: 'blob:held',
        thumbnail: { type: 'image/png', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), url: 'blob:t' },
      });
      vi.spyOn(ImageStorage.instance, 'get').mockReturnValue(held);
      vi.spyOn(ImageStorage.instance, 'isHeldBack').mockReturnValue(false);
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('self-peer');
      const send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      const sending = (ImageSharingSystem.instance as unknown as { sendTaskMap: Map<string, unknown> }).sendTaskMap;
      sending.set(held.identifier, { sendTo: 'first', cancel: () => {} });

      localDispatch(
        'REQUEST_FILE_RESOURE',
        {
          identifiers: [{ identifier: held.identifier, state: ImageState.NULL }],
          receiver: 'asker',
          candidatePeers: ['other'],
        },
        'asker'
      );
      sending.delete(held.identifier);

      const sent = send.mock.calls.map(([context, to]) => [(context as { eventName: string }).eventName, to]);
      expect(sent).toEqual([['REQUEST_FILE_RESOURE', 'other']]);
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
      expect(download).toHaveBeenCalledWith(pictureId, { first: false });
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

    describe('a picture the room removed', () => {
      beforeEach(() => ImageStorage.instance.markRemoved(pictureId));
      afterEach(() => ImageStorage.instance.unmarkRemoved(pictureId));

      it('is taken from neither the server nor the peer whose catalogue names it', async () => {
        receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(ImageStorage.instance.get(pictureId)).toBeNull();
        expect(download).not.toHaveBeenCalled();
        expect(requestsSent()).toEqual([]);
      });

      it('is taken neither from the room’s list nor as sent, and its sending is called off', () => {
        ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: 'map.png' }]);
        localDispatch(
          'UPDATE_FILE_RESOURE',
          {
            updateImages: [
              {
                identifier: pictureId,
                name: '',
                type: 'image/png',
                blob: new Uint8Array([1, 2, 3]) as unknown as Blob,
                url: '',
                thumbnail: { type: 'image/png', blob: null, url: '' },
              },
            ],
          },
          'peer-a'
        );
        localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: pictureId }, 'peer-a');

        expect(ImageStorage.instance.get(pictureId)).toBeNull();
        expect(download).not.toHaveBeenCalled();
        expect(send.mock.calls.map(([context]) => (context as { eventName: string }).eventName)).toContain(
          `CANCEL_TASK_${pictureId}`
        );
      });
    });

    it('keeps no empty entry for an image the operator took down', async () => {
      download.mockResolvedValue('blocked');

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-b');

      expect(ImageStorage.instance.get(pictureId)).toBeNull();
    });

    it('asks no peer, then or for a later catalogue, for an image the operator took down', async () => {
      download.mockResolvedValue('blocked');
      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-a');
      await vi.waitFor(() => expect(download).toHaveBeenCalledTimes(1));
      await new Promise((resolve) => setTimeout(resolve, 0));

      receiveCatalogue([{ identifier: pictureId, state: ImageState.COMPLETE }], 'peer-b');
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(download).toHaveBeenCalledTimes(1);
      expect(requestsSent()).toEqual([]);
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

    it('names every other peer to pass its request on to, though the list of peers leaves this seat out', () => {
      Object.defineProperty(Network, 'peerIds', { get: () => ['peer-a', 'peer-b'], configurable: true });

      receiveCatalogue([{ identifier: 'none_icon', state: ImageState.COMPLETE }]);

      expect(requestsSent()[0]).toMatchObject({ data: { candidatePeers: ['peer-a', 'peer-b'] } });
    });

    it('takes a picture the room lists, though no catalogue names it, keeping the name it was listed under', async () => {
      ImageSharingSystem.instance.fetchListed([{ id: pictureId, name: 'map.png' }]);

      await vi.waitFor(() => expect(ImageStorage.instance.get(pictureId)?.state).toBe(ImageState.COMPLETE));
      expect(download).toHaveBeenCalledWith(pictureId, { first: false });
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

  describe('a catalogue from a peer whose pictures are still coming in', () => {
    const sharingStatic = ImageSharingSystem as unknown as { _instance?: { cleanups: (() => void)[] } };
    const ORIGINAL_PEER_ID = Object.getOwnPropertyDescriptor(Network, 'peerId')!;
    const ORIGINAL_PEER_IDS = Object.getOwnPropertyDescriptor(Network, 'peerIds')!;

    interface FakeTask {
      identifier: string;
      sendTo: undefined;
      start: () => void;
      cancel: () => void;
      onfinish: ((task: FakeTask, data: unknown) => void) | null;
    }

    let send: MockInstance<Network['send']>;
    let tasks: FakeTask[];

    const requestsSent = () =>
      send.mock.calls
        .map(([context, sendTo]) => ({ ...(context as { eventName: string; data: unknown }), sendTo }))
        .filter((context) => context.eventName === 'REQUEST_FILE_RESOURE');
    const wantedIn = (request: { data: unknown }) =>
      (request.data as { identifiers: CatalogItem[] }).identifiers.map((item) => item.identifier);
    const receiveCatalogue = (identifiers: string[], from: string) =>
      localDispatch(
        'SYNCHRONIZE_FILE_LIST',
        identifiers.map((identifier) => ({ identifier, state: ImageState.COMPLETE })),
        from
      );
    const arrived = (identifier: string): ImageContext => ({
      identifier,
      name: identifier,
      type: 'image/png',
      blob: new Blob([new Uint8Array([1])], { type: 'image/png' }),
      url: '',
      thumbnail: { type: 'image/png', blob: new Blob([new Uint8Array([1])], { type: 'image/png' }), url: '' },
    });

    beforeEach(() => {
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      Object.defineProperty(Network, 'peerIds', { get: () => ['self-peer', 'peer-a', 'peer-b'], configurable: true });
      Object.defineProperty(Network, 'peerId', { get: () => 'self-peer', configurable: true });
      send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      vi.spyOn(ImageStorage.instance, 'synchronize').mockImplementation(() => {});
      vi.spyOn(ImageStorage.instance, 'lazySynchronize').mockImplementation(() => {});
      tasks = [];
      vi.spyOn(BufferSharingTask, 'createReceiveTask').mockImplementation((identifier: string) => {
        const task: FakeTask = { identifier, sendTo: undefined, start: () => {}, cancel: () => {}, onfinish: null };
        tasks.push(task);
        return task as never;
      });
      ImageSharingSystem.instance.initialize();
    });

    afterEach(() => {
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
      Object.defineProperty(Network, 'peerId', ORIGINAL_PEER_ID);
      Object.defineProperty(Network, 'peerIds', ORIGINAL_PEER_IDS);
    });

    it('asks that peer for nothing until they have come, then for what it still lacks', () => {
      localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: 'several-pictures' }, 'peer-a');

      receiveCatalogue(['on-its-way', 'still-lacking'], 'peer-a');

      expect(requestsSent()).toEqual([]);
      expect(ImageStorage.instance.get('still-lacking')).not.toBeNull();

      tasks[0].onfinish?.(tasks[0], [arrived('on-its-way')]);

      expect(requestsSent()).toHaveLength(1);
      expect(requestsSent()[0].sendTo).toBe('peer-a');
      expect(wantedIn(requestsSent()[0])).toEqual(['still-lacking']);
    });

    it('asks that peer for nothing more when the pictures that came were all it lacked', () => {
      localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: 'several-pictures' }, 'peer-a');
      receiveCatalogue(['on-its-way'], 'peer-a');

      tasks[0].onfinish?.(tasks[0], [arrived('on-its-way')]);

      expect(requestsSent()).toEqual([]);
    });

    it('still asks another peer whose catalogue names pictures it lacks', () => {
      localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: 'several-pictures' }, 'peer-a');

      receiveCatalogue(['still-lacking'], 'peer-b');

      expect(requestsSent().map((request) => request.sendTo)).toEqual(['peer-b']);
    });

    it('asks at once for a catalogue that comes after the pictures, as from a peer that sends in order', () => {
      localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: 'several-pictures' }, 'peer-a');
      tasks[0].onfinish?.(tasks[0], [arrived('on-its-way')]);

      receiveCatalogue(['on-its-way', 'still-lacking'], 'peer-a');

      expect(requestsSent()).toHaveLength(1);
      expect(wantedIn(requestsSent()[0])).toEqual(['still-lacking']);
    });

    it('forgets what a peer that left was to be asked for', () => {
      localDispatch('START_FILE_TRANSMISSION', { taskIdentifier: 'several-pictures' }, 'peer-a');
      receiveCatalogue(['still-lacking'], 'peer-a');

      localDispatch('DISCONNECT_PEER', { peerId: 'peer-a' });
      tasks[0].onfinish?.(tasks[0], null);

      expect(requestsSent()).toEqual([]);
    });
  });

  describe('holding its requests until the objects have first synced', () => {
    const sharingStatic = ImageSharingSystem as unknown as { _instance?: { cleanups: (() => void)[] } };
    const ORIGINAL_PEER_ID = Object.getOwnPropertyDescriptor(Network, 'peerId')!;
    const ORIGINAL_PEER_IDS = Object.getOwnPropertyDescriptor(Network, 'peerIds')!;

    let send: MockInstance<Network['send']>;
    let synchronize: MockInstance<ImageStorage['synchronize']>;

    const requestsSent = () =>
      send.mock.calls
        .map(([context, sendTo]) => ({ ...(context as { eventName: string; data: unknown }), sendTo }))
        .filter((context) => context.eventName === 'REQUEST_FILE_RESOURE');
    const wantedIn = (request: { data: unknown }) =>
      (request.data as { identifiers: CatalogItem[] }).identifiers.map((item) => item.identifier);
    const receiveCatalogue = (identifiers: string[], from = 'peer-a') =>
      localDispatch(
        'SYNCHRONIZE_FILE_LIST',
        identifiers.map((identifier) => ({ identifier, state: ImageState.COMPLETE })),
        from
      );

    beforeEach(() => {
      vi.useFakeTimers();
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      Object.defineProperty(Network, 'peerIds', { get: () => ['self-peer', 'peer-a', 'peer-b'], configurable: true });
      Object.defineProperty(Network, 'peerId', { get: () => 'self-peer', configurable: true });
      send = vi.spyOn(Network.instance, 'send').mockImplementation(() => {});
      synchronize = vi.spyOn(ImageStorage.instance, 'synchronize').mockImplementation(() => {});
      vi.spyOn(ImageStorage.instance, 'lazySynchronize').mockImplementation(() => {});
      ImageSharingSystem.instance.initialize();
      localDispatch('OPEN_NETWORK', { peerId: 'self-peer' });
      localDispatch('CONNECT_PEER', { peerId: 'peer-a' });
      synchronize.mockClear();
    });

    afterEach(() => {
      sharingStatic._instance?.cleanups.forEach((cleanup) => cleanup());
      sharingStatic._instance = undefined;
      for (const image of ImageStorage.instance.images) ImageStorage.instance.delete(image.identifier);
      Object.defineProperty(Network, 'peerId', ORIGINAL_PEER_ID);
      Object.defineProperty(Network, 'peerIds', ORIGINAL_PEER_IDS);
      vi.clearAllTimers();
      vi.useRealTimers();
    });

    it('asks for no picture a catalogue names until then, and makes a place for each meanwhile', () => {
      receiveCatalogue(['table-picture', 'piece-picture']);

      expect(requestsSent()).toEqual([]);
      expect(ImageStorage.instance.get('table-picture')).not.toBeNull();
      expect(ImageStorage.instance.get('piece-picture')).not.toBeNull();
    });

    it('asks each peer once they have, for every picture it named, those preferred first', () => {
      ImageSharingSystem.instance.preferredIdentifiers = () => ['table-picture'];
      receiveCatalogue(['piece-picture', 'table-picture'], 'peer-a');
      receiveCatalogue(['piece-picture'], 'peer-b');

      localDispatch(FIRST_SYNC_SETTLED, {});
      localDispatch(FIRST_SYNC_SETTLED, {});

      expect(requestsSent().map((request) => request.sendTo)).toEqual(['peer-a', 'peer-b']);
      expect(wantedIn(requestsSent()[0])).toEqual(['table-picture', 'piece-picture']);
      expect(wantedIn(requestsSent()[1])).toEqual(['piece-picture']);
      ImageSharingSystem.instance.preferredIdentifiers = () => [];
    });

    it('asks anyway twenty seconds after its first peer connected, though the objects have not synced', () => {
      receiveCatalogue(['overdue']);

      vi.advanceTimersByTime(FIRST_SYNC_HOLD_MAX_MS - 1);
      expect(requestsSent()).toEqual([]);
      vi.advanceTimersByTime(1);

      expect(requestsSent()).toHaveLength(1);
    });

    it('does not take a peer’s word that the objects have synced', () => {
      receiveCatalogue(['not-yet']);

      localDispatch(FIRST_SYNC_SETTLED, {}, 'peer-a');

      expect(requestsSent()).toEqual([]);
    });

    it('still sends its own catalogue at once to a peer that names fewer', () => {
      vi.spyOn(ImageStorage.instance, 'getCatalog').mockReturnValue([
        { identifier: 'held-here', state: ImageState.COMPLETE },
        { identifier: 'held-here-too', state: ImageState.COMPLETE },
      ]);

      receiveCatalogue([]);

      expect(synchronize).toHaveBeenCalledWith('peer-a');
    });

    it('still takes from the room’s asset store at once what a catalogue names', async () => {
      const store = AssetHttpStore.instance;
      store.configure('https://rooms.example');
      store.useAccess(() => ({ roomKey: '0123456789abcdef0123456789abcdef', token: 'asset-1' }));
      const download = vi.spyOn(store, 'download').mockResolvedValue('missing');
      try {
        receiveCatalogue(['c'.repeat(64)]);

        expect(download).toHaveBeenCalledWith('c'.repeat(64), { first: false });
        expect(requestsSent()).toEqual([]);
      } finally {
        await vi.advanceTimersByTimeAsync(0);
        (ImageSharingSystem.instance as unknown as { forgetMisses: () => void }).forgetMisses();
        store.configure(null);
        store.useAccess(null);
      }
    });

    it('holds nothing where a room server keeps the room', () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');

      receiveCatalogue(['from-a-seat']);

      expect(requestsSent()).toHaveLength(1);
    });
  });
});
