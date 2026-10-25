import { START_ROOM_DATABASE } from '@axe/core/storage/app-database-names';
import { IndexedBlobStore } from '@axe/core/storage/indexed-blob-store';

/**
 * The room this browser sets out when it starts, kept as the very file a room is saved to, pictures
 * and all, under a single key.
 */
export class StartRoomStore extends IndexedBlobStore {
  /** The key the one room is kept under. */
  static readonly KEY = 'room';

  private static _instance: StartRoomStore;
  /** The one start room store for the page, created on first use. */
  static get instance(): StartRoomStore {
    if (!StartRoomStore._instance) StartRoomStore._instance = new StartRoomStore();
    return StartRoomStore._instance;
  }

  private constructor() {
    super(START_ROOM_DATABASE, 'start room');
  }
}
