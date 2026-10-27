import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { JukeboxEngineService } from '@axe/application/media/jukebox-engine.service';
import { PersonalVolumeService } from '@axe/application/media/personal-volume.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopActionService } from '@axe/application/tabletop/tabletop-action.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { AudioFile } from '@axe/core/storage/audio-file';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DataElement } from '@axe/domain/data/data-element';
import { Jukebox } from '@axe/domain/media/jukebox';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
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

    it('starts as if none were kept where the browser refuses to be asked, rather than not starting', async () => {
      vi.spyOn(store, 'has').mockRejectedValue(new DOMException('refused', 'SecurityError'));

      await expect(service.prepare('')).resolves.toBeUndefined();

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
      await service.loadPending();
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

    it('lets a start room still being set out finish before it keeps the table', async () => {
      kept = new Blob(['older']);
      await service.prepare('');
      const archive = vi.spyOn(TestBed.inject(SaveDataService), 'createWholeRoomArchiveAsync');

      const keeping = service.keepCurrent();
      await Promise.resolve();
      await Promise.resolve();
      expect(archive).not.toHaveBeenCalled();

      await service.loadPending();
      await keeping;
      expect(archive).toHaveBeenCalledTimes(1);
    });

    it('stops keeping the room once a join begins while it is being kept', async () => {
      kept = new Blob(['older']);
      await service.prepare('');
      await service.loadPending();
      ask.mockImplementation(async () => {
        service.putAwayForJoin();
        return true;
      });

      expect(await service.keepCurrent()).toBe(false);

      expect(await kept?.text()).toBe('older');
      expect(shown).toHaveBeenCalledWith('部屋に入る途中は、開始時の部屋にできません。');
    });

    it('stops keeping the room where a join began and ended while it was being kept, with no start room out', async () => {
      kept = new Blob(['older']);
      ask.mockImplementation(async () => {
        service.putAwayForJoin()(false);
        return true;
      });

      expect(await service.keepCurrent()).toBe(false);

      expect(await kept?.text()).toBe('older');
    });

    it('keeps nothing while any join is under way, a start room out or not', async () => {
      service.putAwayForJoin();

      expect(await service.keepCurrent()).toBe(false);

      expect(kept).toBeNull();
    });

    it('asks before keeping where the browser cannot say whether a room is kept already', async () => {
      vi.spyOn(store, 'has').mockResolvedValue(null);

      await service.keepCurrent();

      expect(ask).toHaveBeenCalledTimes(1);
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
    let mediaHeld: boolean;

    beforeEach(() => {
      mediaHeld = true;
      sample = vi
        .spyOn(TestBed.inject(TabletopActionService), 'makeDefaultTabletopObjects')
        .mockImplementation(() => {});
      droppedPictures = vi.spyOn(ImageStorage.instance, 'delete').mockImplementation(() => {
        mediaHeld = false;
        return true;
      });
      droppedSounds = vi.spyOn(AudioStorage.instance, 'delete').mockReturnValue(true);
      const getPicture = ImageStorage.instance.get.bind(ImageStorage.instance);
      vi.spyOn(ImageStorage.instance, 'get').mockImplementation((identifier) =>
        identifier === 'brought-picture'
          ? mediaHeld
            ? ({ blob: new Blob(['picture'], { type: 'image/webp' }) } as ImageFile)
            : null
          : getPicture(identifier)
      );
      vi.spyOn(AudioStorage.instance, 'get').mockImplementation((identifier) =>
        identifier === 'brought-sound' && mediaHeld
          ? ({ name: 'theme.mp3', blob: new Blob(['sound'], { type: 'audio/mpeg' }) } as AudioFile)
          : null
      );
    });

    afterEach(() => {
      for (const identifier of ['brought-piece', 'seat-cursor']) ObjectStore.instance.get(identifier)?.destroy();
      ObjectStore.instance.clearDeleteHistory();
    });

    async function setOut(dataRead = true, alsoBring: () => void = () => undefined): Promise<void> {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockImplementation(async () => {
        DataElement.create('HP', 10, {}, 'brought-piece');
        alsoBring();
        return { dataRead, images: ['brought-picture'], audios: ['brought-sound'] };
      });
      await service.loadPending();
    }

    it('takes the table back to how the page set it out, drops what the start room brought, and sets out the sample', async () => {
      await setOut();

      service.putAwayForJoin();

      expect(ObjectStore.instance.get('brought-piece')).toBeNull();
      expect(droppedPictures).toHaveBeenCalledWith('brought-picture');
      expect(droppedSounds).toHaveBeenCalledWith('brought-sound');
      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('lets the start room go once the join comes to something, and puts nothing away again', async () => {
      await setOut();

      service.putAwayForJoin()(true);
      service.putAwayForJoin();

      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('sets the kept start room out again when the join comes to nothing, and says so', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      expect(ObjectStore.instance.get('brought-piece')).toBeNull();

      joined(false);
      expect(service.isSettling).toBe(true);
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(2);
      expect(ObjectStore.instance.get('brought-piece')).not.toBeNull();
      expect(shown).toHaveBeenCalledWith(
        '部屋に入れなかったので、開始時の部屋を読み込み直しました。保存していない変更は戻っていません。'
      );
      service.putAwayForJoin();
      expect(sample).toHaveBeenCalledTimes(2);
    });

    it('says so, and leaves the sample, where the kept start room cannot be set out again', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      load.mockResolvedValue({ dataRead: false, images: [], audios: [] });

      joined(false);
      await service.whenSettled();

      expect(shown).toHaveBeenCalledWith('開始時の部屋を読み込めなかったので、サンプルの部屋で始めました。');
    });

    it('says so where the kept start room is gone by the time the join comes to nothing', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      kept = null;

      joined(false);
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(1);
      expect(shown).toHaveBeenCalledWith('開始時の部屋を読み込めなかったので、サンプルの部屋で始めました。');
    });

    it('leaves a seat going into another room, not yet open, as it is', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('another-room');

      joined(false);
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(1);
    });

    function networkOpens(): void {
      (
        TestBed.inject(ObjectChangeService) as unknown as { _networkOpen$: { emit(event: { peerId: string }): void } }
      )._networkOpen$.emit({ peerId: 'next-peer' });
    }

    it('waits on a failed join that leaves the seat asked into its room, and sets the start room out again once the seat is back outside', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      const requested = vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('failed-room');
      const self = vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true, isOpen: false } as never);

      joined(false);
      await service.whenSettled();
      expect(load).toHaveBeenCalledTimes(1);

      requested.mockReturnValue('');
      self.mockReturnValue({ isRoom: false, isOpen: true } as never);
      networkOpens();
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(2);
      expect(shown).toHaveBeenCalledWith(
        '部屋に入れなかったので、開始時の部屋を読み込み直しました。保存していない変更は戻っていません。'
      );
    });

    it('lets the start room go where the network next opens into a room after a failed join', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('failed-room');
      const self = vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true, isOpen: false } as never);
      joined(false);

      self.mockReturnValue({ isRoom: true, isOpen: true } as never);
      networkOpens();
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(1);
      service.putAwayForJoin();
      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('sets the start room out again once the last of joins made one over another comes to nothing', async () => {
      await setOut();
      const first = service.putAwayForJoin();
      const second = service.putAwayForJoin();

      first(false);
      await service.whenSettled();
      expect(load).toHaveBeenCalledTimes(1);

      second(false);
      await service.whenSettled();
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("clears the start room's speaker the cursor last spoke as, and lets go of that speaker's picture", async () => {
      const cursorBefore = PeerCursor.myCursor;
      const cursor = new PeerCursor('seat-cursor');
      cursor.initialize();
      PeerCursor.myCursor = cursor;
      try {
        await setOut(true, () => {
          cursor.lastControlImageIdentifier = 'brought-picture';
          cursor.lastControlCharacterName = 'ゴブリン';
        });

        service.putAwayForJoin();

        expect(cursor.lastControlImageIdentifier).toBe('');
        expect(cursor.lastControlCharacterName).toBe('');
        expect(droppedPictures).toHaveBeenCalledWith('brought-picture');
      } finally {
        PeerCursor.myCursor = cursorBefore;
      }
    });

    it('keeps what came in of an unreadable start room where the seat made a room of its own meanwhile', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockImplementation(async () => {
        DataElement.create('HP', 10, {}, 'brought-piece');
        vi.spyOn(Network, 'requestedRoomId', 'get').mockReturnValue('own-room');
        return { dataRead: false, images: ['brought-picture'], audios: [] };
      });

      expect(await service.loadPending()).toBe(true);

      expect(ObjectStore.instance.get('brought-piece')).not.toBeNull();
      expect(shown).not.toHaveBeenCalled();
    });

    it('leaves a seat that went into a room meanwhile as it is, and lets the start room go', async () => {
      await setOut();
      const joined = service.putAwayForJoin();
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true, isOpen: true } as never);

      joined(false);
      await service.whenSettled();

      expect(load).toHaveBeenCalledTimes(1);
      service.putAwayForJoin();
      expect(sample).toHaveBeenCalledTimes(1);
    });

    it('keeps nothing as the start room while a join is under way, with the sample out in its place', async () => {
      await setOut();
      service.putAwayForJoin();

      expect(await service.keepCurrent()).toBe(false);

      expect(shown).toHaveBeenCalledWith('部屋に入る途中は、開始時の部屋にできません。');
    });

    it("leaves the pictures the seat's own things show", async () => {
      await setOut(true, () => {
        const cursor = new PeerCursor('seat-cursor');
        cursor.imageIdentifier = 'brought-picture';
        cursor.initialize();
      });

      service.putAwayForJoin();

      expect(droppedPictures).not.toHaveBeenCalled();
      expect(ObjectStore.instance.get('seat-cursor')).not.toBeNull();
    });

    it('stops the track playing before it puts the start room away', async () => {
      const stop = vi.fn();
      await setOut(true, () => {
        const jukebox = new Jukebox('Jukebox');
        jukebox.initialize();
        vi.spyOn(jukebox, 'isPlaying', 'get').mockReturnValue(true);
        jukebox.stop = stop;
      });

      service.putAwayForJoin();

      expect(stop).toHaveBeenCalledTimes(1);
    });

    it("puts the room's volumes as the page set them back on the players, and the mix on the jukebox", async () => {
      const jukebox = new Jukebox('Jukebox');
      jukebox.initialize();
      const volume = vi.spyOn(TestBed.inject(PersonalVolumeService), 'applyToChannels').mockImplementation(() => {});
      const mix = vi.spyOn(JukeboxEngineService.prototype, 'refreshMix').mockImplementation(() => {});
      try {
        await setOut();

        service.putAwayForJoin();

        expect(volume).toHaveBeenCalled();
        expect(mix).toHaveBeenCalled();
      } finally {
        ObjectStore.instance.delete(jukebox, false);
      }
    });

    it('puts nothing away once the seat has been in a room of its own making', async () => {
      await setOut();
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
      (
        TestBed.inject(ObjectChangeService) as unknown as { _networkOpen$: { emit(event: { peerId: string }): void } }
      )._networkOpen$.emit({ peerId: 'own-room-peer' });

      service.putAwayForJoin();

      expect(ObjectStore.instance.get('brought-piece')).not.toBeNull();
      expect(sample).not.toHaveBeenCalled();
    });

    it('puts nothing away for a start room set out into a room the seat had made meanwhile', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      load.mockImplementation(async () => {
        vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ isRoom: true } as never);
        return { dataRead: true, images: [], audios: [] };
      });
      await service.loadPending();

      service.putAwayForJoin();

      expect(sample).not.toHaveBeenCalled();
    });

    it('puts away what came in of a start room whose data could not be read, leaving the sample to the table', async () => {
      await setOut(false);

      expect(ObjectStore.instance.get('brought-piece')).toBeNull();
      expect(droppedPictures).toHaveBeenCalledWith('brought-picture');
      service.putAwayForJoin();
      expect(sample).not.toHaveBeenCalled();
    });

    it('lets a join wait while the start room is still being set out', async () => {
      kept = new Blob(['room']);
      await service.prepare('');

      expect(service.isSettling).toBe(true);
      await service.loadPending();
      expect(service.isSettling).toBe(false);
    });
  });
});
