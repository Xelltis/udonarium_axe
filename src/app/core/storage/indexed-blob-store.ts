import { Logger } from '@axe/core/logging/logger';
import { blobFromStored, storedBytesOf } from '@axe/core/storage/stored-bytes';

const DB_VERSION = 1;
const STORE_NAME = 'images';

/**
 * Pictures kept in a database of their own in this browser, one per key.
 *
 * For what belongs to this browser and is too large for local storage: a skin's backgrounds, or the
 * picture a seat chose for its dice. Where the browser has no IndexedDB, nothing is kept and every
 * read comes back empty. A picture is kept as its bytes, which a private window in WebKit stores
 * where it refuses the picture itself.
 */
export class IndexedBlobStore {
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /** Names the database the pictures are kept in, and what they are for, which warnings say. */
  constructor(
    private readonly dbName: string,
    private readonly purpose: string
  ) {}

  /** Whether the browser offers IndexedDB; without it nothing is stored and every read comes back empty. */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /** The picture stored under a key, or null when there is none or storage is unavailable. */
  async get(key: string): Promise<Blob | null> {
    const found = await this.request<unknown>('readonly', (store) => store.get(key));
    return blobFromStored(found);
  }

  /** Stores or replaces the picture under a key, resolving false when it could not be written. */
  async put(key: string, blob: Blob): Promise<boolean> {
    const stored = await storedBytesOf(blob);
    const done = await this.request<IDBValidKey>('readwrite', (store) => store.put(stored, key));
    return done !== null;
  }

  /** Deletes the picture stored under a key, if there is one. */
  async remove(key: string): Promise<void> {
    await this.request<undefined>('readwrite', (store) => store.delete(key));
  }

  /** Drops every picture whose key is not among those to keep. */
  async forget(keep: ReadonlySet<string>): Promise<void> {
    const held = await this.request<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    if (!held) return;
    for (const key of held) {
      if (typeof key === 'string' && !keep.has(key)) await this.remove(key);
    }
  }

  /** Forgets the open handle, so a test can start again against a fresh database. */
  reset(): void {
    this.dbPromise = null;
  }

  private async open(): Promise<IDBDatabase | null> {
    if (!this.isAvailable()) return null;
    this.dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(this.letGoWhenAsked(request.result));
      request.onerror = () => {
        Logger.warn(`${this.purpose} storage is unavailable`, request.error);
        resolve(null);
      };
    });
    return this.dbPromise;
  }

  /**
   * Closes the handle when another tab deletes or upgrades the database, which would otherwise
   * wait for as long as this page keeps it open; the next use opens it again.
   */
  private letGoWhenAsked(db: IDBDatabase): IDBDatabase {
    db.onversionchange = () => {
      db.close();
      this.dbPromise = null;
    };
    return db;
  }

  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      try {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = run(transaction.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => {
          Logger.warn(`${this.purpose} storage failed`, request.error);
          resolve(null);
        };
      } catch (error) {
        Logger.warn(`${this.purpose} storage failed`, error);
        resolve(null);
      }
    });
  }
}
