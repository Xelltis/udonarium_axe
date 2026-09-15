import { Logger } from '@axe/core/logging/logger';
import {
  type ReplayChunkInput,
  type ReplayChunkRecord,
  type ReplayKeyframeInput,
  type ReplayKeyframeRecord,
  ReplayLogStore,
  type ReplayRecordingInput,
  type ReplayRecordingMeta,
  type ReplayRecordingUpdate,
  sortRecordingsByNewest,
} from '@axe/core/storage/replay-log-store';

const DB_NAME = 'axe-replay-logs';
const DB_VERSION = 1;
const RECORDING_STORE = 'recordings';
const CHUNK_STORE = 'chunks';
const KEYFRAME_STORE = 'keyframes';
const RECORDING_INDEX = 'recordingId';

interface RecordingRow extends ReplayRecordingMeta {
  manifest?: Uint8Array;
}

export class IndexedDbReplayLogStore extends ReplayLogStore {
  private static _instance: IndexedDbReplayLogStore;
  /** The one IndexedDB-backed replay store for the page, created on first use. */
  static get instance(): IndexedDbReplayLogStore {
    if (!IndexedDbReplayLogStore._instance) IndexedDbReplayLogStore._instance = new IndexedDbReplayLogStore();
    return IndexedDbReplayLogStore._instance;
  }

  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /**
   * Whether the browser offers IndexedDB at all; if the database then fails to open, reads
   * come back empty and writes fail.
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /** Adds an empty recording row and returns its new id, or null when the database cannot be written. */
  async createRecording(input: ReplayRecordingInput): Promise<number | null> {
    const row: Omit<RecordingRow, 'id'> = {
      roomName: input.roomName,
      startedAt: input.startedAt,
      endedAt: null,
      eventCount: 0,
      byteSize: 0,
    };
    const key = await this.run<IDBValidKey>([RECORDING_STORE], 'readwrite', (stores) =>
      stores[0].add(row as RecordingRow)
    );
    return typeof key === 'number' ? key : null;
  }

  /**
   * Changes a recording's room name, end time or manifest, keeping fields left
   * undefined; an unknown id is ignored.
   */
  async updateRecording(id: number, update: ReplayRecordingUpdate): Promise<void> {
    await this.mutateRecording(id, (row) => {
      if (update.roomName !== undefined) row.roomName = update.roomName;
      if (update.endedAt !== undefined) row.endedAt = update.endedAt;
      if (update.manifest !== undefined) row.manifest = update.manifest;
    });
  }

  /** Every recording's metadata, newest first; empty when the database cannot be read. */
  async listRecordings(): Promise<ReplayRecordingMeta[]> {
    const rows = await this.run<RecordingRow[]>([RECORDING_STORE], 'readonly', (stores) => stores[0].getAll());
    if (!rows) return [];
    return sortRecordingsByNewest(rows.map(toMeta));
  }

  /** One recording's metadata, or null when there is no such recording or the database cannot be read. */
  async getRecording(id: number): Promise<ReplayRecordingMeta | null> {
    const row = await this.run<RecordingRow | undefined>([RECORDING_STORE], 'readonly', (stores) => stores[0].get(id));
    return row ? toMeta(row) : null;
  }

  /** The encoded manifest saved with a recording, or null when it has none. */
  async getManifest(id: number): Promise<Uint8Array | null> {
    const row = await this.run<RecordingRow | undefined>([RECORDING_STORE], 'readonly', (stores) => stores[0].get(id));
    return row?.manifest ?? null;
  }

  /**
   * Stores a chunk of recorded events and adds its event count and size to the recording's totals
   * in one transaction, resolving false when the write failed.
   */
  async appendChunk(input: ReplayChunkInput): Promise<boolean> {
    return await this.runOk([CHUNK_STORE, RECORDING_STORE], ([chunks, recordings]) => {
      chunks.add(input);
      countInto(recordings, input.recordingId, (row) => {
        row.eventCount += input.eventCount;
        row.byteSize += input.bytes.byteLength;
      });
    });
  }

  /** A recording's event chunks in index order; empty when the database cannot be read. */
  async listChunks(recordingId: number): Promise<ReplayChunkRecord[]> {
    const rows = await this.run<ReplayChunkRecord[]>([CHUNK_STORE], 'readonly', (stores) =>
      stores[0].index(RECORDING_INDEX).getAll(recordingId)
    );
    return (rows ?? []).sort((a, b) => a.index - b.index);
  }

  /**
   * Stores a keyframe and adds its size to the recording's total in one transaction,
   * resolving false when the write failed.
   */
  async putKeyframe(input: ReplayKeyframeInput): Promise<boolean> {
    const row = { ...input, byteSize: input.blob.size };
    return await this.runOk([KEYFRAME_STORE, RECORDING_STORE], ([keyframes, recordings]) => {
      keyframes.add(row);
      countInto(recordings, input.recordingId, (recording) => {
        recording.byteSize += row.byteSize;
      });
    });
  }

  /** A recording's keyframes in sequence order; empty when the database cannot be read. */
  async listKeyframes(recordingId: number): Promise<ReplayKeyframeRecord[]> {
    const rows = await this.run<ReplayKeyframeRecord[]>([KEYFRAME_STORE], 'readonly', (stores) =>
      stores[0].index(RECORDING_INDEX).getAll(recordingId)
    );
    return (rows ?? []).sort((a, b) => a.seq - b.seq);
  }

