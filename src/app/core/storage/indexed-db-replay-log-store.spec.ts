import { Logger } from '@axe/core/logging/logger';
import { IndexedDbReplayLogStore } from '@axe/core/storage/indexed-db-replay-log-store';

type Row = Record<string, unknown> & { id?: number };

interface FakeRequest<T> {
  result: T | undefined;
  error: unknown;
  onsuccess: (() => void) | null;
  onerror: (() => void) | null;
}

/** A table of rows under an auto-incremented `id`, with the indexes made on it. */
class FakeTable {
  readonly rows = new Map<number, Row>();
  readonly indexes = new Set<string>();
  nextId = 1;
  /** Throws from the next write, as a store out of room would. */
  refuseWrites = false;

  createIndex(name: string): void {
    this.indexes.add(name);
  }
}

/** A transaction that answers each request in a microtask and completes once none is left. */
class FakeTransaction {
  error: unknown = null;
  oncomplete: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private pending = 0;
  private settled = false;

  constructor(
    private readonly tables: Map<string, FakeTable>,
    private readonly names: readonly string[]
  ) {
    for (const name of names) if (!tables.has(name)) throw new DOMException(`no store ${name}`, 'NotFoundError');
  }

  objectStore(name: string): FakeObjectStore {
    if (!this.names.includes(name)) throw new DOMException(`${name} is not in the transaction`, 'NotFoundError');
    return new FakeObjectStore(this, this.tables.get(name)!);
  }

  request<T>(work: () => T): FakeRequest<T> {
    const request: FakeRequest<T> = { result: undefined, error: null, onsuccess: null, onerror: null };
    this.pending++;
    queueMicrotask(() => {
      try {
        request.result = work();
        request.onsuccess?.();
      } catch (reason) {
        request.error = reason;
        this.error = reason;
        request.onerror?.();
      }
      this.pending--;
      queueMicrotask(() => this.finish());
    });
    return request;
  }

  private finish(): void {
    if (this.settled || this.pending > 0) return;
    this.settled = true;
    if (this.error) this.onabort?.();
    else this.oncomplete?.();
  }
}

class FakeIndex {
  constructor(
    private readonly transaction: FakeTransaction,
    private readonly table: FakeTable,
    private readonly field: string
  ) {}

  getAll(key: unknown): FakeRequest<Row[]> {
    return this.transaction.request(() => [...this.table.rows.values()].filter((row) => row[this.field] === key));
  }

  getAllKeys(key: unknown): FakeRequest<number[]> {
    return this.transaction.request(() =>
      [...this.table.rows.values()].filter((row) => row[this.field] === key).map((row) => row.id as number)
    );
  }
}

/** The rows of one table as the transaction's requests see them, with an index that lacks getAllKeys when asked. */
class FakeObjectStore {
  /** Whether the index hands out keys alone, as some implementations cannot. */
  static keysAlone = true;

  constructor(
    private readonly transaction: FakeTransaction,
    private readonly table: FakeTable
  ) {}

  add(row: Row): FakeRequest<number> {
    return this.transaction.request(() => {
      if (this.table.refuseWrites) throw new DOMException('full', 'QuotaExceededError');
      const id = row.id ?? this.table.nextId++;
      this.table.rows.set(id, { ...row, id });
      return id;
    });
  }

  put(row: Row): FakeRequest<number> {
    return this.transaction.request(() => {
      this.table.rows.set(row.id as number, { ...row });
      return row.id as number;
    });
  }

  get(id: number): FakeRequest<Row | undefined> {
    return this.transaction.request(() => this.table.rows.get(id));
  }

  getAll(): FakeRequest<Row[]> {
    return this.transaction.request(() => [...this.table.rows.values()]);
  }

  delete(id: number): FakeRequest<undefined> {
    return this.transaction.request(() => {
      this.table.rows.delete(id);
      return undefined;
    });
  }

  count(): FakeRequest<number> {
    return this.transaction.request(() => this.table.rows.size);
  }

  clear(): FakeRequest<undefined> {
    return this.transaction.request(() => {
      this.table.rows.clear();
      return undefined;
    });
  }

  index(name: string): FakeIndex | Omit<FakeIndex, 'getAllKeys'> {
    if (!this.table.indexes.has(name)) throw new DOMException(`no index ${name}`, 'NotFoundError');
    const index = new FakeIndex(this.transaction, this.table, name);
    if (FakeObjectStore.keysAlone) return index;
    return { getAll: (key: unknown) => index.getAll(key) };
  }
}

