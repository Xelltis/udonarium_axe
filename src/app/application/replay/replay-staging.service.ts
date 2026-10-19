import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { pieceOf, targetNameOf } from '@axe/application/replay/replay-piece';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import type { GameObject, ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { ChatTab } from '@axe/domain/chat/chat-tab';
import { canMergeReplayEvents, mergeReplayEvents } from '@axe/domain/replay/replay-coalescer';
import { cloneSyncData, type SyncData } from '@axe/domain/replay/replay-diff';
import {
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayTargetSnapshot,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { REPLAY_PART_FLAG } from '@axe/domain/replay/replay-event-category';
import {
  interpretObjectChange,
  interpretObjectRemove,
  interpretSignal,
  isIgnoredReplayEvent,
  type ReplayDraft,
} from '@axe/domain/replay/replay-interpreter';
import {
  visibilityOfChatLine,
  visibilityOfDisclosure,
  visibilityOfSyncData,
} from '@axe/domain/replay/replay-visibility';

/** What a piece keeps to some, as the recorder reads it. */
interface Disclosing {
  disclosureMode?: unknown;
  disclosureUserIds?: unknown;
}

@Injectable({ providedIn: 'root' })
export class ReplayStagingService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);

  private readonly _isStaging = signal(false);
  private readonly _captured = signal<readonly ReplayEvent[]>([]);
  private readonly _actorId = signal('');
  private readonly _insertIndex = signal(0);
  private readonly _afterSeq = signal<number | null>(null);

  readonly isStaging = this._isStaging.asReadonly();
  readonly captured = this._captured.asReadonly();
  readonly actorId = this._actorId.asReadonly();
  readonly insertIndex = this._insertIndex.asReadonly();
  /** The sequence number of the row the scene goes after, wherever it stands by then; null for the start. */
  readonly afterSeq = this._afterSeq.asReadonly();

  private readonly shadows = new Map<string, SyncData>();
  /** For each part of a piece on the board, the piece it belongs to, as far as is known. */
  private readonly partOwners = new Map<string, string>();
  /** The arrival or removal of a piece just captured, by the piece, open for its parts. */
  private readonly openPieces = new Map<string, number>();
  /** Who could see each object as last judged, for its removal once the board has let it go. */
  private readonly lastVisibility = new Map<string, ReplayVisibility>();
  /** What was captured of, with what it was called and the piece it was part of. */
  private readonly touched = new Map<string, ReplayTargetSnapshot>();
  /** What the pieces on the board were called when capturing began, for those taken away. */
  private readonly namesAtStart = new Map<string, ReplayTargetSnapshot>();
  /** What this reader did in the action under way, taken in once it is over. */
  private queued: { eventName: string; data: unknown; at: number }[] = [];
  private pending: ReplayEvent | null = null;
  private seq = 0;
  private originAt = 0;

  constructor() {
    networkMessage$.subscribe((message) => {
      if (!this._isStaging() || !message.isSendFromSelf) return;
      this.queued.push({ eventName: message.eventName, data: message.data, at: Date.now() });
      if (this.queued.length === 1) queueMicrotask(() => this.drain());
    }, this.destroyRef);
  }

  /**
   * Takes in what this reader did, once the action that did it is over. Cut off from the room,
   * each change comes at once, and a piece made with its parts makes each part before putting it
   * under the piece; taken a step later, as the recorder takes the room's, a part is seen in its
   * piece. Something that came onto the board in the step is taken once, as it was at the end of it.
   */
  private drain(): void {
    const batch = this.queued;
    this.queued = [];
    if (!this._isStaging()) return;
    const first = new Map<string, number>();
    const last = new Map<string, number>();
    const removed = new Set<string>();
    batch.forEach((message, index) => {
      const identifier = (message.data as { identifier?: unknown } | null)?.identifier;
      if (typeof identifier !== 'string') return;
      if (message.eventName === 'DELETE_GAME_OBJECT') removed.add(identifier);
      if (message.eventName !== 'UPDATE_GAME_OBJECT' || removed.has(identifier)) return;
      if (!first.has(identifier)) {
        if (this.shadows.has(identifier)) return;
        first.set(identifier, index);
      }
      last.set(identifier, index);
    });
    batch.forEach((message, index) => {
      const identifier = (message.data as { identifier?: unknown } | null)?.identifier;
      const from = typeof identifier === 'string' ? first.get(identifier) : undefined;
      if (from !== undefined && message.eventName === 'UPDATE_GAME_OBJECT') {
        const to = last.get(identifier as string) as number;
        if (index === from) return this.handleMessage(message.eventName, batch[to].data, message.at);
        if (index <= to) return;
      }
      this.handleMessage(message.eventName, message.data, message.at);
    });
  }

  /**
   * Starts capturing what this reader does on the replayed board, as events to insert at a row.
   *
   * Only this reader's own changes are captured, and only while cut off from the room, so a scene
   * can be acted out on the board and added to a recording as though `actorId` had done it. It goes
   * after the row `afterSeq` names, or at `insertIndex` should that row be gone by then.
   */
  begin(insertIndex: number, actorId: string, afterSeq: number | null = null): void {
    if (!isNetworkIsolated()) return;
    this.shadows.clear();
    this.partOwners.clear();
    for (const object of this.objectStore.getObjects()) {
      this.shadows.set(object.identifier, cloneSyncData(object.toContext().syncData as SyncData));
      const piece = pieceOf(object);
      if (piece) this.partOwners.set(object.identifier, piece.identifier);
      this.namesAtStart.set(object.identifier, this.snapshotOf(object));
    }
    this.pending = null;
    this.seq = 0;
    this.originAt = Date.now();
    this._insertIndex.set(insertIndex);
    this._afterSeq.set(afterSeq);
    this._actorId.set(actorId);
    this._captured.set([]);
    this._isStaging.set(true);
  }

  /** Credits everything captured so far, and everything after, to another peer. */
  setActorId(actorId: string): void {
    this._actorId.set(actorId);
    this._captured.update((events) => events.map((event) => ({ ...event, actorId })));
    if (this.pending) this.pending = { ...this.pending, actorId };
  }

  /**
   * Names what was captured of, pieces and their parts, as they are called now or were when last
   * seen, for the lines told of them once the events are inserted.
   */
  stagedTargets(): ReplayTargetSnapshot[] {
    return [...this.touched.values()].map((target) => {
      const object = this.objectStore.get(target.identifier);
      return object ? this.snapshotOf(object) : target;
    });
  }

  /** Remembers what an event is about, called as it is now or, once gone, as it was at the start. */
  private rememberTarget(identifier: string | undefined): void {
    if (!identifier || this.touched.has(identifier)) return;
    const object = this.objectStore.get(identifier);
    const snapshot = object ? this.snapshotOf(object) : this.namesAtStart.get(identifier);
    if (snapshot) this.touched.set(identifier, snapshot);
  }

  private snapshotOf(object: GameObject): ReplayTargetSnapshot {
    const piece = pieceOf(object);
    return {
      identifier: object.identifier,
      aliasName: object.aliasName,
      name: targetNameOf(object),
      ...(piece ? { ownerIdentifier: piece.identifier } : {}),
      sinceSeq: 0,
    };
  }

  /** Hands over what was captured and stops capturing. */
  take(): ReplayEvent[] {
    this.drain();
    this.commitPending();
    const captured = [...this._captured()];
    this.end();
    return captured;
  }

  /** Stops capturing and throws away what was captured. */
  discard(): void {
    this.end();
  }

  private end(): void {
    this._isStaging.set(false);
    this._captured.set([]);
    this.pending = null;
    this.queued = [];
    this.shadows.clear();
    this.partOwners.clear();
    this.openPieces.clear();
    this.touched.clear();
    this.namesAtStart.clear();
    this.lastVisibility.clear();
  }

  private handleMessage(eventName: string, data: unknown, at: number): void {
    if (!isNetworkIsolated() || isIgnoredReplayEvent(eventName)) return;

    if (eventName === 'UPDATE_GAME_OBJECT') {
      const context = data as ObjectContext;
      if (!context?.identifier) return;
      const after = context.syncData as SyncData;
      const before = this.shadows.get(context.identifier) ?? null;
      this.shadows.set(context.identifier, cloneSyncData(after));
      if (before && before['parentIdentifier'] !== after['parentIdentifier']) this.notePartOwner(context.identifier);

      const draft = interpretObjectChange({
        aliasName: context.aliasName,
        identifier: context.identifier,
        before,
        after,
      });
      if (!draft) return;
      if (!before && this.notePart(context.identifier, after, draft)) {
        const patch = draft.patch;
        const folded =
          patch &&
          this.fold(this.partOwners.get(context.identifier), ReplayEventKind.ObjectCreate, (event) => ({
            ...event,
            parts: [...(event.parts ?? []), patch],
          }));
        if (folded) return;
      }
      this.push(draft, at);
      return;
    }

    if (eventName === 'DELETE_GAME_OBJECT') {
      const context = data as { identifier: string; aliasName: string };
      const owner = this.partOwners.get(context.identifier);
      this.noteRemovedVisibility(context.identifier, owner);
      this.shadows.delete(context.identifier);
      this.partOwners.delete(context.identifier);
      const folded =
        owner !== undefined &&
        this.fold(owner, ReplayEventKind.ObjectRemove, (event) => ({
          ...event,
          removedParts: [...(event.removedParts ?? []), context.identifier],
        }));
      if (folded) return;
      const draft = interpretObjectRemove(context.identifier, context.aliasName);
      if (owner !== undefined) draft.detail[REPLAY_PART_FLAG] = true;
      this.push(draft, at);
      return;
    }

    const draft = interpretSignal(eventName, data);
    if (draft) this.push(draft, at);
  }

  private push(draft: ReplayDraft, at: number): void {
    this.rememberTarget(draft.targetIdentifier);
    for (const identifier of draft.relatedIdentifiers ?? []) this.rememberTarget(identifier);
    const event: ReplayEvent = {
      seq: ++this.seq,
      at,
      t: at - this.originAt,
      kind: draft.kind,
      actorId: this._actorId(),
      targetId: draft.targetIdentifier,
      detail: draft.detail,
      patch: draft.patch,
      signal: draft.signal,
      visibility: this.visibilityOf(draft),
    };

    if (this.pending && canMergeReplayEvents(this.pending, event)) {
      this.seq--;
      this.pending = mergeReplayEvents(this.pending, event);
      this.publishPending();
      return;
    }

    this.commitPending();
    this.pending = event;
    this.openPieces.clear();
    this.openIfPiece(event);
    this.publishPending();
  }

  /**
   * Flags a part of a piece arriving, so it is not told as an arrival of its own, and notes its
   * piece. A part whose parent has not come yet counts too, as the recorder takes it.
   */
  private notePart(identifier: string, after: SyncData, draft: ReplayDraft): boolean {
    const parent = after['parentIdentifier'];
    const awaitsParent = typeof parent === 'string' && parent.length > 0 && !this.shadows.has(parent);
    const piece = pieceOf(this.objectStore.get(identifier));
    if (!piece && !awaitsParent) return false;
    this.partOwners.set(identifier, piece?.identifier ?? '');
    draft.detail[REPLAY_PART_FLAG] = true;
    return true;
  }

  /** Keeps up with the piece an object belongs to once it has moved, as a card drawn from its deck. */
  private notePartOwner(identifier: string): void {
    const piece = pieceOf(this.objectStore.get(identifier));
    if (piece) this.partOwners.set(identifier, piece.identifier);
    else this.partOwners.delete(identifier);
  }

  /**
   * Folds a part's arrival or removal into its piece's, when that was just captured, so a piece
   * brought in or taken away with its many parts is one event. Answers whether it was folded.
   */
  private fold(piece: string | undefined, kind: ReplayEventKind, change: (event: ReplayEvent) => ReplayEvent): boolean {
    const seq = piece ? this.openPieces.get(piece) : undefined;
    const event = seq === undefined ? undefined : this._captured().find((captured) => captured.seq === seq);
    if (!event || event.kind !== kind) return false;
    const folded = change(event);
    if (this.pending?.seq === seq) this.pending = folded;
    this._captured.update((events) => events.map((captured) => (captured.seq === seq ? folded : captured)));
    return true;
  }

  /** Keeps a piece's arrival or removal open for its parts. */
  private openIfPiece(event: ReplayEvent): void {
    if (event.kind !== ReplayEventKind.ObjectCreate && event.kind !== ReplayEventKind.ObjectRemove) return;
    if (!event.targetId || event.detail[REPLAY_PART_FLAG] === true) return;
    this.openPieces.set(event.targetId, event.seq);
  }

  private publishPending(): void {
    const pending = this.pending;
    if (!pending) return;
    this._captured.update((events) => {
      const next = events.slice();
      if (next.length > 0 && next[next.length - 1].seq === pending.seq) next[next.length - 1] = pending;
      else next.push(pending);
      return next;
    });
  }

  private commitPending(): void {
    this.pending = null;
  }

  private visibilityOf(draft: ReplayDraft): ReplayVisibility {
    if (draft.kind === ReplayEventKind.ChatMessage || draft.kind === ReplayEventKind.ChatDice) {
      const tab = this.objectStore.get(String(draft.detail['tabIdentifier'] ?? ''));
      return visibilityOfChatLine(draft.detail, tab instanceof ChatTab ? tab : null);
    }

    const target = draft.targetIdentifier;
    const object = target ? this.objectStore.get(target) : null;
    // Taken off the board before the word came, it is judged as it was last seen, as the recorder does.
    if (!object) return (target && this.lastVisibility.get(target)) || PUBLIC_VISIBILITY;
    // A part such as a piece's HP has no disclosure of its own and is kept as its piece is.
    const holder = ('disclosureMode' in object ? object : pieceOf(object)) as Disclosing | null;
    const visibility = visibilityOfDisclosure(holder?.disclosureMode, holder?.disclosureUserIds);
    if (target) this.lastVisibility.set(target, visibility);
    return visibility;
  }

  /**
   * Keeps who could see an object taken off the board, from its last state or its piece's, before
   * that is let go: its removal is judged by it, as the store has let it go by then.
   */
  private noteRemovedVisibility(identifier: string, owner: string | undefined): void {
    const holder = owner || identifier;
    const shadow = this.shadows.get(holder);
    const visibility = shadow ? visibilityOfSyncData(shadow) : this.lastVisibility.get(holder);
    if (visibility) this.lastVisibility.set(identifier, visibility);
  }
}
