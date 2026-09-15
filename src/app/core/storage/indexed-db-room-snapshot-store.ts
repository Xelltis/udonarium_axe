import { Logger } from '@axe/core/logging/logger';
import {
  RoomSnapshotInput,
  RoomSnapshotMeta,
  RoomSnapshotRecord,
  RoomSnapshotStore,
  sortSnapshotsByNewest,
} from '@axe/core/storage/room-snapshot-store';

const DB_NAME = 'axe-room-snapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

export class IndexedDbRoomSnapshotStore extends RoomSnapshotStore {
  private static _instance: IndexedDbRoomSnapshotStore;
  /** The one IndexedDB-backed room snapshot store for the page, created on first use. */
  static get instance(): IndexedDbRoomSnapshotStore {
    if (!IndexedDbRoomSnapshotStore._instance) {
      IndexedDbRoomSnapshotStore._instance = new IndexedDbRoomSnapshotStore();
    }
    return IndexedDbRoomSnapshotStore._instance;
  }

  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /**
   * Whether the browser offers IndexedDB at all; if the database then fails to open, reads
   * come back empty and writes fail.
   */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /** Stores a room snapshot and returns its new id, or null when the database cannot be written. */
  async put(input: RoomSnapshotInput): Promise<number | null> {
    const record = {
      roomName: input.roomName,
      savedAt: input.savedAt,
      byteSize: input.blob.size,
      blob: input.blob,
    };
    const key = await this.request<IDBValidKey>('readwrite', (store) => store.add(record));
    return typeof key === 'number' ? key : null;
  }

  /** Every snapshot's metadata without its bytes, newest first; empty when the database cannot be read. */
  async list(): Promise<RoomSnapshotMeta[]> {
    const records = await this.request<RoomSnapshotRecord[]>('readonly', (store) => store.getAll());
    if (!records) return [];
    const metas = records.map(({ id, roomName, savedAt, byteSize }) => ({ id, roomName, savedAt, byteSize }));
    return sortSnapshotsByNewest(metas);
  }

  /** One snapshot with its bytes, or null when there is none with that id or the database cannot be read. */
  async get(id: number): Promise<RoomSnapshotRecord | null> {
    const record = await this.request<RoomSnapshotRecord | undefined>('readonly', (store) => store.get(id));
    return record ?? null;
  }

  /** Deletes the snapshot with this id, if there is one. */
  async remove(id: number): Promise<void> {
    await this.request<undefined>('readwrite', (store) => store.delete(id));
  }

  /** Deletes every stored snapshot. */
  async clear(): Promise<void> {
    await this.request<undefined>('readwrite', (store) => store.clear());
  }

  private open(): Promise<IDBDatabase | null> {
    if (!this.isAvailable()) return Promise.resolve(null);
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase | null>((resolve) => {
        try {
          const request = indexedDB.open(DB_NAME, DB_VERSION);
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
              db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => {
            Logger.warn('[RoomSnapshotStore] IndexedDB を開けませんでした', request.error);
            resolve(null);
          };
        } catch (reason) {
          Logger.warn('[RoomSnapshotStore] IndexedDB を開けませんでした', reason);
          resolve(null);
        }
      });
    }
    return this.dbPromise;
  }

  private async request<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;

    return new Promise<T | null>((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = action(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
          Logger.warn('[RoomSnapshotStore] スナップショット操作に失敗しました', request.error);
          resolve(null);
        };
      } catch (reason) {
        Logger.warn('[RoomSnapshotStore] スナップショット操作に失敗しました', reason);
        resolve(null);
      }
    });
  }
}
