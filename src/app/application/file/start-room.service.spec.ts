import { TestBed } from '@angular/core/testing';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { StartRoomService } from '@axe/application/file/start-room.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { Network } from '@axe/core/network/network';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import { StartRoomStore } from '@axe/core/storage/start-room-store';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StartRoomService', () => {
  const store = StartRoomStore.instance;
  let service: StartRoomService;
  let kept: Blob | null;
  let load: ReturnType<typeof vi.spyOn>;
  let ask: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    kept = null;
    vi.spyOn(store, 'isAvailable').mockReturnValue(true);
    vi.spyOn(store, 'get').mockImplementation(async () => kept);
    vi.spyOn(store, 'put').mockImplementation(async (_key, blob) => {
      kept = blob;
      return true;
    });
    vi.spyOn(store, 'remove').mockImplementation(async () => {
      kept = null;
    });
    load = vi.spyOn(TestBed.inject(FileArchiver), 'load').mockResolvedValue(undefined as never);
    ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => undefined as never);
    vi.spyOn(TestBed.inject(SaveDataService), 'createWholeRoomArchiveAsync').mockResolvedValue(new Blob(['room']));
    service = TestBed.inject(StartRoomService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    it('leaves a page opened on an invitation to the room it is going into', async () => {
      kept = new Blob(['room']);

      await service.prepare('#join?r=room-id&n=room-name');

      expect(service.hasPending).toBe(false);
      expect(service.isKept()).toBe(true);
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

    it('leaves a room the page has gone into as it is', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ roomName: '卓' } as never);

      expect(await service.loadPending()).toBe(true);

      expect(load).not.toHaveBeenCalled();
    });

    it('answers false where the room kept cannot be read, which leaves the table to the sample', async () => {
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

    it('keeps it on a no', async () => {
      kept = new Blob(['room']);
      await service.prepare('');
      ask.mockResolvedValue(false);

      expect(await service.forget()).toBe(false);

      expect(kept).not.toBeNull();
    });
  });
});
