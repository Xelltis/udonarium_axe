import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ReplayPreferenceService } from '@axe/application/replay/replay-preference.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { keepStoragePersistent } from '@axe/core/storage/persistent-storage';
import { ReplayLogStore, type ReplayRecordingMeta, selectExpiredRecordings } from '@axe/core/storage/replay-log-store';
import { ObjectStore } from '@axe/core/sync/object-store';
import { compressAsync } from '@axe/core/util/compress';
import { coalesce } from '@axe/core/util/debounce';
import { encodeReplayEvents, encodeReplayManifest } from '@axe/domain/replay/replay-codec';
import {
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';
import { ReplayEventBuilder, type ReplayStep } from '@axe/domain/replay/replay-event-builder';
import { encodeReplayKeyframe, replayObjectSnapshotsOf } from '@axe/domain/replay/replay-keyframe';

export const REPLAY_CHUNK_EVENT_LIMIT = 500;
export const REPLAY_CHUNK_INTERVAL_MS = 30_000;
export const REPLAY_KEYFRAME_INTERVAL_MS = 600_000;
export const REPLAY_RECENT_EVENT_LIMIT = 300;
export const REPLAY_RECENT_PUBLISH_MS = 250;
export const REPLAY_KEYFRAME_BUSY_RETRY_MS = 5_000;
export const REPLAY_IDLE_TIMEOUT_MS = 10_000;
/**
 * How often the manifest is rewritten.
 *
 * The manifest grows with the recording. Rewriting it whole on every append costs time in
 * proportion to the length, and the square of it overall. Playback reads the chunks and
 * keyframes straight from storage, so the manifest is written at intervals and settled on stopping.
 */
export const REPLAY_MANIFEST_CHECKPOINT_MS = 300_000;

@Injectable({ providedIn: 'root' })
export class ReplayRecorderService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly store = inject(ReplayLogStore);
  private readonly objectStore = inject(ObjectStore);
  private readonly pointerDevice = inject(PointerDeviceService);
  private readonly preference = inject(ReplayPreferenceService);
  private readonly events = new ReplayEventBuilder({
    get: (identifier) => this.objectStore.get(identifier),
    authorityPeerId: () => Network.authorityPeerId,
    selfPeerId: () => this.selfPeerId(),
    detailLevel: () => this.preference.detailLevel(),
  });

  private readonly _isRecording = signal(false);
  private readonly _eventCount = signal(0);
  private readonly _startedAt = signal(0);
  private readonly _recentEvents = signal<readonly ReplayEvent[]>([]);
  private readonly _recordings = signal<readonly ReplayRecordingMeta[]>([]);
  private readonly _isFailing = signal(false);
  private readonly _roomName = signal('');

  readonly isRecording = this._isRecording.asReadonly();
  readonly eventCount = this._eventCount.asReadonly();
  readonly startedAt = this._startedAt.asReadonly();
  readonly recentEvents = this._recentEvents.asReadonly();
  readonly detailLevel = this.preference.detailLevel.asReadonly();
  readonly recordings = this._recordings.asReadonly();
  readonly isFailing = this._isFailing.asReadonly();
  readonly roomName = this._roomName.asReadonly();

  private transition: Promise<void> = Promise.resolve();
  private recordingId: number | null = null;
  private chunkIndex = 0;
  private buffer: ReplayEvent[] = [];
  private readonly keyframes: ReplayManifest['keyframes'][number][] = [];
  private readonly chunks: ReplayManifest['chunks'][number][] = [];
  private lastKeyframeSeq = -1;
  private lastManifestAt = 0;
  /** Whether the board was touched. It moves even for changes no recording keeps. */
  private boardDirty = false;
  private recent: ReplayEvent[] = [];
  private recentDirty = false;
  private lastPublishAt = 0;
  private readonly chunkFlush = coalesce(() => {
    this.flushPending();
    void this.flushBuffer();
  }, REPLAY_CHUNK_INTERVAL_MS);
  private keyframeTimer: ReturnType<typeof setInterval> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly keyframeRetry = coalesce(() => void this.captureKeyframe(), REPLAY_KEYFRAME_BUSY_RETRY_MS);

  constructor() {
    networkMessage$.subscribe((message) => {
      if (!this._isRecording() || isNetworkIsolated()) return;
      this.handleMessage(message.eventName, message.data, message.sendFrom);
    }, this.destroyRef);

    const onLeaving = (): void => this.saveWhatWeHave();
    window.addEventListener('pagehide', onLeaving);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('pagehide', onLeaving);
      this.clearTimers();
    });
  }

  private saveWhatWeHave(): void {
    const id = this.recordingId;
    if (!this._isRecording() || id == null) return;
    this.flushPending();
    void this.flushBuffer(true);
    // Only the manifest holds who did what, so it is written even with nothing buffered.
    void this.persistManifest(id, true);
  }

  /** Whether this browser has the storage recordings are kept in. */
  get isSupported(): boolean {
    return this.store.isAvailable();
  }

  /** Reads the list of stored recordings again and publishes it on `recordings`. */
  async refresh(): Promise<readonly ReplayRecordingMeta[]> {
    if (!this.isSupported) return [];
    const metas = await this.store.listRecordings();
    this._recordings.set(metas);
    return metas;
  }

  /** Sets how much of what happens is kept, from the next event on, and remembers it in this browser. */
  setDetailLevel(level: ReplayDetailLevel): void {
    this.preference.setDetailLevel(level);
  }

  /** The name a peer went by most recently in this recording, or their user id when none was recorded. */
  actorNameOf(userId: string): string {
    return this.events.actorNameOf(userId);
  }

  /** The name an object had most recently in this recording, or empty when it was never named. */
  targetNameOf(identifier: string): string {
    return this.events.targetNameOf(identifier);
  }

  /**
   * Starts recording the room, taking a first board and clearing out recordings past the keep
   * count.
   *
   * Waits for any start or stop still running. Answers false when storage is unavailable, a
   * recording is already running, the board is being replayed, or the recording could not be
   * created.
   */
  async start(): Promise<boolean> {
    return this.queue(() => this.startNow());
  }

  /** Stops recording, saving a last board and everything still buffered. Does nothing when not recording. */
  async stop(): Promise<void> {
    await this.queue(() => this.stopNow());
  }

  private queue<T>(step: () => Promise<T>): Promise<T> {
    const run = this.transition.then(step);
    this.transition = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private async startNow(): Promise<boolean> {
    if (!this.isSupported || this._isRecording() || isNetworkIsolated()) return false;

    // Ask for durable storage before starting; without it a device running low deletes the recording along with everything else.
    await keepStoragePersistent();

    const startedAt = Date.now();
    const roomName = currentRoomName();
    const id = await this.store.createRecording({ roomName, startedAt });
    if (id == null) {
      Logger.warn('[ReplayRecorder] 録画を開始できませんでした');
      return false;
    }

    this.recordingId = id;
    this.chunkIndex = 0;
    this.buffer = [];
    this.keyframes.length = 0;
    this.chunks.length = 0;
    this._eventCount.set(0);
    this._isFailing.set(false);
    this.recent = [];
    this.recentDirty = false;
    this._recentEvents.set([]);
    this._startedAt.set(startedAt);
    this._roomName.set(roomName);
    this.events.begin(startedAt, this.objectStore.getObjects());
    this.lastKeyframeSeq = -1;
    this.lastManifestAt = 0;
    this.boardDirty = false;
    this._isRecording.set(true);

    await this.captureKeyframe(true);
    this.keyframeTimer = setInterval(() => void this.captureKeyframe(), REPLAY_KEYFRAME_INTERVAL_MS);
    await this.prune();
    await this.refresh();
    return true;
  }

  private async stopNow(): Promise<void> {
    if (!this._isRecording()) return;
    this._isRecording.set(false);
    this.clearTimers();
    this.flushPending();
    await this.captureKeyframe(true);
    await this.flushBuffer();

    const id = this.recordingId;
    this.recordingId = null;
    if (id != null) {
      await this.store.updateRecording(id, { endedAt: Date.now(), manifest: encodeReplayManifest(this.manifest()) });
    }
    await this.refresh();
  }

  /** Drops a labelled marker into the recording and saves the board there, so playback can start from it. */
  async mark(label: string): Promise<void> {
    if (!this._isRecording()) return;
    this.apply(this.events.record({ kind: ReplayEventKind.Marker, detail: { label } }, this.selfPeerId(), Date.now()));
    await this.captureKeyframe(true);
  }

  /** Deletes a stored recording. The one being recorded is never deleted. */
  async remove(id: number): Promise<void> {
    if (!this.isSupported || id === this.recordingId) return;
    await this.store.removeRecording(id);
    await this.refresh();
  }

  private handleMessage(eventName: string, data: unknown, sendFrom: string): void {
    const take = this.events.take(eventName, data, sendFrom, Date.now());
    if (take.touched) this.boardDirty = true;
    this.apply(take.step);
  }

  private apply(step: ReplayStep | null): void {
    if (!step) return;
    if (step.merged) {
      this.trackRecent(step.event, true);
      return;
    }
    if (step.settled) this.settle(step.settled);
    this.trackRecent(step.event, false);
    if (this.buffer.length + 1 >= REPLAY_CHUNK_EVENT_LIMIT) this.flushPending();
    this.chunkFlush();
  }

  private flushPending(): void {
    const settled = this.events.settle();
    if (settled) this.settle(settled);
  }

  private settle(event: ReplayEvent): void {
    this.buffer.push(event);
    this._eventCount.update((count) => count + 1);
    this.publishRecent();
    if (this.buffer.length >= REPLAY_CHUNK_EVENT_LIMIT) void this.flushBuffer();
  }

  private async flushBuffer(force = false): Promise<void> {
    const id = this.recordingId;
    if (id == null || this.buffer.length < 1) return;

    const events = this.buffer;
    this.buffer = [];
    this.events.markWritten(events);
    const bytes = encodeReplayEvents(events);
    const chunk = {
      index: this.chunkIndex++,
      seqStart: events[0].seq,
      seqEnd: events[events.length - 1].seq,
      eventCount: events.length,
      byteSize: bytes.byteLength,
    };
    this.chunks.push(chunk);
    const written = await this.store.appendChunk({ recordingId: id, ...chunk, bytes });
    if (!written) {
      this._isFailing.set(true);
      Logger.warn('[ReplayRecorder] 記録を書き足せませんでした', { chunk: chunk.index });
      return;
    }
    await this.persistManifest(id, force);
  }

  private async persistManifest(id: number, force = false): Promise<void> {
    const at = Date.now();
    if (!force && at - this.lastManifestAt < REPLAY_MANIFEST_CHECKPOINT_MS) return;
    try {
      await this.store.updateRecording(id, { manifest: encodeReplayManifest(this.manifest()) });
      // Only a successful write advances the clock; counting a failure would skip the next chance entirely.
      this.lastManifestAt = at;
    } catch (reason) {
      Logger.warn('[ReplayRecorder] 目録を書けませんでした', reason);
    }
  }

  private async captureKeyframe(force = false): Promise<void> {
    const id = this.recordingId;
    if (id == null) return;
    if (isNetworkIsolated()) return;

    // Nothing since the last one means the same board, and taking it again stacks up an empty room.
    // The board moves even for changes no recording keeps, so this watches for a touch rather than a sequence number.
    if (!force && !this.boardDirty) return;

    if (!force) {
      await this.whenIdle();
      if (this.recordingId !== id || isNetworkIsolated()) return;
      if (this.pointerDevice.isDragging) {
        this.keyframeRetry();
        return;
      }
    }

    this.events.closePieceEvents();
    try {
      // Keep the number with what was taken. Counting what happened during the compression
      // would mark those events as already in the board, and playback would skip them.
      const seq = this.events.seq;
      const raw = encodeReplayKeyframe(replayObjectSnapshotsOf(this.objectStore.getObjects()));
      // A board is a whole room and another arrives every ten minutes; uncompressed they would soon eat the storage.
      const bytes = await this.compressed(raw);
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      const at = Date.now();
      const written = await this.store.putKeyframe({ recordingId: id, seq, at, blob });
      if (!written) {
        this._isFailing.set(true);
        return;
      }
      this.lastKeyframeSeq = seq;
      this.boardDirty = false;
      this.keyframes.push({ seq, at, byteSize: blob.size });
      await this.persistManifest(id, force);
    } catch (reason) {
      this._isFailing.set(true);
      Logger.warn('[ReplayRecorder] 盤面の記録に失敗しました', reason);
    }
  }

  /** Some browsers cannot compress. Where it fails the bytes are stored plain, and readers tell by the magic number. */
  private async compressed(bytes: Uint8Array): Promise<Uint8Array> {
    try {
      return await compressAsync(bytes);
    } catch (reason) {
      Logger.warn('[ReplayRecorder] 盤面を圧縮できませんでした', reason);
      return bytes;
    }
  }

  private whenIdle(): Promise<void> {
    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback !== 'function') return Promise.resolve();
    return new Promise<void>((resolve) => idleCallback(() => resolve(), { timeout: REPLAY_IDLE_TIMEOUT_MS }));
  }

  private trackRecent(event: ReplayEvent, replaceLast: boolean): void {
    if (replaceLast && this.recent.length > 0) this.recent[this.recent.length - 1] = event;
    else this.recent.push(event);
    if (this.recent.length > REPLAY_RECENT_EVENT_LIMIT) this.recent.shift();
    this.recentDirty = true;

    if (!replaceLast || Date.now() - this.lastPublishAt >= REPLAY_RECENT_PUBLISH_MS) {
      this.publishRecent();
      return;
    }
    if (this.publishTimer === null) {
      this.publishTimer = setTimeout(() => {
        this.publishTimer = null;
        this.publishRecent();
      }, REPLAY_RECENT_PUBLISH_MS);
    }
  }

  private publishRecent(): void {
    if (!this.recentDirty) return;
    this.recentDirty = false;
    this.lastPublishAt = Date.now();
    this._recentEvents.set([...this.recent]);
  }

  private manifest(): ReplayManifest {
    const { recordedBy, actors, targets } = this.events.cast();
    return {
      formatVersion: REPLAY_FORMAT_VERSION,
      roomName: this._roomName(),
      startedAt: this._startedAt(),
      endedAt: Date.now(),
      recordedBy,
      detailLevel: this.preference.detailLevel(),
      actors,
      targets,
      keyframes: [...this.keyframes],
      chunks: [...this.chunks],
    };
  }

  private selfPeerId(): string {
    return Network.peerId;
  }

  private async prune(): Promise<void> {
    const expired = selectExpiredRecordings(
      await this.store.listRecordings(),
      this.preference.retention,
      this.recordingId
    );
    for (const id of expired) await this.store.removeRecording(id);
  }

  private clearTimers(): void {
    this.chunkFlush.cancel();
    if (this.keyframeTimer !== null) clearInterval(this.keyframeTimer);
    if (this.publishTimer !== null) clearTimeout(this.publishTimer);
    this.keyframeRetry.cancel();
    this.keyframeTimer = null;
    this.publishTimer = null;
  }
}

function currentRoomName(): string {
  return Network.peerContext?.roomName ?? '';
}
