import { Logger } from '@axe/core/logging/logger';

const DB_NAME = 'axe-skin-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

/** The largest a picture behind the room may be once it has been resampled. */
export const SKIN_IMAGE_MAX_SIDE = 2560;

/** The largest file that will be taken in at all, before anything is decoded. */
export const SKIN_IMAGE_MAX_BYTES = 24 * 1024 * 1024;

/**
 * The pictures a skin layers behind the room, kept where a picture will fit.
 *
 * A skin belongs to this browser and is never shared, so this cannot go in the image store
 * the room synchronises. It cannot go in local storage either: a background is megabytes and
 * that shelf holds a few. Its own database, one picture per layer, keyed by the layer's id.
 */
export class SkinImageStore {
  private static _instance: SkinImageStore;
  /** The one skin picture store for the page, created on first use. */
  static get instance(): SkinImageStore {
    if (!SkinImageStore._instance) SkinImageStore._instance = new SkinImageStore();
    return SkinImageStore._instance;
  }

  private dbPromise: Promise<IDBDatabase | null> | null = null;

  /** Whether the browser offers IndexedDB; without it nothing is stored and every read comes back empty. */
  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  }

  /** The picture stored for this layer id, or null when there is none or storage is unavailable. */
  async get(layerId: string): Promise<Blob | null> {
    const found = await this.request<unknown>('readonly', (store) => store.get(layerId));
    return found instanceof Blob ? found : null;
  }

  /** Stores or replaces the picture for this layer id, resolving false when it could not be written. */
  async put(layerId: string, blob: Blob): Promise<boolean> {
    const done = await this.request<IDBValidKey>('readwrite', (store) => store.put(blob, layerId));
    return done !== null;
  }

  /** Deletes the picture stored for this layer id, if there is one. */
  async remove(layerId: string): Promise<void> {
    await this.request<undefined>('readwrite', (store) => store.delete(layerId));
  }

  /**
   * Drops every picture no stack refers to any more.
   *
   * A layer taken out of a stack leaves its bytes behind so that the panel's way back can
   * put it there again; nothing else ever removes them, and a stack trimmed on load leaves
   * some too. This is the sweep, run once at start.
   */
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
