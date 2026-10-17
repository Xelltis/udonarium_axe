import { computed, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { readKeyframeBytes } from '@axe/application/replay/replay-keyframe-bytes';
import { ReplayLibraryService } from '@axe/application/replay/replay-library.service';
import { ReplayStagingService } from '@axe/application/replay/replay-staging.service';
import { MotionService } from '@axe/application/ui/motion.service';
import { Logger } from '@axe/core/logging/logger';
import { setNetworkIsolated } from '@axe/core/network/network-isolation';
import { localDispatch } from '@axe/core/network/network-messaging';
import { getPeerIds } from '@axe/core/network/peer-context-source';
import { AudioStorage } from '@axe/core/storage/audio-storage';
import { ImageStorage } from '@axe/core/storage/image-storage';
import type { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { markForChanged } from '@axe/core/sync/object-event-extension';
import { ObjectFactory } from '@axe/core/sync/object-factory';
import { DeleteHistory, ObjectStore } from '@axe/core/sync/object-store';
import { ObjectSynchronizer } from '@axe/core/sync/object-synchronizer';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { EffectPreset } from '@axe/domain/effect/effect-preset';
import { CutIn } from '@axe/domain/media/cut-in';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import type { PeerRole } from '@axe/domain/peer/peer-role';
import { collectReplayCast, type ReplayCastMember } from '@axe/domain/replay/replay-cast';
import { cloneSyncValue, isSameSyncValue, mergeSyncData, type SyncData } from '@axe/domain/replay/replay-diff';
import {
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
  type ReplayPatch,
  type ReplayTargetSnapshot,
} from '@axe/domain/replay/replay-event';
import { isShownReplayEvent } from '@axe/domain/replay/replay-event-category';
import {
  decodeReplayKeyframe,
  encodeReplayKeyframe,
  type ReplayObjectSnapshot,
} from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents, applyReplayPatch, indexOfSeq } from '@axe/domain/replay/replay-patch';
import {
  buildReplayRoute,
  easeInOut,
  pointAlongRoute,
  type ReplayRoutePoint,
  routeLength,
  toRoutePoint,
} from '@axe/domain/replay/replay-route';

export const REPLAY_SLIDE_BASE_MS = 260;
export const REPLAY_SLIDE_PER_PX_MS = 1.4;
export const REPLAY_SLIDE_MAX_MS = 1_600;
export const REPLAY_TRAIL_LINGER_MS = 900;

export interface ReplayRouteTrail {
  identifier: string;
  points: readonly ReplayRoutePoint[];
  progress: number;
}

/**
 * Takes what is still due of the table's automatic save, before a replay's board is shown in its
 * place: nothing is saved while the board is, and a reload or a leave meanwhile would lose it.
 */
export const BEFORE_BOARD_MODE = new InjectionToken<() => Promise<void>>('BEFORE_BOARD_MODE');

export const REPLAY_AUTO_PLAY_BASE_MS = 1_200;
export const REPLAY_AUTO_PLAY_MAX_MS = 4_000;
export const REPLAY_AUTO_PLAY_CUT_IN_MS = 5_000;
export const REPLAY_AUTO_PLAY_CUT_IN_MAX_MS = 30_000;
export const REPLAY_AUTO_PLAY_SETTLE_MS = 250;
export const REPLAY_AUTO_PLAY_EFFECT_MS = 900;

@Injectable({ providedIn: 'root' })
export class ReplayPlaybackService {
  private readonly library = inject(ReplayLibraryService);
  private readonly objectStore = inject(ObjectStore);
  private readonly objectFactory = inject(ObjectFactory);
  private readonly objectSynchronizer = inject(ObjectSynchronizer);
  private readonly staging = inject(ReplayStagingService);
  private readonly motion = inject(MotionService);
  private readonly beforeBoardMode = inject(BEFORE_BOARD_MODE, { optional: true });

  private readonly _recordingId = signal<number | null>(null);
  private readonly _manifest = signal<ReplayManifest | null>(null);
  private readonly _events = signal<readonly ReplayEvent[]>([]);
  private readonly _cursor = signal(-1);
  private readonly _isBoardMode = signal(false);
  private readonly _isEnteringBoardMode = signal(false);
  private readonly _isSeeking = signal(false);
  private readonly _autoPlay = signal(false);
  private readonly _routeTrail = signal<ReplayRouteTrail | null>(null);
  private readonly _cast = signal<readonly ReplayCastMember[]>([]);

  readonly recordingId = this._recordingId.asReadonly();
  readonly manifest = this._manifest.asReadonly();
  readonly events = this._events.asReadonly();
  readonly cursor = this._cursor.asReadonly();
  readonly isBoardMode = this._isBoardMode.asReadonly();
  /** Whether the board is on its way to being shown, while what is due of the table's save is taken. */
  readonly isEnteringBoardMode = this._isEnteringBoardMode.asReadonly();
  readonly isSeeking = this._isSeeking.asReadonly();
  readonly autoPlay = this._autoPlay.asReadonly();
  readonly routeTrail = this._routeTrail.asReadonly();
  readonly cast = this._cast.asReadonly();

  readonly isOpen = computed(() => this._recordingId() !== null);
  readonly currentEvent = computed(() => this._events()[this._cursor()] ?? null);
  readonly isAtStart = computed(() => this._cursor() <= 0);
  readonly isAtEnd = computed(() => this._cursor() >= this._events().length - 1);

  private savedBoard: ReplayObjectSnapshot[] | null = null;
  /** The versions the live table's objects had as the board was first shown, to be put back as they were. */
  private savedVersions: Map<string, ObjectVersion> | null = null;
  private savedDeleteHistory: DeleteHistory | null = null;
  private baseKeyframe: { seq: number; snapshots: readonly ReplayObjectSnapshot[] } | null = null;
  /**
   * What the board is showing now.
   *
   * Moving forward only needs the events since this. Rebuilding from a keyframe every time
   * would redo a whole room for every drag of the scrubber.
   */
  private appliedBoard: { index: number; snapshots: readonly ReplayObjectSnapshot[] } | null = null;
  private autoPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private seekToken = 0;
  private slideFrame: number | null = null;
  private slideEndsAt = 0;
  /** Sets the piece sliding now down where it is going, for a slide stopped before it gets there. */
  private slideFinish: (() => void) | null = null;

  /**
   * Opens a stored recording at its first event, closing whatever was open first.
   *
   * Answers false, leaving nothing open, when the recording has no events.
   */
  async open(id: number): Promise<boolean> {
    await this.close();
    const { manifest, events } = await this.library.load(id);
    if (events.length < 1) {
      Logger.warn('[ReplayPlayback] 記録が空でした', id);
      return false;
    }
    this._recordingId.set(id);
    this._manifest.set(manifest);
    this._events.set(events);
    this._cursor.set(0);
    await this.loadCast(id, events);
    return true;
  }

  /**
   * Names pieces the recording did not know, as a scene acted out on the board brings in, for the
   * lines told of them and the recording saved from the edits. One already named keeps its name.
   */
  addTargets(targets: readonly ReplayTargetSnapshot[]): void {
    const manifest = this._manifest();
    if (!manifest) return;
    const known = new Set(manifest.targets.map((target) => target.identifier));
    const added = targets.filter((target) => !known.has(target.identifier));
    if (added.length > 0) this._manifest.set({ ...manifest, targets: [...manifest.targets, ...added] });
  }

  /** Closes the recording, putting the live table back first if the board was being replayed. */
  async close(): Promise<void> {
    this.stopAutoPlay();
    if (this._isBoardMode()) await this.exitBoardMode();
    this.staging.discard();
    this.baseKeyframe = null;
    this.appliedBoard = null;
    this._recordingId.set(null);
    this._manifest.set(null);
    this._events.set([]);
    this._cursor.set(-1);
    this._cast.set([]);
  }

  private async loadCast(id: number, events: readonly ReplayEvent[]): Promise<void> {
    try {
      const keyframe = await this.library.keyframeBefore(id, events[0]?.seq ?? 0);
      if (!keyframe) return;
      const snapshots = decodeReplayKeyframe(await readKeyframeBytes(keyframe.blob));
      this._cast.set(collectReplayCast(snapshots));
    } catch (reason) {
      Logger.warn('[ReplayPlayback] 登場人物を読めませんでした', reason);
    }
  }

  /**
   * Moves to an event, clamped to the recording, and shows the board as it stood there.
   *
   * Stepping forward by one plays that event on the board as it stands, sliding a moved piece along
   * its route where motion is on; any other jump works the board out again, and so does a step taken
   * while the board is still being worked out, which would otherwise be laid over the board that is
   * on its way. The board is only touched while it is being replayed.
   */
  async seekTo(index: number): Promise<void> {
    const events = this._events();
    if (events.length < 1 || this.staging.isStaging()) return;
    const clamped = Math.max(0, Math.min(events.length - 1, index));
    const isStepForward = clamped === this._cursor() + 1;
    this._cursor.set(clamped);
    if (!this._isBoardMode()) return;

    if (isStepForward && !this._isSeeking()) {
      this.stepBoardForward(events[clamped]);
      // Advance what is shown as well; left behind, the next step back would compare against the wrong thing.
      if (this.appliedBoard) {
        this.appliedBoard = {
          index: clamped,
          snapshots: applyReplayEvents(this.appliedBoard.snapshots, [events[clamped]], { shareInput: true }),
        };
      }
      return;
    }
    await this.applyBoard(clamped);
  }

  /**
   * Works the board out afresh where the recording stands, as once a scene acted out on it has been
   * taken in or thrown away, which left the board changed where the recording did not move.
   */
  async showBoardAfresh(): Promise<void> {
    this.appliedBoard = null;
    if (this._isBoardMode()) await this.applyBoard(this._cursor());
  }

  /**
   * Steps forward to the next event this reader is shown, the board taking in those passed on the
   * way. The board is worked out up to the one before it, and the step onto it is taken as a step,
   * so that it slides and sounds as any step does. When none is left, it jumps to the end, so that
   * nothing kept from the reader slides or sounds.
   */
  async next(): Promise<void> {
    if (this.staging.isStaging()) return;
    const target = this.shownFrom(this._cursor() + 1, 1);
    if (!this.isShownAt(target)) {
      if (target <= this._cursor()) return;
      this._cursor.set(target);
      if (this._isBoardMode()) await this.applyBoard(target);
      return;
    }
    if (target > this._cursor() + 1) {
      this._cursor.set(target - 1);
      if (this._isBoardMode()) await this.applyBoard(target - 1);
    }
    await this.seekTo(target);
  }

  /** Steps back to the event this reader was shown before; to the start when there was none. */
  async previous(): Promise<void> {
    await this.seekTo(this.shownFrom(this._cursor() - 1, -1));
  }

  /** Whether the event at `index` is one this reader is shown. */
  private isShownAt(index: number): boolean {
    const event = this._events()[index];
    return event !== undefined && isShownReplayEvent(event, this.reader());
  }

  /** Who reads the recording, as its events are judged shown or not. */
  private reader(): { userId: string; role: PeerRole } {
    return { userId: PeerCursor.myCursor?.userId ?? '', role: PeerCursor.myRole };
  }

  /** The first event from `index` on, going `step`, this reader is shown, or the end reached. */
  private shownFrom(index: number, step: 1 | -1): number {
    const events = this._events();
    const viewer = this.reader();
    for (let at = index; at >= 0 && at < events.length; at += step) {
      if (isShownReplayEvent(events[at], viewer)) return at;
    }
    return step > 0 ? events.length - 1 : 0;
  }

  /** Jumps to the first event. */
  async toStart(): Promise<void> {
    await this.seekTo(0);
  }

  /** Jumps to the last event. */
  async toEnd(): Promise<void> {
    await this.seekTo(this._events().length - 1);
  }

  /**
   * Starts or stops stepping through the recording on its own.
   *
   * Each step waits long enough to read the line, or for a cut-in, effect or slide to finish. It
   * does not start at the last event, and stops when it reaches it.
   */
  toggleAutoPlay(): void {
    if (this._autoPlay()) {
      this.stopAutoPlay();
      return;
    }
    if (this.isAtEnd() || this.staging.isStaging()) return;
    this._autoPlay.set(true);
    this.scheduleAutoPlay();
  }

  /** Stops stepping on its own, leaving the recording where it is. */
  stopAutoPlay(): void {
    this._autoPlay.set(false);
    if (this.autoPlayTimer === null) return;
    clearTimeout(this.autoPlayTimer);
    this.autoPlayTimer = null;
  }

  /**
   * Replays the recording on the table itself, from the current event.
   *
   * The live table is kept aside and this reader is cut off from the room while it runs, so nothing
   * shown reaches the other peers. What is due of the table's automatic save is taken first. Answers
   * false when already replaying or on the way to, when nothing is open, or when another recording
   * was opened while the save was taken, whose board was not asked for.
   */
  async enterBoardMode(): Promise<boolean> {
    if (this._isBoardMode() || this._isEnteringBoardMode() || !this.isOpen()) return false;
    const recordingId = this._recordingId();
    this._isEnteringBoardMode.set(true);
    try {
      await this.beforeBoardMode?.();
    } catch (reason) {
      Logger.warn('[ReplayPlayback] 盤面を映す前の保存に失敗しました', reason);
    } finally {
      this._isEnteringBoardMode.set(false);
    }
    if (this._isBoardMode() || !this.isOpen() || this._recordingId() !== recordingId) return false;
    this.savedBoard = this.snapshotBoard();
    this.savedVersions = new Map(
      this.objectStore
        .getObjects()
        .map((object) => [object.identifier, { major: object.majorVersion, minor: object.minorVersion }])
    );
    this.savedDeleteHistory = this.objectStore.snapshotDeleteHistory();
    setNetworkIsolated(true);
    this._isBoardMode.set(true);
    await this.applyBoard(this._cursor());
    return this._isBoardMode();
  }

  /**
   * Puts the live table back, rejoins the room and asks the peers for everything that changed meanwhile.
   * A board still being worked out is dropped, and the table comes back at the versions it had, so
   * what a peer changed meanwhile is what the room keeps. The notices of what putting the table back
   * changed go out before it rejoins the room, as part of the replay, which nothing saves or records,
   * rather than as changes made to the table.
   */
  async exitBoardMode(): Promise<void> {
    if (!this._isBoardMode()) return;
    this.seekToken++;
    this._isSeeking.set(false);
    this.staging.discard();
    this.stopAutoPlay();
    this.stopSlide();
    this._isBoardMode.set(false);
    try {
      if (this.savedBoard) this.restoreBoard(this.stillHere(this.savedBoard), this.savedVersions);
    } catch (reason) {
      Logger.warn('[ReplayPlayback] 卓を戻しきれませんでした', reason);
    } finally {
      this.savedBoard = null;
      this.savedVersions = null;
      this.baseKeyframe = null;
      this.appliedBoard = null;
      this.objectStore.replaceDeleteHistory(this.savedDeleteHistory);
      this.savedDeleteHistory = null;
    }
    await Promise.resolve();
    setNetworkIsolated(false);
    this.objectSynchronizer.requestFullSync();
    ImageStorage.instance.synchronize();
    AudioStorage.instance.synchronize();
  }

  /**
   * The live table as it was kept, without the cursors of those gone from the room since: put back,
   * they would never be cleared away, as what clears a cursor away was let go with it.
   */
  private stillHere(snapshots: readonly ReplayObjectSnapshot[]): ReplayObjectSnapshot[] {
    const linked = new Set(getPeerIds());
    const mine = PeerCursor.myCursor?.identifier;
    return snapshots.filter(
      (snapshot) =>
        snapshot.aliasName !== PeerCursor.aliasName ||
        snapshot.identifier === mine ||
        linked.has(String(snapshot.syncData['peerId'] ?? ''))
    );
  }

  private scheduleAutoPlay(): void {
    if (this.autoPlayTimer !== null) clearTimeout(this.autoPlayTimer);
    const wait = this.autoPlayWaitFor(this.currentEvent());
    this.autoPlayTimer = setTimeout(() => {
      this.autoPlayTimer = null;
      if (!this._autoPlay()) return;
      if (this.isAtEnd()) {
        this.stopAutoPlay();
        return;
      }
      void this.next().then(() => {
        if (this._autoPlay()) this.scheduleAutoPlay();
      });
    }, wait);
  }

  private autoPlayWaitFor(event: ReplayEvent | null): number {
    const reading = this.readingWaitFor(String(event?.detail['text'] ?? ''));
    if (!event || !this._isBoardMode()) return reading;

    if (event.kind === ReplayEventKind.MediaCutIn && event.detail['isStart'] === true) {
      return Math.max(reading, this.cutInWaitFor(event));
    }
    if (event.kind === ReplayEventKind.EffectCast) {
      return Math.max(reading, this.effectWaitFor(event));
    }
    if (event.kind === ReplayEventKind.VnPlayhead) {
      return this.readingWaitFor(this.playheadText(event));
    }
    if (event.kind === ReplayEventKind.ObjectMove) {
      return Math.max(reading, this.slideRemainingMs() + REPLAY_AUTO_PLAY_SETTLE_MS);
    }
    return reading;
  }

  private readingWaitFor(text: string): number {
    return Math.min(REPLAY_AUTO_PLAY_MAX_MS, REPLAY_AUTO_PLAY_BASE_MS + text.length * 35);
  }

  private playheadText(event: ReplayEvent): string {
    const message = event.targetId ? this.objectStore.get<ChatMessage>(event.targetId) : null;
    return message instanceof ChatMessage ? message.text : '';
  }

  private cutInWaitFor(event: ReplayEvent): number {
    const cutIn = event.targetId ? this.objectStore.get<CutIn>(event.targetId) : null;
    const seconds = Number(cutIn?.outTime ?? 0);
    if (!Number.isFinite(seconds) || seconds <= 0) return REPLAY_AUTO_PLAY_CUT_IN_MS;
    return Math.min(REPLAY_AUTO_PLAY_CUT_IN_MAX_MS, seconds * 1000);
  }

  private effectWaitFor(event: ReplayEvent): number {
    const preset = event.targetId ? this.objectStore.get<EffectPreset>(event.targetId) : null;
    if (!preset) return REPLAY_AUTO_PLAY_EFFECT_MS;

    const targets = Array.isArray(event.detail['targets']) ? event.detail['targets'].length : 1;
    const total = preset.duration + preset.stagger * Math.max(0, targets - 1);
    return Math.min(REPLAY_AUTO_PLAY_CUT_IN_MAX_MS, Math.max(total, REPLAY_AUTO_PLAY_EFFECT_MS));
  }

  private slideRemainingMs(): number {
    return Math.max(0, this.slideEndsAt - performance.now());
  }

  private async applyBoard(index: number): Promise<void> {
    const id = this._recordingId();
    const events = this._events();
    if (id == null || events.length < 1) return;

    const token = ++this.seekToken;
    this._isSeeking.set(true);
    try {
      const applied = this.appliedBoard;
      if (applied && applied.index <= index) {
        this.stopSlide();
        this.showBoard(
          index,
          applyReplayEvents(applied.snapshots, events.slice(applied.index + 1, index + 1), { shareInput: true })
        );
        return;
      }

      const targetSeq = events[index].seq;
      const keyframe = await this.library.keyframeBefore(id, targetSeq);
      if (token !== this.seekToken || !this._isBoardMode()) return;

      const base = await this.baseSnapshotsOf(keyframe);
      if (token !== this.seekToken || !this._isBoardMode()) return;

      const from = keyframe ? indexOfSeq(events, keyframe.seq) : -1;
      this.stopSlide();
      this.showBoard(index, applyReplayEvents(base, events.slice(from + 1, index + 1), { shareInput: true }));
    } catch (reason) {
      Logger.warn('[ReplayPlayback] 盤面の再生に失敗しました', reason);
    } finally {
      if (token === this.seekToken) this._isSeeking.set(false);
    }
  }

  private async baseSnapshotsOf(
    keyframe: { seq: number; blob: Blob } | null
  ): Promise<readonly ReplayObjectSnapshot[]> {
    if (!keyframe) return [];
    if (this.baseKeyframe?.seq === keyframe.seq) return this.baseKeyframe.snapshots;
    const snapshots = decodeReplayKeyframe(await readKeyframeBytes(keyframe.blob));
    this.baseKeyframe = { seq: keyframe.seq, snapshots };
    return snapshots;
  }

  private stepBoardForward(event: ReplayEvent): void {
    this.stopSlide();
    if (event.kind === ReplayEventKind.ObjectMove && this.startSlide(event)) {
      if (event.signal) localDispatch(event.signal.name, event.signal.data);
      return;
    }
    if (event.kind === ReplayEventKind.ObjectRemove) {
      for (const identifier of [event.targetId, ...(event.removedParts ?? [])]) {
        const object = identifier ? this.objectStore.get(identifier) : null;
        if (object) this.objectStore.remove(object);
      }
    } else {
      for (const patch of [event.patch, ...(event.parts ?? [])]) {
        if (patch) this.layPatch(patch);
      }
    }
    if (event.signal) localDispatch(event.signal.name, event.signal.data);
  }

  /** Lays a recorded change onto the board: onto the object where it is showing, or as a new one. */
  private layPatch(patch: ReplayPatch): void {
    const existing = this.objectStore.get(patch.identifier);
    if (existing) {
      this.reviveObject(existing, applyReplayPatch(existing.toContext().syncData as SyncData, patch));
      return;
    }
    this.createObject({
      identifier: patch.identifier,
      aliasName: patch.aliasName,
      syncData: applyReplayPatch(null, patch),
    });
  }

  private startSlide(event: ReplayEvent): boolean {
    if (!event.patch || !this.motion.enabled()) return false;
    const object = this.objectStore.get(event.patch.identifier);
    if (!object) return false;

    const path = Array.isArray(event.detail['path']) ? (event.detail['path'] as ReplayRoutePoint[]) : [];
    const points = buildReplayRoute(
      toRoutePoint(event.detail['from']),
      path.map(toRoutePoint),
      toRoutePoint(event.detail['to'])
    );
    const length = routeLength(points);
    if (points.length < 2 || length <= 0) return false;

    const syncData = applyReplayPatch(object.toContext().syncData as SyncData, event.patch);
    const duration = Math.min(REPLAY_SLIDE_MAX_MS, REPLAY_SLIDE_BASE_MS + length * REPLAY_SLIDE_PER_PX_MS);
    const startedAt = performance.now();
    this.slideEndsAt = startedAt + duration;

    const tick = (): void => {
      const progress = Math.min(1, (performance.now() - startedAt) / duration);
      const at = pointAlongRoute(points, easeInOut(progress));
      this.reviveObject(object, placeAt(syncData, at));
      this._routeTrail.set({ identifier: object.identifier, points, progress });

      if (progress >= 1) {
        this.slideFrame = null;
        this.slideFinish = null;
        this.reviveObject(object, syncData);
        this.fadeTrail();
        return;
      }
      this.slideFrame = requestAnimationFrame(tick);
    };

    this._routeTrail.set({ identifier: object.identifier, points, progress: 0 });
    this.slideFinish = () => {
      if (this.objectStore.get(object.identifier) === object) this.reviveObject(object, syncData);
    };
    this.slideFrame = requestAnimationFrame(tick);
    return true;
  }

  /**
   * Stops a slide under way and sets the piece down where it was going, as the board shown already
   * has it there; left partway, nothing would ever move it on, as what is shown next is told only
   * what changed since.
   */
  private stopSlide(): void {
    this.slideEndsAt = 0;
    if (this.slideFrame === null) return;
    cancelAnimationFrame(this.slideFrame);
    this.slideFrame = null;
    this._routeTrail.set(null);
    const finish = this.slideFinish;
    this.slideFinish = null;
    finish?.();
  }

  private fadeTrail(): void {
    const shown = this._routeTrail();
    setTimeout(() => {
      if (this._routeTrail() === shown) this._routeTrail.set(null);
    }, REPLAY_TRAIL_LINGER_MS);
  }

  /**
   * Gives an object a board's state, under a newer version than it has, or under the version it is
   * given, as the live table's own when it comes back.
   */
  private reviveObject(object: GameObject, syncData: Record<string, unknown>, version?: ObjectVersion): void {
    object.apply({
      aliasName: object.aliasName,
      identifier: object.identifier,
      majorVersion: version ? version.major : object.majorVersion + 1,
      minorVersion: version ? version.minor : 0,
      syncData,
    });
    markForChanged(object);
  }

  /**
   * Puts an object of a board back. This seat's own cursor is put back as the very cursor the seat
   * holds, which a copy under its identifier would leave the seat without.
   */
  private createObject(snapshot: ReplayObjectSnapshot, version?: ObjectVersion): void {
    const mine = PeerCursor.myCursor;
    const object =
      mine && snapshot.identifier === mine.identifier
        ? mine
        : this.objectFactory.create(snapshot.aliasName, snapshot.identifier);
    if (!object) return;
    const context: ObjectContext = {
      identifier: snapshot.identifier,
      aliasName: snapshot.aliasName,
      majorVersion: version?.major ?? 1,
      minorVersion: version?.minor ?? 0,
      // A snapshot also feeds the next scene, so handing a live object the reference would let a later edit corrupt it.
      syncData: cloneSyncValue(mergeSyncData(object.toContext().syncData as SyncData, snapshot.syncData)) as SyncData,
    };
    this.objectStore.add(object, false, () => object.apply(context));
    markForChanged(object);
  }

  private snapshotBoard(): ReplayObjectSnapshot[] {
    return decodeReplayKeyframe(
      encodeReplayKeyframe(
        this.objectStore.getObjects().map((object) => {
          const context = object.toContext();
          return {
            identifier: context.identifier,
            aliasName: context.aliasName,
            syncData: context.syncData as Record<string, unknown>,
          };
        })
      )
    );
  }

  private showBoard(index: number, snapshots: readonly ReplayObjectSnapshot[]): void {
    try {
      this.restoreBoard(snapshots);
      this.appliedBoard = { index, snapshots };
    } catch (reason) {
      // Remembering a board that never fully arrived would leave the next comparison built on it.
      this.appliedBoard = null;
      throw reason;
    }
  }

  /**
   * Shows the board again.
   *
   * It compares against what is showing and touches only what changed. Rebuilding the whole
   * room for one step back sends the screen off to redraw all of it.
   */
  private restoreBoard(
    snapshots: readonly ReplayObjectSnapshot[],
    versions: ReadonlyMap<string, ObjectVersion> | null = null
  ): void {
    const wanted = new Map(snapshots.map((snapshot) => [snapshot.identifier, snapshot]));
    for (const object of this.objectStore.getObjects()) {
      if (!wanted.has(object.identifier)) this.objectStore.remove(object);
    }
    this.objectStore.clearDeleteHistory();

    const shown = this.appliedBoard?.snapshots;
    const before = shown ? new Map(shown.map((snapshot) => [snapshot.identifier, snapshot])) : null;

    for (const snapshot of snapshots) {
      const existing = this.objectStore.get(snapshot.identifier);
      const version = versions?.get(snapshot.identifier);
      if (!existing) {
        this.createObject(snapshot, version);
        continue;
      }
      const previous = before?.get(snapshot.identifier);
      if (!version && previous && isSameSyncValue(previous.syncData, snapshot.syncData)) continue;
      this.reviveObject(existing, cloneSyncValue(snapshot.syncData) as Record<string, unknown>, version);
    }
  }
}

/** An object's version, as it is kept to be put back. */
interface ObjectVersion {
  major: number;
  minor: number;
}

function placeAt(syncData: Record<string, unknown>, at: ReplayRoutePoint): Record<string, unknown> {
  const attributes = { ...((syncData['attributes'] ?? {}) as Record<string, unknown>) };
  const location = { ...((attributes['location'] ?? {}) as Record<string, unknown>), x: at.x, y: at.y };
  attributes['location'] = location;
  attributes['posZ'] = at.z;
  return { ...syncData, attributes };
}
