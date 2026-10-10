export interface RoomSnapshotMeta {
  id: number;
  roomName: string;
  savedAt: number;
  byteSize: number;
}

export interface RoomSnapshotRecord extends RoomSnapshotMeta {
  blob: Blob;
}

export interface RoomSnapshotInput {
  roomName: string;
  savedAt: number;
  blob: Blob;
}

export interface RoomSnapshotRetention {
  maxCount: number;
  maxTotalBytes: number;
}

const MEGA_BYTE = 1024 * 1024;

export const DEFAULT_ROOM_SNAPSHOT_RETENTION: RoomSnapshotRetention = {
  maxCount: 5,
  maxTotalBytes: 256 * MEGA_BYTE,
};

export abstract class RoomSnapshotStore {
  /** Whether this store can work in the current browser at all. */
  abstract isAvailable(): boolean;
  /** Stores a snapshot of the room and returns its id, or null when it could not be stored. */
  abstract put(input: RoomSnapshotInput): Promise<number | null>;
  /** Metadata for every stored snapshot, without the bytes, newest first. */
  abstract list(): Promise<RoomSnapshotMeta[]>;
  /** One snapshot with its bytes, or null when no snapshot has that id. */
  abstract get(id: number): Promise<RoomSnapshotRecord | null>;
  /** Deletes the snapshot with this id, if there is one. */
  abstract remove(id: number): Promise<void>;
  /** Deletes every snapshot this store holds. */
  abstract clear(): Promise<void>;
}

/** A copy of the list ordered by save time, newest first, with the higher id first on a tie. */
export function sortSnapshotsByNewest(metas: readonly RoomSnapshotMeta[]): RoomSnapshotMeta[] {
  return [...metas].sort((a, b) => b.savedAt - a.savedAt || b.id - a.id);
}

/**
 * The ids of the snapshots to delete so that the rest fit the retention count and total size.
 *
 * The newest snapshot is always kept, even when it alone is over the size limit. Once one
 * snapshot goes over a limit every older one goes too.
 */
export function selectExpiredSnapshots(
  metas: readonly RoomSnapshotMeta[],
  retention: RoomSnapshotRetention = DEFAULT_ROOM_SNAPSHOT_RETENTION
): number[] {
  const sorted = sortSnapshotsByNewest(metas);
  const expired: number[] = [];
  let keptBytes = 0;
  let isFull = false;

  sorted.forEach((meta, index) => {
    if (index === 0) {
      keptBytes = meta.byteSize;
      return;
    }
    if (isFull || index >= retention.maxCount || keptBytes + meta.byteSize > retention.maxTotalBytes) {
      isFull = true;
      expired.push(meta.id);
      return;
    }
    keptBytes += meta.byteSize;
  });

  return expired;
}
