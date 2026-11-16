import { TestBed } from '@angular/core/testing';
import { AssetRemovalService } from '@axe/application/file/asset-removal.service';
import { Network } from '@axe/core/network/network';
import { AssetHttpStore } from '@axe/core/storage/asset-http-store';
import { AudioSharingSystem } from '@axe/core/storage/audio-sharing-system';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageSharingSystem } from '@axe/core/storage/image-sharing-system';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { ModelSharingSystem } from '@axe/core/storage/model-sharing-system';
import { ModelStorage } from '@axe/core/storage/model-storage';
import { RoomAssetSyncService } from '@axe/features/lobby/room-asset-sync.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomAssetSyncService', () => {
  let assets: RoomAssetSyncService;

  function seat(role: 'gm' | 'pl' | 'guest' | null, isRoom = true): void {
    vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
    vi.spyOn(Network, 'serverRole', 'get').mockReturnValue(role);
    vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ peerId: 'p', userId: 'u', isRoom } as never);
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    assets = TestBed.inject(RoomAssetSyncService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('bringing what the seat holds into the room', () => {
    let upload: ReturnType<typeof vi.spyOn>[];
    let name: ReturnType<typeof vi.spyOn>[];
    let prefer: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      const stores = [TestBed.inject(ImageStorage), TestBed.inject(AudioStorage), TestBed.inject(ModelStorage)];
      upload = stores.map((store) => vi.spyOn(store, 'uploadAllToAssetStore').mockImplementation(() => {}));
      name = stores.map((store) => vi.spyOn(store, 'synchronize').mockImplementation(() => {}));
      prefer = vi.spyOn(TestBed.inject(AudioSharingSystem), 'preferWaiting').mockImplementation(() => {});
    });

    it('puts everything up for a GM or a PL, what the room is playing first', () => {
      seat('pl');

      assets.bringIntoRoom();

      for (const spy of upload) expect(spy).toHaveBeenCalledTimes(1);
      for (const spy of name) expect(spy).not.toHaveBeenCalled();
      expect(prefer).toHaveBeenCalledTimes(1);
    });

    it('names them to the others for a guest, who may put nothing up', () => {
      seat('guest');

      assets.bringIntoRoom();

      for (const spy of upload) expect(spy).not.toHaveBeenCalled();
      for (const spy of name) expect(spy).toHaveBeenCalledTimes(1);
    });

    it('does nothing outside a room, or where the server gave no role', () => {
      seat('gm', false);
      assets.bringIntoRoom();
      seat(null);
      assets.bringIntoRoom();

      for (const spy of [...upload, ...name]) expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('fetching what the room holds', () => {
    const picture = { id: 'a'.repeat(64), type: 'image/png', size: 1, name: 'map.png' };
    const sound = { id: 'b'.repeat(64), type: 'audio/ogg', size: 1, name: 'theme.ogg' };
    const model = { id: 'c'.repeat(64), type: 'model/gltf-binary', size: 1, name: 'tree.glb' };

    it('starts from a clean slate of misses and hands each kind its own of the list', async () => {
      seat('guest');
      vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([picture, sound, model]);
      const forgot = vi.spyOn(TestBed.inject(ImageSharingSystem), 'forgetMisses');
      const pictures = vi.spyOn(TestBed.inject(ImageSharingSystem), 'fetchListed').mockImplementation(() => {});
      const sounds = vi.spyOn(TestBed.inject(AudioSharingSystem), 'fetchListed').mockImplementation(() => {});
      const models = vi.spyOn(TestBed.inject(ModelSharingSystem), 'fetchListed').mockImplementation(() => {});
      const takeOut = vi.spyOn(TestBed.inject(AssetRemovalService), 'takeOut').mockImplementation(() => {});

      assets.fetchRoomAssets();

      await vi.waitFor(() => expect(pictures).toHaveBeenCalledWith([picture]));
      expect(sounds).toHaveBeenCalledWith([sound]);
      expect(models).toHaveBeenCalledWith([model]);
      expect(forgot).toHaveBeenCalledTimes(1);
      expect(takeOut).toHaveBeenCalledWith([picture.id, sound.id, model.id]);
    });

    it('asks nothing outside a room', () => {
      seat('pl', false);
      const list = vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([]);

      assets.fetchRoomAssets();
      assets.catchUpAfterResume();
      assets.relistAfterLeave();

      expect(list).not.toHaveBeenCalled();
    });

    it('drops a list that arrives once the seat has moved on', async () => {
      seat('pl');
      let answer: (list: (typeof picture)[]) => void = () => {};
      vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockReturnValue(
        new Promise((resolve) => (answer = resolve))
      );
      const pictures = vi.spyOn(TestBed.inject(ImageSharingSystem), 'fetchListed').mockImplementation(() => {});

      assets.fetchRoomAssets();
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('another');
      answer([picture]);
      await Promise.resolve();
      await Promise.resolve();

      expect(pictures).not.toHaveBeenCalled();
    });
  });

  describe('coming back on a link the server asked for', () => {
    it('puts up only what was missed and reads the list again, forgetting no miss', async () => {
      seat('gm');
      const all = vi.spyOn(TestBed.inject(ImageStorage), 'uploadAllToAssetStore').mockImplementation(() => {});
      const missed = vi.spyOn(TestBed.inject(ImageStorage), 'uploadMissedToAssetStore').mockImplementation(() => {});
      vi.spyOn(TestBed.inject(AudioStorage), 'uploadMissedToAssetStore').mockImplementation(() => {});
      vi.spyOn(TestBed.inject(ModelStorage), 'uploadMissedToAssetStore').mockImplementation(() => {});
      const list = vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([]);
      const forgot = vi.spyOn(TestBed.inject(ImageSharingSystem), 'forgetMisses');

      assets.catchUpAfterResume();

      expect(missed).toHaveBeenCalledTimes(1);
      expect(all).not.toHaveBeenCalled();
      expect(list).toHaveBeenCalledTimes(1);
      expect(forgot).not.toHaveBeenCalled();
      await Promise.resolve();
    });

    it('puts nothing up for a guest, and still reads the list', () => {
      seat('guest');
      const missed = vi.spyOn(TestBed.inject(ImageStorage), 'uploadMissedToAssetStore').mockImplementation(() => {});
      const list = vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([]);

      assets.catchUpAfterResume();

      expect(missed).not.toHaveBeenCalled();
      expect(list).toHaveBeenCalledTimes(1);
    });
  });

  describe('somebody leaving', () => {
    it('reads the list again half a minute later, once however many leave meanwhile', () => {
      vi.useFakeTimers();
      seat('pl');
      const list = vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([]);

      assets.relistAfterLeave();
      assets.relistAfterLeave();
      vi.advanceTimersByTime(29_999);
      expect(list).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(list).toHaveBeenCalledTimes(1);

      assets.relistAfterLeave();
      vi.advanceTimersByTime(30_000);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it('reads nothing where the seat has left the room by then, or the service has gone', () => {
      vi.useFakeTimers();
      seat('pl');
      const list = vi.spyOn(TestBed.inject(AssetHttpStore), 'listRoomAssets').mockResolvedValue([]);

      assets.relistAfterLeave();
      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('another');
      vi.advanceTimersByTime(30_000);
      expect(list).not.toHaveBeenCalled();

      vi.spyOn(Network, 'peerId', 'get').mockReturnValue('p');
      assets.relistAfterLeave();
      TestBed.resetTestingModule();
      vi.advanceTimersByTime(30_000);
      expect(list).not.toHaveBeenCalled();
    });
  });

  it('sends up what waited once uploads are let through again', () => {
    const resumed = [TestBed.inject(ImageStorage), TestBed.inject(AudioStorage), TestBed.inject(ModelStorage)].map(
      (store) => vi.spyOn(store, 'resumePaused').mockImplementation(() => {})
    );

    assets.resumePaused();

    for (const spy of resumed) expect(spy).toHaveBeenCalledTimes(1);
  });

  it('hands the stores their turn to put up what a guest named, and takes it back as it goes', () => {
    vi.spyOn(Network, 'peerId', 'get').mockReturnValue('peer-c');
    expect(TestBed.inject(ImageStorage).receivedUploadTurn()).toBe(0);
    const before = TestBed.inject(ImageStorage).receivedUploadTurn;

    TestBed.resetTestingModule();

    expect(ImageStorage.instance.receivedUploadTurn).not.toBe(before);
    expect(ImageStorage.instance.receivedUploadTurn()).toBe(0);
  });
});
