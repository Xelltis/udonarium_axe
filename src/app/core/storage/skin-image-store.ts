import { Logger } from '@axe/core/logging/logger';

const DB_NAME = 'axe-skin-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

/** The largest a picture behind the room may be once it has been resampled. */
export const SKIN_IMAGE_MAX_SIDE = 2560;

/** The largest file that will be taken in at all, before anything is decoded. */
export const SKIN_IMAGE_MAX_BYTES = 24 * 1024 * 1024;

/**
 * The picture a skin puts behind the room, kept where a picture will fit.
 *
 * A skin belongs to this browser and is never shared, so this cannot go in the image store
 * the room synchronises. It cannot go in local storage either: a background is megabytes and
 * that shelf holds a few. Its own database, keyed by which ladder the picture dresses.
 */
export class SkinImageStore {
  private static _instance: SkinImageStore;
  static get instance(): SkinImageStore {
    if (!SkinImageStore._instance) SkinImageStore._instance = new SkinImageStore();
    return SkinImageStore._instance;
  }

  private dbPromise: Promise<IDBDatabase | null> | null = null;

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  async get(mode: string): Promise<Blob | null> {
    const found = await this.request<unknown>('readonly', (store) => store.get(mode));
    return found instanceof Blob ? found : null;
  }

  async put(mode: string, blob: Blob): Promise<boolean> {
    const done = await this.request<IDBValidKey>('readwrite', (store) => store.put(blob, mode));
    return done !== null;
  }

  async remove(mode: string): Promise<void> {
    await this.request<undefined>('readwrite', (store) => store.delete(mode));
  }

  /** Forgets the open handle, so a test can start again against a fresh database. */
  reset(): void {
    this.dbPromise = null;
  }

  private async open(): Promise<IDBDatabase | null> {
    if (!this.isAvailable()) return null;
    this.dbPromise ??= new Promise<IDBDatabase | null>((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        Logger.warn('skin background storage is unavailable', request.error);
        resolve(null);
      };
    });
    return this.dbPromise;
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
          Logger.warn('skin background storage failed', request.error);
          resolve(null);
        };
      } catch (error) {
        Logger.warn('skin background storage failed', error);
        resolve(null);
      }
    });
  }
}
