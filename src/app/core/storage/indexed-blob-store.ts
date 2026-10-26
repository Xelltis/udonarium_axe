import { Logger } from '@axe/core/logging/logger';
import { blobFromStored, storedBytesOf } from '@axe/core/storage/stored-bytes';

const DB_VERSION = 1;
/** How long an open may go unanswered before it is given up on, and tried afresh on the next use. */
const OPEN_TIMEOUT_MS = 5000;
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

  /** Whether anything is stored under a key, answered without reading it; false where storage is unavailable. */
  async has(key: string): Promise<boolean> {
    const count = await this.request<number>('readonly', (store) => store.count(key));
    return (count ?? 0) > 0;
  }

  /** Stores or replaces the picture under a key, resolving false when it could not be written. */
  async put(key: string, blob: Blob): Promise<boolean> {
    const stored = await storedBytesOf(blob);
    const done = await this.request<IDBValidKey>('readwrite', (store) => store.put(stored, key));
    return done !== null;
  }

  /** Deletes the picture stored under a key, if there is one, resolving false when the deletion could not be made. */
  async remove(key: string): Promise<boolean> {
    const done = await this.request<undefined>('readwrite', (store) => store.delete(key));
    return done !== null;
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
      const timer = setTimeout(() => {
        Logger.warn(`${this.purpose} storage did not open`);
        this.dbPromise = null;
        resolve(null);
      }, OPEN_TIMEOUT_MS);
      const settle = (db: IDBDatabase | null) => {
        clearTimeout(timer);
        if (!db) this.dbPromise = null;
        resolve(db);
      };
      // A browser that keeps nothing for the site refuses the open outright rather than failing it.
      try {
        const request = indexedDB.open(this.dbName, DB_VERSION);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => settle(this.letGoWhenAsked(request.result));
        request.onerror = () => {
          Logger.warn(`${this.purpose} storage is unavailable`, request.error);
          settle(null);
        };
      } catch (error) {
        Logger.warn(`${this.purpose} storage is unavailable`, error);
        settle(null);
      }
    });
    return this.dbPromise;
  }

  /**
   * Closes the handle when another tab deletes or upgrades the database, which would otherwise
   * wait for as long as this page keeps it open, and lets go of one the browser closes, as when the
   * site's data is cleared; the next use opens it again.
   */
  private letGoWhenAsked(db: IDBDatabase): IDBDatabase {
    db.onversionchange = () => {
      db.close();
      this.dbPromise = null;
    };
    db.onclose = () => {
      this.dbPromise = null;
    };
    return db;
  }

  /**
   * Runs one request in a transaction of its own and answers its result once the transaction is
   * done, or null where it failed. A write the browser takes and then cannot keep, as when it runs
   * out of room, fails only as the transaction ends, so the answer waits for that.
   */
  private async request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | null> {
    const db = await this.open();
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        Logger.warn(`${this.purpose} storage failed`, error);
        resolve(null);
      };
      try {
        const transaction = db.transaction(STORE_NAME, mode);
        const request = run(transaction.objectStore(STORE_NAME));
        request.onerror = () => fail(request.error);
        transaction.onabort = () => fail(transaction.error);
        transaction.oncomplete = () => {
          if (settled) return;
          settled = true;
          resolve(request.result as T);
        };
      } catch (error) {
        fail(error);
      }
    });
  }
}
