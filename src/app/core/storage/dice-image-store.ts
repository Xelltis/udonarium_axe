import { DICE_IMAGE_DATABASE } from '@axe/core/storage/app-database-names';
import { IndexedBlobStore } from '@axe/core/storage/indexed-blob-store';

/**
 * The picture this seat chose for its dice, kept in this browser under the identifier the room
 * knows it by.
 *
 * The room's image store starts empty with every visit, so the picture is put back into it from
 * here; kept as the very bytes that were shared, it comes back under the same identifier.
 */
export class DiceImageStore extends IndexedBlobStore {
  private static _instance: DiceImageStore;
  /** The one dice picture store for the page, created on first use. */
  static get instance(): DiceImageStore {
    if (!DiceImageStore._instance) DiceImageStore._instance = new DiceImageStore();
    return DiceImageStore._instance;
  }

  private constructor() {
    super(DICE_IMAGE_DATABASE, 'dice picture');
  }
}
