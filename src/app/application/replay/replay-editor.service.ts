import { computed, inject, Injectable, signal } from '@angular/core';
import { Logger } from '@axe/core/logging/logger';
import { ReplayLogStore } from '@axe/core/storage/replay-log-store';
import { encodeReplayEvents, encodeReplayManifest } from '@axe/domain/replay/replay-codec';
import {
  createReplayEntry,
  hasReplayEdits,
  insertReplayEvent,
  insertReplayEvents,
  insertTimeAt,
  moveReplayEvent,
  nextInsertSeq,
  removeReplayEvent,
  type ReplayEntryDraft,
  replaySeqRemap,
  resequenceReplayEvents,
  retextReplayEvent,
} from '@axe/domain/replay/replay-edit';
import { REPLAY_FORMAT_VERSION, type ReplayEvent, type ReplayManifest } from '@axe/domain/replay/replay-event';
import { encodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents } from '@axe/domain/replay/replay-patch';

export const REPLAY_HISTORY_LIMIT = 100;
export const REPLAY_DERIVED_CHUNK_SIZE = 500;
export const REPLAY_DERIVED_KEYFRAME_STRIDE = 200;

@Injectable({ providedIn: 'root' })
export class ReplayEditorService {
  private readonly store = inject(ReplayLogStore);

  private readonly _original = signal<readonly ReplayEvent[]>([]);
  private readonly _edited = signal<readonly ReplayEvent[]>([]);
  private readonly _isEditing = signal(false);
  private readonly _isSaving = signal(false);
  private readonly _history = signal<readonly (readonly ReplayEvent[])[]>([]);

  readonly edited = this._edited.asReadonly();
  readonly isEditing = this._isEditing.asReadonly();
  readonly isSaving = this._isSaving.asReadonly();
  readonly isDirty = computed(() => hasReplayEdits(this._original(), this._edited()));
  /** The list asks about every row, and sweeping each time would cost the square of the row count. */
  private readonly originalSeqs = computed(() => new Set(this._original().map((event) => event.seq)));
  readonly canUndo = computed(() => this._history().length > 0);

  /** Starts editing a recording's events, with an empty undo history. */
  begin(events: readonly ReplayEvent[]): void {
    this._original.set([...events]);
    this._edited.set([...events]);
    this._history.set([]);
    this._isEditing.set(true);
  }

  /** Puts the events back as they were before the last change. Only the last 100 changes can be undone. */
  undo(): void {
    const history = this._history();
    const previous = history[history.length - 1];
    if (!previous) return;
    this._history.set(history.slice(0, -1));
    this._edited.set(previous);
  }

  private change(mutate: (events: readonly ReplayEvent[]) => readonly ReplayEvent[]): void {
    const current = this._edited();
    const next = mutate(current);
    this._history.update((history) => [...history, current].slice(-REPLAY_HISTORY_LIMIT));
    this._edited.set(next);
  }

  /** Throws every edit away and stops editing. */
  cancel(): void {
    this._edited.set([...this._original()]);
    this._history.set([]);
    this._isEditing.set(false);
  }

  /** Puts the events back as recorded while staying in the editor, as a change that can itself be undone. */
  revert(): void {
    this.change(() => [...this._original()]);
  }

  /**
   * Adds a new entry at a row, given a fresh sequence number and a time between its neighbours.
   *
   * A row past either end is taken as that end.
   */
  insert(atIndex: number, draft: ReplayEntryDraft): void {
    this.change((events) => {
      const index = Math.max(0, Math.min(events.length, atIndex));
      const entry = createReplayEntry(draft, nextInsertSeq(events), insertTimeAt(events, index));
      return insertReplayEvent(events, index, entry);
    });
  }

  /** Adds events that were already made, such as a staged scene, at a row. Nothing given changes nothing. */
  insertMany(atIndex: number, entries: readonly ReplayEvent[]): void {
    if (entries.length < 1) return;
    this.change((events) => insertReplayEvents(events, atIndex, entries));
  }

  /** Whether the event with this sequence number was added in the editor rather than recorded. */
  isInserted(seq: number): boolean {
    return !this.originalSeqs().has(seq);
  }

  /** Removes the event with this sequence number. */
  remove(seq: number): void {
    this.change((events) => removeReplayEvent(events, seq));
  }

  /** Moves the event with this sequence number up or down by `offset` rows. */
  move(seq: number, offset: number): void {
    this.change((events) => moveReplayEvent(events, seq, offset));
  }

  /** Rewrites the text of the event with this sequence number. */
  retext(seq: number, text: string): void {
    this.change((events) => retextReplayEvent(events, seq, text));
  }

