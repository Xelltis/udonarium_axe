import { TestBed } from '@angular/core/testing';
import { RoomSnapshotService } from '@axe/application/file/room-snapshot.service';
import { SaveDataService } from '@axe/application/file/save-data.service';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { FileArchiver } from '@axe/core/storage/file-archiver';
import {
  RoomSnapshotInput,
  RoomSnapshotMeta,
  RoomSnapshotRecord,
  RoomSnapshotStore,
  sortSnapshotsByNewest,
} from '@axe/core/storage/room-snapshot-store';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

class FakeRoomSnapshotStore extends RoomSnapshotStore {
  available = true;
  records: RoomSnapshotRecord[] = [];
  private nextId = 1;

  isAvailable(): boolean {
    return this.available;
  }

  async put(input: RoomSnapshotInput): Promise<number> {
    const id = this.nextId++;
    this.records.push({
      id,
      roomName: input.roomName,
      savedAt: input.savedAt,
      byteSize: input.blob.size,
      blob: input.blob,
    });
    return id;
  }

  async list(): Promise<RoomSnapshotMeta[]> {
    return sortSnapshotsByNewest(
      this.records.map((record) => ({
        id: record.id,
        roomName: record.roomName,
        savedAt: record.savedAt,
        byteSize: record.byteSize,
      }))
    );
  }

  async get(id: number): Promise<RoomSnapshotRecord | null> {
    return this.records.find((record) => record.id === id) ?? null;
  }

  async remove(id: number): Promise<void> {
    this.records = this.records.filter((record) => record.id !== id);
  }

  async clear(): Promise<void> {
    this.records = [];
  }
}

describe('RoomSnapshotService', () => {
  let store: FakeRoomSnapshotStore;
  let load: ReturnType<typeof vi.fn>;
  let service: RoomSnapshotService;

  beforeEach(() => {
    store = new FakeRoomSnapshotStore();
    load = vi.fn().mockResolvedValue(undefined);

    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        { provide: RoomSnapshotStore, useValue: store },
        { provide: SaveDataService, useValue: { createRoomArchiveAsync: () => Promise.resolve(new Blob(['abc'])) } },
        { provide: FileArchiver, useValue: { load } },
        RoomSnapshotService,
      ],
    });
    service = TestBed.inject(RoomSnapshotService);
  });

  it('lists a snapshot once it is saved', async () => {
    const meta = await service.capture();

    expect(meta).not.toBeNull();
    expect(service.snapshots()).toHaveLength(1);
    expect(service.latest?.byteSize).toBe(3);
  });

  it('takes nothing while a replay’s board is on the table, cut off from the room, however it is asked for', async () => {
    setNetworkIsolated(true);
    try {
      expect(await service.capture()).toBeNull();
      expect(await service.capture({ background: true })).toBeNull();
    } finally {
      setNetworkIsolated(false);
    }

    expect(store.records).toHaveLength(0);
  });

  it('tells the save whether it is taken in the background, which asks for no reload', async () => {
    const build = vi.spyOn(TestBed.inject(SaveDataService), 'createRoomArchiveAsync');

    await service.capture({ background: true });
    await service.capture();

    expect(build.mock.calls).toEqual([[{ background: true }], [{}]]);
  });

  it('lets whoever asks wait for the snapshot being taken, and answers at once when none is', async () => {
    let finish!: (blob: Blob) => void;
    vi.spyOn(TestBed.inject(SaveDataService), 'createRoomArchiveAsync').mockReturnValue(
      new Promise<Blob>((resolve) => (finish = resolve))
    );
    await service.whenCaptured();
    const taking = service.capture();
    let waited = false;
    void service.whenCaptured().then(() => (waited = true));
    await Promise.resolve();
    expect(waited).toBe(false);

    finish(new Blob(['abc']));
    await taking;
    await Promise.resolve();

    expect(waited).toBe(true);
  });

  it('drops the oldest snapshots past the limit', async () => {
    for (let i = 0; i < 7; i++) {
      await service.capture();
    }

    expect(service.snapshots()).toHaveLength(5);
    expect(store.records).toHaveLength(5);
  });

  it('restores by handing the saved archive to the file archiver', async () => {
    const meta = await service.capture();

    await expect(service.restore(meta!.id)).resolves.toBe(true);
    expect(load).toHaveBeenCalledOnce();
    const files = load.mock.calls[0][0] as File[];
    expect(files[0].name).toBe('room-snapshot.zip');
  });

  it('restores nothing while a replay’s board is shown in place of the table, and says so', async () => {
    const meta = await service.capture();
    const shown = vi.spyOn(TestBed.inject(SnackbarService), 'show').mockImplementation(() => {});
    setNetworkIsolated(true);
    try {
      await expect(service.restore(meta!.id)).resolves.toBe(false);

      expect(load).not.toHaveBeenCalled();
      expect(shown).toHaveBeenCalledTimes(1);
    } finally {
      setNetworkIsolated(false);
    }
  });

  it('reports failure restoring an id that is not there', async () => {
    await expect(service.restore(999)).resolves.toBe(false);
    expect(load).not.toHaveBeenCalled();
  });

  it('reflects a delete and a clear in the list', async () => {
    const first = await service.capture();
    await service.capture();

    await service.remove(first!.id);
    expect(service.snapshots()).toHaveLength(1);

    await service.clear();
    expect(service.snapshots()).toHaveLength(0);
  });

  it('neither saves nor restores where there is no storage', async () => {
    store.available = false;

    await expect(service.capture()).resolves.toBeNull();
    await expect(service.restore(1)).resolves.toBe(false);
    expect(store.records).toHaveLength(0);
  });
});
