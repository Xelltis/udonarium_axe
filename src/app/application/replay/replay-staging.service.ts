import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { isNetworkIsolated } from '@axe/core/network/network-isolation';
import { networkMessage$ } from '@axe/core/network/network-messaging';
import type { ObjectContext } from '@axe/core/sync/game-object';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DisclosureMode } from '@axe/domain/disclosure/disclosure';
import { canMergeReplayEvents, mergeReplayEvents } from '@axe/domain/replay/replay-coalescer';
import { cloneSyncData, type SyncData } from '@axe/domain/replay/replay-diff';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import {
  interpretObjectChange,
  interpretObjectRemove,
  interpretSignal,
  isIgnoredReplayEvent,
  type ReplayDraft,
} from '@axe/domain/replay/replay-interpreter';

@Injectable({ providedIn: 'root' })
export class ReplayStagingService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly objectStore = inject(ObjectStore);

  private readonly _isStaging = signal(false);
  private readonly _captured = signal<readonly ReplayEvent[]>([]);
  private readonly _actorId = signal('');
  private readonly _insertIndex = signal(0);

  readonly isStaging = this._isStaging.asReadonly();
  readonly captured = this._captured.asReadonly();
  readonly actorId = this._actorId.asReadonly();
  readonly insertIndex = this._insertIndex.asReadonly();

  private readonly shadows = new Map<string, SyncData>();
  private pending: ReplayEvent | null = null;
  private seq = 0;
  private originAt = 0;

  constructor() {
    networkMessage$.subscribe((message) => {
      if (!this._isStaging() || !message.isSendFromSelf) return;
      this.handleMessage(message.eventName, message.data, Date.now());
    }, this.destroyRef);
  }

  /**
   * Starts capturing what this reader does on the replayed board, as events to insert at a row.
   *
   * Only this reader's own changes are captured, and only while cut off from the room, so a scene
   * can be acted out on the board and added to a recording as though `actorId` had done it.
   */
  begin(insertIndex: number, actorId: string): void {
    this.shadows.clear();
    for (const object of this.objectStore.getObjects()) {
      this.shadows.set(object.identifier, cloneSyncData(object.toContext().syncData as SyncData));
    }
    this.pending = null;
    this.seq = 0;
    this.originAt = Date.now();
    this._insertIndex.set(insertIndex);
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

  /** Hands over what was captured and stops capturing. */
  take(): ReplayEvent[] {
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
    this.shadows.clear();
  }

  private handleMessage(eventName: string, data: unknown, at: number): void {
    if (!isNetworkIsolated() || isIgnoredReplayEvent(eventName)) return;

    if (eventName === 'UPDATE_GAME_OBJECT') {
      const context = data as ObjectContext;
      if (!context?.identifier) return;
      const after = context.syncData as SyncData;
      const before = this.shadows.get(context.identifier) ?? null;
      this.shadows.set(context.identifier, cloneSyncData(after));

      const draft = interpretObjectChange({
        aliasName: context.aliasName,
        identifier: context.identifier,
        before,
        after,
      });
      if (draft) this.push(draft, at);
      return;
    }

    if (eventName === 'DELETE_GAME_OBJECT') {
      const context = data as { identifier: string; aliasName: string };
      this.shadows.delete(context.identifier);
      this.push(interpretObjectRemove(context.identifier, context.aliasName), at);
      return;
    }

    const draft = interpretSignal(eventName, data);
    if (draft) this.push(draft, at);
  }

  private push(draft: ReplayDraft, at: number): void {
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
    this.publishPending();
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
      const to = String(draft.detail['to'] ?? '')
        .trim()
        .split(/\s+/)
        .filter((userId) => userId.length > 0);
      if (to.length > 0) return { kind: 'direct', to };
      if (String(draft.detail['tag'] ?? '').includes('secret')) return GM_ONLY_VISIBILITY;
      return PUBLIC_VISIBILITY;
    }

    const object = draft.targetIdentifier ? this.objectStore.get(draft.targetIdentifier) : null;
    const disclosable = object as { disclosureMode?: unknown } | null;
    if (disclosable?.disclosureMode === DisclosureMode.GameMaster) return GM_ONLY_VISIBILITY;
    return PUBLIC_VISIBILITY;
  }
}