  /**
   * Saves the edited events as a new recording in this browser, leaving the original as it was.
   *
   * The events are renumbered, and boards are rebuilt from `base` along the way so the new
   * recording can be played from any point. Answers the new recording's id and ends editing, or
   * null when a save is already running, nothing is left to save, or the storage refuses.
   */
  async saveAsDerived(source: ReplayManifest, base: readonly ReplayObjectSnapshot[]): Promise<number | null> {
    if (this._isSaving()) return null;
    this._isSaving.set(true);
    try {
      const edited = this._edited();
      const events = resequenceReplayEvents(edited);
      if (events.length < 1) return null;
      const renumbered = replaySeqRemap(edited);

      const id = await this.store.createRecording({ roomName: source.roomName, startedAt: source.startedAt });
      if (id == null) {
        Logger.warn('[ReplayEditor] 派生した記録を作れませんでした');
        return null;
      }

      const keyframes = await this.writeKeyframes(id, base, events);
      const chunks = await this.writeChunks(id, events);

      const manifest: ReplayManifest = {
        ...source,
        formatVersion: REPLAY_FORMAT_VERSION,
        actors: restamped(source.actors, renumbered),
        targets: restamped(source.targets, renumbered),
        recordedBy: { ...source.recordedBy, sinceSeq: 0 },
        endedAt: events[events.length - 1].at,
        derivedFrom: { roomName: source.roomName, startedAt: source.startedAt },
        keyframes,
        chunks,
      };
      await this.store.updateRecording(id, { endedAt: manifest.endedAt, manifest: encodeReplayManifest(manifest) });

      this._original.set([...this._edited()]);
      this._history.set([]);
      this._isEditing.set(false);
      return id;
    } catch (reason) {
      Logger.warn('[ReplayEditor] 派生した記録の保存に失敗しました', reason);
      return null;
    } finally {
      this._isSaving.set(false);
    }
  }

  private async writeKeyframes(
    id: number,
    base: readonly ReplayObjectSnapshot[],
    events: readonly ReplayEvent[]
  ): Promise<ReplayManifest['keyframes']> {
    const written: ReplayManifest['keyframes'][number][] = [];
    let board = [...base];
    let applied = 0;

    const put = async (seq: number, at: number): Promise<void> => {
      const bytes = encodeReplayKeyframe(board);
      const blob = new Blob([bytes as BlobPart], { type: 'application/octet-stream' });
      await this.store.putKeyframe({ recordingId: id, seq, at, blob });
      written.push({ seq, at, byteSize: blob.size });
    };

    await put(0, events[0].at);
    while (applied < events.length) {
      const slice = events.slice(applied, applied + REPLAY_DERIVED_KEYFRAME_STRIDE);
      board = applyReplayEvents(board, slice);
      applied += slice.length;
      if (applied < events.length) await put(events[applied - 1].seq, events[applied - 1].at);
    }
    return written;
  }

  private async writeChunks(id: number, events: readonly ReplayEvent[]): Promise<ReplayManifest['chunks']> {
    const written: ReplayManifest['chunks'][number][] = [];
    for (let offset = 0; offset < events.length; offset += REPLAY_DERIVED_CHUNK_SIZE) {
      const slice = events.slice(offset, offset + REPLAY_DERIVED_CHUNK_SIZE);
      const bytes = encodeReplayEvents(slice);
      const chunk = {
        index: written.length,
        seqStart: slice[0].seq,
        seqEnd: slice[slice.length - 1].seq,
        eventCount: slice.length,
        byteSize: bytes.byteLength,
      };
      written.push(chunk);
      await this.store.appendChunk({ recordingId: id, ...chunk, bytes });
    }
    return written;
  }
}

function restamped<T extends { sinceSeq: number }>(
  snapshots: readonly T[],
  renumbered: ReadonlyMap<number, number>
): T[] {
  // Walking the whole remap per snapshot costs the name history times the event count.
  // The numbers only rise, so a sorted running maximum and a binary search will do.
  const befores: number[] = [];
  const highest: number[] = [];
  let running = 0;
  for (const [before, after] of [...renumbered].sort((a, b) => a[0] - b[0])) {
    running = Math.max(running, after);
    befores.push(before);
    highest.push(running);
  }

  return snapshots.map((snapshot) => {
    let low = 0;
    let high = befores.length - 1;
    let found = -1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (befores[mid] <= snapshot.sinceSeq) {
        found = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    const sinceSeq = found >= 0 ? highest[found] : 0;
    return { ...snapshot, sinceSeq: snapshot.sinceSeq < 1 ? 0 : sinceSeq };
  });
}
