export interface ReplayRecordingMeta {
  id: number;
  roomName: string;
  startedAt: number;
  endedAt: number | null;
  eventCount: number;
  byteSize: number;
}

export interface ReplayRecordingInput {
  roomName: string;
  startedAt: number;
}

export type ReplayRecordingUpdate = Partial<Pick<ReplayRecordingMeta, 'roomName' | 'endedAt'>> & {
  manifest?: Uint8Array;
};

export interface ReplayChunkInput {
  recordingId: number;
  index: number;
  seqStart: number;
  seqEnd: number;
  eventCount: number;
  bytes: Uint8Array;
}

export interface ReplayChunkRecord extends ReplayChunkInput {
  id: number;
}

export interface ReplayKeyframeInput {
  recordingId: number;
  seq: number;
  at: number;
  blob: Blob;
}

export interface ReplayKeyframeRecord extends ReplayKeyframeInput {
  id: number;
  byteSize: number;
}

export interface ReplayRetention {
  /** Null means no limit on the count. */
  maxCount: number | null;
  /** Null means no limit on the size. */
  maxTotalBytes: number | null;
}

/** Nothing is deleted by default; whoever recorded it decides. */
export const DEFAULT_REPLAY_RETENTION: ReplayRetention = {
  maxCount: null,
  maxTotalBytes: null,
};

export abstract class ReplayLogStore {
  /** Whether this store can work in the current browser at all. */
  abstract isAvailable(): boolean;
  /** Opens a new recording with no events yet and returns its id, or null when it could not be stored. */
  abstract createRecording(input: ReplayRecordingInput): Promise<number | null>;
  /** Changes a recording's room name, end time or encoded manifest, leaving fields not given as they are. */
  abstract updateRecording(id: number, update: ReplayRecordingUpdate): Promise<void>;
  /** Metadata for every stored recording, newest first. */
  abstract listRecordings(): Promise<ReplayRecordingMeta[]>;
  /** One recording's metadata, or null when no recording has that id. */
  abstract getRecording(id: number): Promise<ReplayRecordingMeta | null>;
  /** The encoded manifest saved for a recording, or null when none has been saved. */
  abstract getManifest(id: number): Promise<Uint8Array | null>;
  /**
   * Stores the next chunk of a recording's events and counts it into the recording's totals,
   * resolving false when it was not stored.
   */
  abstract appendChunk(input: ReplayChunkInput): Promise<boolean>;
  /** Every event chunk of a recording, in the order they were recorded. */
  abstract listChunks(recordingId: number): Promise<ReplayChunkRecord[]>;
  /**
   * Stores a keyframe for a recording and counts its size into the recording's total,
   * resolving false when it was not stored.
   */
  abstract putKeyframe(input: ReplayKeyframeInput): Promise<boolean>;
  /** Every keyframe of a recording, in sequence order. */
  abstract listKeyframes(recordingId: number): Promise<ReplayKeyframeRecord[]>;
  /** Deletes a recording along with all of its chunks and keyframes. */
  abstract removeRecording(id: number): Promise<void>;
  /** Deletes every recording this store holds. */
  abstract clear(): Promise<void>;
}

/** A copy of the list ordered by start time, newest first, with the higher id first on a tie. */
export function sortRecordingsByNewest(metas: readonly ReplayRecordingMeta[]): ReplayRecordingMeta[] {
  return [...metas].sort((a, b) => b.startedAt - a.startedAt || b.id - a.id);
}

/**
 * The ids of the recordings to delete so that the rest fit the retention limits.
 *
 * The newest recording and the protected one, normally the recording in progress, are always kept
 * and count toward the limits. Once one recording goes over a limit every older one goes too, so
 * what is kept is always an unbroken run of the newest.
 */
export function selectExpiredRecordings(
  metas: readonly ReplayRecordingMeta[],
  retention: ReplayRetention = DEFAULT_REPLAY_RETENTION,
  protectedId: number | null = null
): number[] {
  const sorted = sortRecordingsByNewest(metas);
  const expired: number[] = [];
  let keptBytes = 0;
  let isFull = false;

  sorted.forEach((meta, index) => {
    if (meta.id === protectedId) {
      keptBytes += meta.byteSize;
      return;
    }
    if (index === 0) {
      keptBytes += meta.byteSize;
      return;
    }
    const overCount = retention.maxCount != null && index >= retention.maxCount;
    const overBytes = retention.maxTotalBytes != null && keptBytes + meta.byteSize > retention.maxTotalBytes;
    if (isFull || overCount || overBytes) {
      isFull = true;
      expired.push(meta.id);
      return;
    }
    keptBytes += meta.byteSize;
  });

  return expired;
}