/** An in-memory database that keeps its tables across opens, as the browser's does across handles. */
class FakeDatabase {
  readonly tables = new Map<string, FakeTable>();
  onversionchange: (() => void) | null = null;
  closed = 0;

  readonly objectStoreNames = { contains: (name: string) => this.tables.has(name) };

  createObjectStore(name: string, options: { keyPath: string; autoIncrement: boolean }): FakeTable {
    expect(options).toEqual({ keyPath: 'id', autoIncrement: true });
    const table = new FakeTable();
    this.tables.set(name, table);
    return table;
  }

  transaction(names: string[]): FakeTransaction {
    return new FakeTransaction(this.tables, names);
  }

  close(): void {
    this.closed++;
  }
}

/** What stands in for the browser's indexedDB: one database, opened as often as asked. */
function fakeIndexedDb(database: FakeDatabase, refuse = false) {
  let upgraded = false;
  return {
    opens: 0,
    open(): FakeRequest<FakeDatabase> & { onupgradeneeded: (() => void) | null } {
      this.opens++;
      const request = {
        result: undefined,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      } as FakeRequest<FakeDatabase> & {
        onupgradeneeded: (() => void) | null;
      };
      queueMicrotask(() => {
        if (refuse) {
          request.error = new DOMException('refused', 'UnknownError');
          request.onerror?.();
          return;
        }
        request.result = database;
        if (!upgraded) {
          upgraded = true;
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
}

describe('IndexedDbReplayLogStore', () => {
  let database: FakeDatabase;
  let indexedDb: ReturnType<typeof fakeIndexedDb>;
  let store: IndexedDbReplayLogStore;

  beforeEach(() => {
    database = new FakeDatabase();
    indexedDb = fakeIndexedDb(database);
    vi.stubGlobal('indexedDB', indexedDb);
    vi.spyOn(Logger, 'warn').mockImplementation(() => {});
    FakeObjectStore.keysAlone = true;
    store = new IndexedDbReplayLogStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const chunk = (recordingId: number, index: number, bytes: number[]) => ({
    recordingId,
    index,
    seqStart: index * 10,
    seqEnd: index * 10 + 9,
    eventCount: 10,
    bytes: new Uint8Array(bytes),
  });

  const keyframe = (recordingId: number, seq: number, size: number) => ({
    recordingId,
    seq,
    at: seq * 100,
    blob: new Blob([new Uint8Array(size)]),
  });

  it('is available where the browser has IndexedDB, and not without', () => {
    expect(store.isAvailable()).toBe(true);

    vi.stubGlobal('indexedDB', undefined);

    expect(store.isAvailable()).toBe(false);
  });

  it('makes its three stores, the chunks and keyframes indexed by recording, on the first open', async () => {
    await store.listRecordings();

    expect([...database.tables.keys()]).toEqual(['recordings', 'chunks', 'keyframes']);
    expect([...database.tables.get('chunks')!.indexes]).toEqual(['recordingId']);
    expect([...database.tables.get('keyframes')!.indexes]).toEqual(['recordingId']);
    expect([...database.tables.get('recordings')!.indexes]).toEqual([]);
  });

  it('keeps a recording with its chunks and keyframes, counting their events and bytes into it', async () => {
    const id = await store.createRecording({ roomName: '部屋', startedAt: 1000 });
    expect(id).toBe(1);

    expect(await store.appendChunk(chunk(1, 1, [4, 5, 6]))).toBe(true);
    expect(await store.appendChunk(chunk(1, 0, [1, 2]))).toBe(true);
    expect(await store.putKeyframe(keyframe(1, 20, 100))).toBe(true);
    expect(await store.putKeyframe(keyframe(1, 10, 50))).toBe(true);

    expect(await store.getRecording(1)).toEqual({
      id: 1,
      roomName: '部屋',
      startedAt: 1000,
      endedAt: null,
      eventCount: 20,
      byteSize: 155,
    });
    expect((await store.listChunks(1)).map((row) => [row.index, row.id])).toEqual([
      [0, 2],
      [1, 1],
    ]);
    expect((await store.listKeyframes(1)).map((row) => [row.seq, row.byteSize])).toEqual([
      [10, 50],
      [20, 100],
    ]);
  });

  it('changes what an update gives of a recording and keeps the rest, and ignores an id it does not have', async () => {
    await store.createRecording({ roomName: '部屋', startedAt: 1000 });
    expect(await store.getManifest(1)).toBeNull();

    await store.updateRecording(1, { endedAt: 5000, manifest: new Uint8Array([7, 8]) });
    await store.updateRecording(1, { roomName: '別の部屋' });
    await store.updateRecording(9, { roomName: 'nowhere' });

    expect(await store.getRecording(1)).toMatchObject({ roomName: '別の部屋', startedAt: 1000, endedAt: 5000 });
    expect(await store.getManifest(1)).toEqual(new Uint8Array([7, 8]));
    expect(await store.getRecording(9)).toBeNull();
    expect(await store.getManifest(9)).toBeNull();
  });

  it('lists the recordings newest first, without their manifests', async () => {
    await store.createRecording({ roomName: 'first', startedAt: 1000 });
    await store.createRecording({ roomName: 'second', startedAt: 3000 });
    await store.createRecording({ roomName: 'third', startedAt: 2000 });
    await store.updateRecording(1, { manifest: new Uint8Array([1]) });

    const listed = await store.listRecordings();

    expect(listed.map((meta) => meta.roomName)).toEqual(['second', 'third', 'first']);
    expect(listed[2]).not.toHaveProperty('manifest');
  });

  it.each([
    ['keys alone', true],
    ['the rows, where keys alone cannot be fetched', false],
  ])(
    'removes a recording with its chunks and keyframes, reading %s, and leaves the others',
    async (_case, keysAlone) => {
      FakeObjectStore.keysAlone = keysAlone;
      await store.createRecording({ roomName: 'gone', startedAt: 1000 });
      await store.createRecording({ roomName: 'kept', startedAt: 2000 });
      await store.appendChunk(chunk(1, 0, [1]));
      await store.appendChunk(chunk(2, 0, [2]));
      await store.putKeyframe(keyframe(1, 0, 10));
      await store.putKeyframe(keyframe(2, 0, 10));

      await store.removeRecording(1);

      expect((await store.listRecordings()).map((meta) => meta.id)).toEqual([2]);
      expect(await store.listChunks(1)).toEqual([]);
      expect((await store.listChunks(2)).map((row) => row.recordingId)).toEqual([2]);
      expect(await store.listKeyframes(1)).toEqual([]);
      expect((await store.listKeyframes(2)).map((row) => row.recordingId)).toEqual([2]);
    }
  );

  it('clears every recording, chunk and keyframe', async () => {
    await store.createRecording({ roomName: '部屋', startedAt: 1000 });
    await store.appendChunk(chunk(1, 0, [1]));
    await store.putKeyframe(keyframe(1, 0, 10));

    await store.clear();

    expect(await store.listRecordings()).toEqual([]);
    expect(await store.listChunks(1)).toEqual([]);
    expect(await store.listKeyframes(1)).toEqual([]);
  });

  it('reads nothing and writes nothing where the database cannot be opened', async () => {
    vi.stubGlobal('indexedDB', fakeIndexedDb(database, true));

    expect(await store.createRecording({ roomName: '部屋', startedAt: 1000 })).toBeNull();
    expect(await store.appendChunk(chunk(1, 0, [1]))).toBe(false);
    expect(await store.putKeyframe(keyframe(1, 0, 10))).toBe(false);
    expect(await store.listRecordings()).toEqual([]);
    expect(await store.getRecording(1)).toBeNull();
    expect(await store.listChunks(1)).toEqual([]);
    expect(await store.listKeyframes(1)).toEqual([]);
    expect(Logger.warn).toHaveBeenCalled();
  });

  it('says a write failed when the store refuses it, keeping no chunk', async () => {
    await store.createRecording({ roomName: '部屋', startedAt: 1000 });
    database.tables.get('chunks')!.refuseWrites = true;

    expect(await store.appendChunk(chunk(1, 0, [1, 2, 3]))).toBe(false);

    expect(await store.listChunks(1)).toEqual([]);
    expect(Logger.warn).toHaveBeenCalled();
  });

  it('opens the database once, and again after another tab asks it to let go', async () => {
    await store.createRecording({ roomName: '部屋', startedAt: 1000 });
    await store.listRecordings();
    expect(indexedDb.opens).toBe(1);

    database.onversionchange?.();
    expect(database.closed).toBe(1);

    expect((await store.listRecordings()).map((meta) => meta.roomName)).toEqual(['部屋']);
    expect(indexedDb.opens).toBe(2);
  });
});
