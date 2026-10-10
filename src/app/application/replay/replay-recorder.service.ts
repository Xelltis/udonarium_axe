import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ReplayPreferenceService } from '@axe/application/replay/replay-preference.service';
import { Logger } from '@axe/core/logging/logger';
import { Network } from '@axe/core/network/network';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import { keepStoragePersistent } from '@axe/core/storage/persistent-storage';
import { ReplayLogStore, type ReplayRecordingMeta, selectExpiredRecordings } from '@axe/core/storage/replay-log-store';
import type { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectNode } from '@axe/core/sync/object-node';
import { ObjectStore } from '@axe/core/sync/object-store';
import { compressAsync } from '@axe/core/util/compress';
import { DataElement } from '@axe/domain/data/data-element';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { canMergeReplayEvents, mergeReplayEvents } from '@axe/domain/replay/replay-coalescer';
import { encodeReplayEvents, encodeReplayManifest } from '@axe/domain/replay/replay-codec';
import { cloneSyncData, type SyncData, syncValueOf } from '@axe/domain/replay/replay-diff';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  type ReplayActorSnapshot,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { REPLAY_PART_FLAG } from '@axe/domain/replay/replay-event-category';
import {
  interpretObjectChange,
  interpretObjectRemove,
  interpretSignal,
  isIgnoredReplayEvent,
  isRecordableKind,
  type ReplayDraft,
  shouldDiffObjectChange,
} from '@axe/domain/replay/replay-interpreter';
import { encodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { visibilityOfDisclosure, visibilityOfSyncData } from '@axe/domain/replay/replay-visibility';
import { TabletopObject } from '@axe/domain/tabletop/tabletop-object';

export const REPLAY_CHUNK_EVENT_LIMIT = 500;
export const REPLAY_CHUNK_INTERVAL_MS = 30_000;
export const REPLAY_KEYFRAME_INTERVAL_MS = 600_000;
export const REPLAY_BASELINE_GRACE_MS = 5_000;
const CHAT_ALIAS = 'chat';
/** How far another browser's clock may run behind ours for a line it stamped to still count as new. */
export const REPLAY_CLOCK_SKEW_MS = 2_000;
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
  private seq = 0;
  private chunkIndex = 0;
  private buffer: ReplayEvent[] = [];
  private pending: ReplayEvent | null = null;
  private readonly shadows = new Map<string, SyncData>();
  private readonly actors = new Map<string, ReplayActorSnapshot[]>();
  private readonly targets = new Map<string, ReplayTargetSnapshot[]>();
  private readonly keyframes: ReplayManifest['keyframes'][number][] = [];
  private readonly chunks: ReplayManifest['chunks'][number][] = [];
  private baselineUntil = 0;
  private lastKeyframeSeq = -1;
  private lastManifestAt = 0;
  /** Whether the board was touched. It moves even for changes no recording keeps. */
  private boardDirty = false;
  /** Who could see each object when it was last recorded, for judging its removal once it is gone. */
  private readonly lastVisibility = new Map<string, ReplayVisibility>();
  /**
   * The objects that are parts of a piece, whose arrival and removal are not told on their own,
   * each with the piece it belongs to, or empty where that piece has not been seen yet.
   */
  private readonly partOwners = new Map<string, string>();
  /**
   * The arrival or removal of a piece just recorded, by piece, while nothing has been recorded or
   * saved after it and it has not been written out. The parts that come and go with the piece right
   * then are folded into it; one that comes later is told on its own, after what came between.
   */
  private readonly openPieceEvents = new Map<string, ReplayEvent>();
  /** The names of the pieces on the table when recording began, for naming one removed untouched. */
  private readonly namesAtStart = new Map<string, string>();
  private recent: ReplayEvent[] = [];
  private recentDirty = false;
  private lastPublishAt = 0;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private keyframeTimer: ReturnType<typeof setInterval> | null = null;
  private publishTimer: ReturnType<typeof setTimeout> | null = null;
  private keyframeRetryTimer: ReturnType<typeof setTimeout> | null = null;

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
    const history = this.actors.get(userId);
    return history?.[history.length - 1]?.name || userId;
  }

  /** The name an object had most recently in this recording, or empty when it was never named. */
  targetNameOf(identifier: string): string {
    const history = this.targets.get(identifier);
    return history?.[history.length - 1]?.name || '';
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
    this.seq = 0;
    this.chunkIndex = 0;
    this.buffer = [];
    this.pending = null;
    this.shadows.clear();
    this.actors.clear();
    this.targets.clear();
    this.lastVisibility.clear();
    this.partOwners.clear();
    this.openPieceEvents.clear();
    this.namesAtStart.clear();
    this.keyframes.length = 0;
    this.chunks.length = 0;
    this._eventCount.set(0);
    this._isFailing.set(false);
    this.recent = [];
    this.recentDirty = false;
    this._recentEvents.set([]);
    this._startedAt.set(startedAt);
    this._roomName.set(roomName);
    this.seedShadows();
    this.lastKeyframeSeq = -1;
    this.lastManifestAt = 0;
    this.boardDirty = false;
    this.baselineUntil = startedAt + REPLAY_BASELINE_GRACE_MS;
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
    this.push({ kind: ReplayEventKind.Marker, detail: { label } }, this.selfPeerId(), Date.now());
    await this.captureKeyframe(true);
  }

  /** Deletes a stored recording. The one being recorded is never deleted. */
  async remove(id: number): Promise<void> {
    if (!this.isSupported || id === this.recordingId) return;
    await this.store.removeRecording(id);
    await this.refresh();
  }

  private handleMessage(eventName: string, data: unknown, sendFrom: string): void {
    if (isIgnoredReplayEvent(eventName)) return;
    const at = Date.now();
    this.boardDirty = true;

    if (eventName === 'UPDATE_GAME_OBJECT') {
      this.handleObjectUpdate(data as ObjectContext, sendFrom, at);
      return;
    }
    if (eventName === 'DELETE_GAME_OBJECT') {
      const context = data as { identifier: string; aliasName: string };
      const owner = this.partOwners.get(context.identifier);
      this.noteRemovedVisibility(context.identifier, owner);
      this.shadows.delete(context.identifier);
      if (owner !== undefined) {
        this.partOwners.delete(context.identifier);
        if (this.foldPartRemoval(owner, context.identifier)) return;
      } else {
        this.rememberRemovedTarget(context.identifier, context.aliasName);
      }
      const draft = interpretObjectRemove(context.identifier, context.aliasName);
      if (owner !== undefined) draft.detail[REPLAY_PART_FLAG] = true;
      this.push(draft, sendFrom, at);
      return;
    }

    const draft = interpretSignal(eventName, data);
    if (draft) this.push(draft, sendFrom, at);
  }

  private handleObjectUpdate(context: ObjectContext, sendFrom: string, at: number): void {
    if (!context?.identifier) return;
    const after = context.syncData as SyncData;
    const before = this.shadows.get(context.identifier) ?? null;
    this.shadows.set(context.identifier, cloneSyncData(after));
    if (before && before['parentIdentifier'] !== after['parentIdentifier']) {
      this.notePartOwner(context.identifier, after['parentIdentifier']);
    }

    if (!before && at < this.baselineUntil && !this.isFreshArrival(context.aliasName, after, sendFrom)) return;
    if (!shouldDiffObjectChange(this.preference.detailLevel(), context.aliasName, !before)) return;

    const draft = interpretObjectChange({
      aliasName: context.aliasName,
      identifier: context.identifier,
      before,
      after,
    });
    if (!draft) return;
    if (!before && this.notePart(context.identifier, after, draft) && this.foldPartArrival(context.identifier, draft)) {
      return;
    }
    this.push(draft, sendFrom, at);
  }

  /**
   * Keeps up with whether an object is part of a piece once it has moved: a card drawn from its deck
   * is a piece of its own from then on, and one put into a deck becomes part of it. Judged from the
   * parent it moved to, since the room may not have taken the move in yet.
   */
  private notePartOwner(identifier: string, parentIdentifier: unknown): void {
    const parent = typeof parentIdentifier === 'string' ? this.objectStore.get(parentIdentifier) : null;
    const owner = parent instanceof TabletopObject ? parent : ownerOf(parent);
    if (owner) this.partOwners.set(identifier, owner.identifier);
    else this.partOwners.delete(identifier);
  }

  /**
   * Folds a part that has just arrived into the arrival of its piece, when that is still open, so
   * a piece brought out with its many parts is one event. Answers whether it was folded.
   */
  private foldPartArrival(identifier: string, draft: ReplayDraft): boolean {
    const owner = this.partOwners.get(identifier);
    const arrival = owner ? this.openPieceEvents.get(owner) : undefined;
    if (!arrival || arrival.kind !== ReplayEventKind.ObjectCreate || !draft.patch) return false;
    arrival.parts = [...(arrival.parts ?? []), draft.patch];
    return true;
  }

  /**
   * Folds the removal of a part into the removal of its piece, when that is still open, so a piece
   * taken away with its many parts is one event. Answers whether it was folded.
   */
  private foldPartRemoval(owner: string, identifier: string): boolean {
    const removal = owner ? this.openPieceEvents.get(owner) : undefined;
    if (!removal || removal.kind !== ReplayEventKind.ObjectRemove) return false;
    removal.removedParts = [...(removal.removedParts ?? []), identifier];
    return true;
  }

  /**
   * Whether something first seen while the room is still catching up is new, rather than the room
   * as it already was.
   *
   * What this browser sent itself is new, and so is a line stamped after the recording began. A
   * peer's copy of an older line or piece is the room catching up, which the first board holds.
   */
  private isFreshArrival(aliasName: string, after: SyncData, sendFrom: string): boolean {
    const self = this.selfPeerId();
    if (self.length > 0 && sendFrom === self) return true;
    if (aliasName !== CHAT_ALIAS) return false;
    const stamped = Number(syncValueOf(after, 'timestamp') ?? 0);
    return Number.isFinite(stamped) && stamped >= this._startedAt() - REPLAY_CLOCK_SKEW_MS;
  }

  /**
   * Flags a newly arrived object that belongs to a piece, so it is not told as an arrival of its own.
   *
   * A part sent by someone else can arrive before the piece it belongs to, when its owner cannot be
   * found yet; a parent not seen at all yet marks it as a part all the same.
   */
  private notePart(identifier: string, after: SyncData, draft: ReplayDraft): boolean {
    const parent = after['parentIdentifier'];
    const awaitsParent = typeof parent === 'string' && parent.length > 0 && !this.shadows.has(parent);
    const owner = ownerOf(this.objectStore.get(identifier));
    if (!owner && !awaitsParent) return false;
    this.partOwners.set(identifier, owner?.identifier ?? '');
    draft.detail[REPLAY_PART_FLAG] = true;
    return true;
  }

  /**
   * Keeps who could see an object being taken away, before its last synced state is let go.
   *
   * The room has already dropped it, so its removal is judged by what is remembered here: a piece
   * by its own disclosure, a part by its piece's. A piece hidden from the start and never touched
   * since would otherwise be told to everyone as it leaves.
   */
  private noteRemovedVisibility(identifier: string, owner: string | undefined): void {
    const holder = owner || identifier;
    const shadow = this.shadows.get(holder);
    const visibility = shadow ? visibilityOfSyncData(shadow) : this.lastVisibility.get(holder);
    if (visibility) this.lastVisibility.set(identifier, visibility);
  }

  /**
   * Names a piece taken away that no event had named yet, from what was seen when recording
   * began. The store has let it go by the time the removal arrives.
   */
  private rememberRemovedTarget(identifier: string, aliasName: string): void {
    if (this.targets.has(identifier)) return;
    const name = this.namesAtStart.get(identifier);
    if (name == null) return;
    this.targets.set(identifier, [{ identifier, aliasName, name, sinceSeq: this.seq + 1 }]);
  }

  private push(draft: ReplayDraft, sendFrom: string, at: number): void {
    if (!isRecordableKind(draft.kind, this.preference.detailLevel())) return;

    const actor = this.rememberActor(sendFrom);
    if (draft.targetIdentifier) this.rememberTarget(draft.targetIdentifier);
    for (const identifier of draft.relatedIdentifiers ?? []) this.rememberTarget(identifier);

    const event: ReplayEvent = {
      seq: ++this.seq,
      at,
      t: at - this._startedAt(),
      kind: draft.kind,
      actorId: actor.userId,
      targetId: draft.targetIdentifier,
      detail: draft.detail,
      patch: draft.patch,
      signal: draft.signal,
      visibility: this.visibilityOf(draft),
    };

    if (this.pending && canMergeReplayEvents(this.pending, event)) {
      this.seq--;
      this.pending = mergeReplayEvents(this.pending, event);
      this.trackRecent(this.pending, true);
      return;
    }

    this.flushPending();
    this.pending = event;
    this.openPieceEvents.clear();
    this.openIfPiece(event);
    this.trackRecent(event, false);
    if (this.buffer.length + 1 >= REPLAY_CHUNK_EVENT_LIMIT) this.flushPending();
    this.scheduleChunkFlush();
  }

  /** Keeps the arrival or removal of a piece open for its parts until it is written out. */
  private openIfPiece(event: ReplayEvent): void {
    if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return;
    if (!event.targetId || event.detail[REPLAY_PART_FLAG] === true) return;
    this.openPieceEvents.set(event.targetId, event);
  }

  private flushPending(): void {
    if (!this.pending) return;
    this.buffer.push(this.pending);
    this.pending = null;
    this._eventCount.update((count) => count + 1);
    this.publishRecent();
    if (this.buffer.length >= REPLAY_CHUNK_EVENT_LIMIT) void this.flushBuffer();
  }

  private scheduleChunkFlush(): void {
    if (this.chunkTimer !== null) return;
    this.chunkTimer = setTimeout(() => {
      this.chunkTimer = null;
      this.flushPending();
      void this.flushBuffer();
    }, REPLAY_CHUNK_INTERVAL_MS);
  }

  private async flushBuffer(force = false): Promise<void> {
    const id = this.recordingId;
    if (id == null || this.buffer.length < 1) return;

    const events = this.buffer;
    this.buffer = [];
    for (const event of events) {
      if (event.targetId && this.openPieceEvents.get(event.targetId) === event)
        this.openPieceEvents.delete(event.targetId);
    }
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
      if (this.recordingId !== id) return;
      if (this.pointerDevice.isDragging) {
        this.retryKeyframeLater();
        return;
      }
    }

    this.openPieceEvents.clear();
    try {
      // Keep the number with what was taken. Counting what happened during the compression
      // would mark those events as already in the board, and playback would skip them.
      const seq = this.seq;
      const raw = encodeReplayKeyframe(this.snapshotStore());
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

  private retryKeyframeLater(): void {
    if (this.keyframeRetryTimer !== null) return;
    this.keyframeRetryTimer = setTimeout(() => {
      this.keyframeRetryTimer = null;
      void this.captureKeyframe();
    }, REPLAY_KEYFRAME_BUSY_RETRY_MS);
  }

  private whenIdle(): Promise<void> {
    const idleCallback = globalThis.requestIdleCallback;
    if (typeof idleCallback !== 'function') return Promise.resolve();
    return new Promise<void>((resolve) => idleCallback(() => resolve(), { timeout: REPLAY_IDLE_TIMEOUT_MS }));
  }

  private snapshotStore(): ReplayObjectSnapshot[] {
    return this.objectStore.getObjects().map((object) => {
      const context = object.toContext();
      return {
        identifier: context.identifier,
        aliasName: context.aliasName,
        syncData: context.syncData as Record<string, unknown>,
      };
    });
  }

  private seedShadows(): void {
    for (const object of this.objectStore.getObjects()) {
      const owner = ownerOf(object);
      if (owner) this.partOwners.set(object.identifier, owner.identifier);
      else if (object instanceof TabletopObject) this.namesAtStart.set(object.identifier, nameOf(object));
    }
    for (const snapshot of this.snapshotStore()) {
      this.shadows.set(snapshot.identifier, cloneSyncData(snapshot.syncData));
    }
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

  private rememberActor(peerId: string): ReplayActorSnapshot {
    const cursor = PeerCursor.findByPeerId(peerId);
    const snapshot: ReplayActorSnapshot = {
      userId: cursor?.userId || peerId,
      peerId,
      name: cursor?.name ?? '',
      role: cursor?.role ?? 'pl',
      imageIdentifier: cursor?.imageIdentifier ?? '',
      sinceSeq: this.seq + 1,
    };
    const history = this.actors.get(snapshot.userId);
    if (!history) {
      this.actors.set(snapshot.userId, [snapshot]);
      return snapshot;
    }
    const latest = history[history.length - 1];
    if (
      latest.name !== snapshot.name ||
      latest.role !== snapshot.role ||
      latest.imageIdentifier !== snapshot.imageIdentifier
    ) {
      history.push(snapshot);
      return snapshot;
    }
    return latest;
  }

  private rememberTarget(identifier: string): void {
    const object = this.objectStore.get(identifier);
    if (!object) return;

    const owner = ownerOf(object);
    const snapshot: ReplayTargetSnapshot = {
      identifier,
      aliasName: object.aliasName,
      name: nameOf(object),
      ownerIdentifier: owner?.identifier,
      sinceSeq: this.seq + 1,
    };
    const history = this.targets.get(identifier);
    if (!history) {
      this.targets.set(identifier, [snapshot]);
      return;
    }
    const latest = history[history.length - 1];
    if (latest.name !== snapshot.name || latest.ownerIdentifier !== snapshot.ownerIdentifier) history.push(snapshot);
  }

  private visibilityOf(draft: ReplayDraft): ReplayVisibility {
    if (draft.kind === ReplayEventKind.ChatMessage || draft.kind === ReplayEventKind.ChatDice) {
      const to = String(draft.detail['to'] ?? '')
        .trim()
        .split(/\s+/)
        .filter((userId) => userId.length > 0);
      if (to.length > 0) return { kind: 'direct', to };
      if (String(draft.detail['tag'] ?? '').includes('secret')) return GM_ONLY_VISIBILITY;
      return PUBLIC_VISIBILITY;
    }

    const target = draft.targetIdentifier;
    const object = target ? this.objectStore.get(target) : null;
    // Taken out of the room before the word arrived, it is judged as it was last seen.
    if (!object) return (target && this.lastVisibility.get(target)) || PUBLIC_VISIBILITY;
    // A part such as a piece's HP has no disclosure of its own and is kept as its piece is.
    const holder = (isDisclosable(object) ? object : ownerOf(object)) as Disclosing | null;
    const visibility = visibilityOfDisclosure(holder?.disclosureMode, holder?.disclosureUserIds);
    if (target) this.lastVisibility.set(target, visibility);
    return visibility;
  }

  private manifest(): ReplayManifest {
    const self = this.rememberActor(this.selfPeerId());
    return {
      formatVersion: REPLAY_FORMAT_VERSION,
      roomName: this._roomName(),
      startedAt: this._startedAt(),
      endedAt: Date.now(),
      recordedBy: self,
      detailLevel: this.preference.detailLevel(),
      actors: [...this.actors.values()].flat(),
      targets: [...this.targets.values()].flat(),
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
    if (this.chunkTimer !== null) clearTimeout(this.chunkTimer);
    if (this.keyframeTimer !== null) clearInterval(this.keyframeTimer);
    if (this.publishTimer !== null) clearTimeout(this.publishTimer);
    if (this.keyframeRetryTimer !== null) clearTimeout(this.keyframeRetryTimer);
    this.chunkTimer = null;
    this.keyframeTimer = null;
    this.publishTimer = null;
    this.keyframeRetryTimer = null;
  }
}

function currentRoomName(): string {
  return Network.peerContext?.roomName ?? '';
}

interface Disclosing {
  disclosureMode?: unknown;
  disclosureUserIds?: unknown;
}

function isDisclosable(object: unknown): boolean {
  return typeof object === 'object' && object !== null && 'disclosureMode' in object;
}

function ownerOf(object: unknown): ObjectNode | null {
  if (!(object instanceof ObjectNode)) return null;
  for (let current = object.parent; current; current = current.parent) {
    if (current instanceof TabletopObject) return current;
  }
  return null;
}

function nameOf(object: unknown): string {
  if (object instanceof TabletopObject) return object.name;
  if (object instanceof DataElement) return String(object.getAttribute('name') ?? '');
  const named = object as { name?: unknown };
  return typeof named?.name === 'string' ? named.name : '';
}