  /**
   * Deletes a recording together with its chunks and keyframes.
   *
   * Only their keys are read beforehand, so a long recording is never loaded just to be thrown
   * away.
   */
  async removeRecording(id: number): Promise<void> {
    // Deleting needs the keys alone; reading the rows would hold a whole recording before deleting it.
    const chunks = await this.keysOf(CHUNK_STORE, id);
    const keyframes = await this.keysOf(KEYFRAME_STORE, id);
    await this.run<number>([CHUNK_STORE], 'readwrite', (stores) => {
      for (const key of chunks) stores[0].delete(key);
      return stores[0].count();
    });
    await this.run<number>([KEYFRAME_STORE], 'readwrite', (stores) => {
      for (const key of keyframes) stores[0].delete(key);
      return stores[0].count();
    });
    await this.run<undefined>([RECORDING_STORE], 'readwrite', (stores) => stores[0].delete(id));
  }

  private async keysOf(store: string, recordingId: number): Promise<IDBValidKey[]> {
    const index = (s: IDBObjectStore) => s.index(RECORDING_INDEX);
    const keys = await this.run<IDBValidKey[]>([store], 'readonly', (stores) => {
      const target = index(stores[0]);
      // Some implementations cannot fetch keys alone, and fall back to reading the rows.
      return typeof target.getAllKeys === 'function' ? target.getAllKeys(recordingId) : target.getAll(recordingId);
    });
    return (keys ?? []).map((key) =>
      typeof key === 'object' && key !== null && 'id' in key ? key.id : key
    ) as IDBValidKey[];
  }

  /** Deletes every recording, chunk and keyframe in the database. */
  async clear(): Promise<void> {
    for (const name of [CHUNK_STORE, KEYFRAME_STORE, RECORDING_STORE]) {
      await this.run<undefined>([name], 'readwrite', (stores) => stores[0].clear());
    }
  }

  private async mutateRecording(id: number, mutate: (row: RecordingRow) => void): Promise<void> {
    await this.runOk([RECORDING_STORE], ([store]) => countInto(store, id, mutate));
  }

  private async runOk(names: readonly string[], action: (stores: IDBObjectStore[]) => void): Promise<boolean> {
    const db = await this.open();
    if (!db) return false;

    return new Promise<boolean>((resolve) => {
      try {
        const transaction = db.transaction(names as string[], 'readwrite');
        action(names.map((name) => transaction.objectStore(name)));
        const fail = (): void => {
          Logger.warn('[ReplayLogStore] 録画を書き足せませんでした', transaction.error);
          resolve(false);
        };
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = fail;
        transaction.onabort = fail;
      } catch (reason) {
        Logger.warn('[ReplayLogStore] 録画を書き足せませんでした', reason);
        resolve(false);
      }
    });
  }

  private open(): Promise<IDBDatabase | null> {
    if (!this.isAvailable()) return Promise.resolve(null);
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => upgrade(request.result);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            Logger.warn('[ReplayLogStore] IndexedDB を開けませんでした', request.error);
            resolve(null);
          };
        } catch (reason) {
          Logger.warn('[ReplayLogStore] IndexedDB を開けませんでした', reason);
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  private async run<T>(
    names: readonly string[],
    mode: IDBTransactionMode,
    action: (stores: IDBObjectStore[]) => IDBRequest<T>
  ): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;

    return new Promise<T | null>((resolve) => {
      try {
        const transaction = db.transaction(names as string[], mode);
        const stores = names.map((name) => transaction.objectStore(name));
        const request = action(stores);
        const fail = () => {
          Logger.warn('[ReplayLogStore] 録画の読み書きに失敗しました', transaction.error);
          resolve(null);
        };
        transaction.oncomplete = () => {
          try {
            resolve(request.result ?? null);
          } catch {
            resolve(null);
          }
        };
        transaction.onerror = fail;
        transaction.onabort = fail;
      } catch (reason) {
        Logger.warn('[ReplayLogStore] 録画の読み書きに失敗しました', reason);
        resolve(null);
      }
    });
  }
}

function upgrade(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(RECORDING_STORE)) {
    db.createObjectStore(RECORDING_STORE, { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains(CHUNK_STORE)) {
    const chunks = db.createObjectStore(CHUNK_STORE, { keyPath: 'id', autoIncrement: true });
    chunks.createIndex(RECORDING_INDEX, RECORDING_INDEX, { unique: false });
  }
  if (!db.objectStoreNames.contains(KEYFRAME_STORE)) {
    const keyframes = db.createObjectStore(KEYFRAME_STORE, { keyPath: 'id', autoIncrement: true });
    keyframes.createIndex(RECORDING_INDEX, RECORDING_INDEX, { unique: false });
  }
}

function toMeta(row: RecordingRow): ReplayRecordingMeta {
  return {
    id: row.id,
    roomName: row.roomName,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    eventCount: row.eventCount,
    byteSize: row.byteSize,
  };
}

function countInto(store: IDBObjectStore, id: number, mutate: (row: RecordingRow) => void): void {
  const get = store.get(id);
  get.onsuccess = () => {
    const row = get.result as RecordingRow | undefined;
    if (!row) return;
    mutate(row);
    store.put(row);
  };
}
