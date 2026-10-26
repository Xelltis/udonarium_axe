import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StartRoomService', () => {
  const store = StartRoomStore.instance;
  let service: StartRoomService;
  let kept: Blob | null;
  let load: ReturnType<typeof vi.spyOn>;
  let ask: ReturnType<typeof vi.spyOn>;
  let shown: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    kept = null;
    vi.spyOn(store, 'isAvailable').mockReturnValue(true);
    vi.spyOn(store, 'get').mockImplementation(async () => kept);
    vi.spyOn(store, 'has').mockImplementation(async () => kept !== null);
    vi.spyOn(store, 'put').mockImplementation(async (_key, blob) => {
      kept = blob;
      return true;
    });
    vi.spyOn(store, 'remove').mockImplementation(async () => {
      kept = null;
      return true;
    });
    load = vi.spyOn(TestBed.inject(FileArchiver), 'load').mockResolvedValue({ dataRead: true, images: [], audios: [] });
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => undefined as never);
    vi.spyOn(TestBed.inject(SaveDataService), 'createWholeRoomArchiveAsync').mockResolvedValue(new Blob(['room']));
    service = TestBed.inject(StartRoomService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setNetworkIsolated(false);
  });

  describe('at launch', () => {
    it('reads the room kept to start on, ready to be set out in place of the sample', async () => {
      kept = new Blob(['room']);

      await service.prepare('');

      expect(service.hasPending).toBe(true);
      expect(service.isKept()).toBe(true);
    });

    it('starts on the sample as before where no room is kept', async () => {
      await service.prepare('');

      expect(service.hasPending).toBe(false);
      expect(service.isKept()).toBe(false);
    });

    it('leaves a page opened with anything after its #, an invitation or the way back from a login, to where it is going', async () => {
      kept = new Blob(['room']);

      await service.prepare('#join?r=room-id&n=room-name');
      expect(service.hasPending).toBe(false);
      await service.prepare('#code=abc&state=xyz');
      expect(service.hasPending).toBe(false);

      expect(service.isKept()).toBe(true);
      expect(store.get).not.toHaveBeenCalled();
    });

    it('starts on the sample where the browser is slow to answer, and learns it keeps a room once it does', async () => {
      vi.useFakeTimers();
      let answer!: (kept: boolean) => void;
      vi.spyOn(store, 'has').mockReturnValue(new Promise((resolve) => (answer = resolve)));

      const preparing = service.prepare('');
      await vi.advanceTimersByTimeAsync(2000);
      await preparing;
      expect(service.hasPending).toBe(false);
      expect(service.isKept()).toBe(false);

      answer(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(service.isKept()).toBe(true);
      expect(service.hasPending).toBe(false);
    });

    it('starts as if none were kept where the browser has nowhere to keep one', async () => {
      kept = new Blob(['room']);
      vi.spyOn(store, 'isAvailable').mockReturnValue(false);

      await service.prepare('');

      expect(service.hasPending).toBe(false);
    });

    it('sets out the room it read as a room file dropped on the table would be, once', async () => {
      kept = new Blob(['room']);
      await service.prepare('');

      expect(await service.loadPending()).toBe(true);

      expect(load).toHaveBeenCalledTimes(1);
      const [files] = load.mock.calls[0] as [File[]];
      expect(files[0].type).toBe('application/zip');
      expect(service.hasPending).toBe(false);
    });

    it('leaves a table already shared with others as it is', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([{}] as never);

      expect(await service.loadPending()).toBe(true);

      expect(load).not.toHaveBeenCalled();
    });

    it('stops setting it out once others share the table, and leaves it without the sample', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      const others = vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([]);
      load.mockImplementation(async (_files: unknown, _drop: unknown, options: { stillWanted: () => boolean }) => {
        expect(options.stillWanted()).toBe(true);
        others.mockReturnValue([{}] as never);
        expect(options.stillWanted()).toBe(false);
        return { dataRead: false, images: [], audios: [] };
      });

      expect(await service.loadPending()).toBe(true);

      expect(shown).not.toHaveBeenCalled();
    });

    it("goes on setting it out into a room of this seat's own that nobody else is in yet", async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '卓' } as never);
      vi.spyOn(Network, 'peerContexts', 'get').mockReturnValue([]);

      expect(await service.loadPending()).toBe(true);

      expect(load).toHaveBeenCalledTimes(1);
    });

    it('holds back whatever waits to load a room until the start room is set out', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      let settled = false;
      void service.whenSettled().then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);

      await service.loadPending();
      await Promise.resolve();

      expect(settled).toBe(true);
    });

    it('holds nothing back where no start room is being set out', async () => {
      await service.prepare('');

      await expect(service.whenSettled()).resolves.toBeUndefined();
    });

    it('says so and answers false where the data of the room kept cannot be read, which leaves the table to the sample', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockResolvedValue({ dataRead: false, images: [], audios: [] });

      expect(await service.loadPending()).toBe(false);

      expect(shown).toHaveBeenCalledWith('開始時の部屋を読み込めなかったので、サンプルの部屋で始めました。');
    });

    it('answers false where reading it throws', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockRejectedValue(new Error('broken zip'));

      expect(await service.loadPending()).toBe(false);
    });
  });

  describe('keeping the room as it stands', () => {
    it('keeps it, pictures and all, without asking while none is kept', async () => {
      expect(await service.keepCurrent()).toBe(true);

      expect(ask).not.toHaveBeenCalled();
      expect(await kept?.text()).toBe('room');
      expect(service.isKept()).toBe(true);
    });

    it('asks before it replaces one kept already, and leaves it be on a no', async () => {
      kept = new Blob(['older']);
      await service.prepare('');
      ask.mockResolvedValue(false);

      expect(await service.keepCurrent()).toBe(false);

      expect(ask).toHaveBeenCalledTimes(1);
      expect(await kept?.text()).toBe('older');
    });

    it('asks before it replaces one another tab kept meanwhile', async () => {
      await service.prepare('');
      kept = new Blob(['kept in another tab']);
      ask.mockResolvedValue(false);

      expect(await service.keepCurrent()).toBe(false);

      expect(ask).toHaveBeenCalledTimes(1);
      expect(service.isKept()).toBe(true);
    });

    it('keeps no table holding what a room server withheld, which would ask about it at every start', async () => {
      vi.spyOn(TestBed.inject(SaveDataService), 'isRoomWithheld').mockReturnValue(true);

      expect(await service.keepCurrent()).toBe(false);

      expect(kept).toBeNull();
      expect(shown).toHaveBeenCalledWith(
        '部屋のサーバーで伏せた形のまま受け取った物がある卓は、開始時の部屋にできません。'
      );
    });

    it('keeps nothing while a replay board stands in place of the table', async () => {
      setNetworkIsolated(true);

      expect(await service.keepCurrent()).toBe(false);

      expect(kept).toBeNull();
    });
  });

  describe('starting on the sample again', () => {
    it('forgets the room kept once asked', async () => {
      kept = new Blob(['room']);
      await service.prepare('');

      expect(await service.forget()).toBe(true);

      expect(kept).toBeNull();
      expect(service.isKept()).toBe(false);
    });

    it('says so, and still counts it kept, where the browser will not delete it', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      vi.spyOn(store, 'remove').mockResolvedValue(false);

      expect(await service.forget()).toBe(false);

      expect(service.isKept()).toBe(true);
      expect(shown).toHaveBeenCalledWith('開始時の部屋を消せませんでした。');
    });

    it('keeps it on a no', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      ask.mockResolvedValue(false);

      expect(await service.forget()).toBe(false);

      expect(kept).not.toBeNull();
    });
  });

  describe("putting the start room away before going into somebody else's room", () => {
    let sample: ReturnType<typeof vi.spyOn>;
    let droppedPictures: ReturnType<typeof vi.spyOn>;
    let droppedSounds: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      sample = vi
        .spyOn(TestBed.inject(TabletopActionService), 'makeDefaultTabletopObjects')
        .mockImplementation(() => {});
      droppedPictures = vi.spyOn(ImageStorage.instance, 'delete').mockReturnValue(true);
      droppedSounds = vi.spyOn(AudioStorage.instance, 'delete').mockReturnValue(true);
    });

    afterEach(() => {
      ObjectStore.instance.get('brought-piece')?.destroy();
      ObjectStore.instance.clearDeleteHistory();
    });

    async function setOut(dataRead = true): Promise<void> {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockImplementation(async () => {
        DataElement.create('HP', 10, {}, 'brought-piece');
        return { dataRead, images: ['brought-picture'], audios: ['brought-sound'] };
      });
      await service.loadPending();
    }

    it('takes the table back to how the page set it out, drops what the start room brought, and sets out the sample', async () => {
      await setOut();

      service.putAway();

      expect(ObjectStore.instance.get('brought-piece')).toBeNull();
      expect(droppedPictures).toHaveBeenCalledWith('brought-picture');
      expect(droppedSounds).toHaveBeenCalledWith('brought-sound');
      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('puts it away once only', async () => {
      await setOut();

      service.putAway();
      service.putAway();

      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('puts nothing away once the seat has been in a room of its own making', async () => {
      await setOut();
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
      (
        TestBed.inject(ObjectChangeService) as unknown as { _networkOpen$: { emit(event: { peerId: string }): void } }
      )._networkOpen$.emit({ peerId: 'own-room-peer' });

      service.putAway();

      expect(ObjectStore.instance.get('brought-piece')).not.toBeNull();
      expect(sample).not.toHaveBeenCalled();
    });

    it('puts nothing away where the start room could not be read, as the sample is out already', async () => {
      await setOut(false);

      service.putAway();

      expect(sample).not.toHaveBeenCalled();
      expect(droppedPictures).not.toHaveBeenCalled();
    });

    it('lets a join wait while the start room is still being set out', async () => {
      kept = new Blob(['room']);
      await service.prepare('');

      expect(service.settling()).not.toBeNull();
      await service.loadPending();
      expect(service.settling()).toBeNull();
    });
  });
});
