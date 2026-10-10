import { SKIN_IMAGE_DATABASE } from '@axe/core/storage/app-database-names';
import { IndexedBlobStore } from '@axe/core/storage/indexed-blob-store';

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
 *
 * A layer taken out of a stack leaves its bytes behind so that the panel's way back can put it
 * there again, and a stack trimmed on load leaves some too; `forget` is the sweep, run once at
 * start.
 */
export class SkinImageStore extends IndexedBlobStore {
  private static _instance: SkinImageStore;
  /** The one skin picture store for the page, created on first use. */
  static get instance(): SkinImageStore {
    if (!SkinImageStore._instance) SkinImageStore._instance = new SkinImageStore();
    return SkinImageStore._instance;
  }

  private constructor() {
    super(SKIN_IMAGE_DATABASE, 'skin background');
  }
}
