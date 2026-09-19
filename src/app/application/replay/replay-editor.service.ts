import { computed, inject, Injectable, signal } from '@angular/core';
import { REPLAY_KEYFRAME_INTERVAL_MS } from '@axe/application/replay/replay-recorder.service';
import { Logger } from '@axe/core/logging/logger';
import { ReplayLogStore } from '@axe/core/storage/replay-log-store';
import { compressAsync } from '@axe/core/util/compress';
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
  removeReplayEvents,
  type ReplayEntryDraft,
  replaySeqRemap,
  resequenceReplayEvents,
  retextReplayEvent,
  stepReplayEvents,
} from '@axe/domain/replay/replay-edit';
import { REPLAY_FORMAT_VERSION, type ReplayEvent, type ReplayManifest } from '@axe/domain/replay/replay-event';
import { encodeReplayKeyframe, type ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents } from '@axe/domain/replay/replay-patch';

export const REPLAY_HISTORY_LIMIT = 100;
export const REPLAY_DERIVED_CHUNK_SIZE = 500;

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

  /** Throws every edit away and stops editing, letting go of the events it held. */
  cancel(): void {
    this.release();
  }

  private release(): void {
    this._original.set([]);
    this._edited.set([]);
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

  /** Removes every event with one of these sequence numbers, as one change to undo. Nothing chosen changes nothing. */
  removeMany(seqs: ReadonlySet<number>): void {
    if (seqs.size < 1) return;
    this.change((events) => removeReplayEvents(events, seqs));
  }

  /**
   * Moves each chosen event one row up or down, keeping them apart as they were, as one change to undo.
   *
   * A row is counted by the events `isStop` accepts, so a list that leaves some out moves past the next it shows.
   */
  stepMany(seqs: ReadonlySet<number>, direction: -1 | 1, isStop?: (event: ReplayEvent) => boolean): void {
    if (seqs.size < 1) return;
    this.change((events) => stepReplayEvents(events, seqs, direction, isStop));
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

      this.release();
      return id;
    } catch (reason) {
      Logger.warn('[ReplayEditor] 派生した記録の保存に失敗しました', reason);
      return null;
    } finally {
      this._isSaving.set(false);
    }
  }

  /**
   * Writes the boards of the new recording: one before the first event, then one every ten minutes
   * of recorded time, as the recorder takes them.
   *
   * One board is carried along and only what the events change is made anew, and each board is
   * stored compressed. A board after every few hundred events, each a copy of the whole room with
   * its chat, took most of half an hour for an evening's session.
   */
  private async writeKeyframes(
    id: number,
    base: readonly ReplayObjectSnapshot[],
    events: readonly ReplayEvent[]
  ): Promise<ReplayManifest['keyframes']> {
    const written: ReplayManifest['keyframes'][number][] = [];
    let board = applyReplayEvents(base, []);

    const put = async (seq: number, at: number): Promise<void> => {
      const blob = new Blob([(await compressAsync(encodeReplayKeyframe(board))) as BlobPart], {
        type: 'application/octet-stream',
      });
      await this.store.putKeyframe({ recordingId: id, seq, at, blob });
      written.push({ seq, at, byteSize: blob.size });
    };

    await put(0, events[0].at);
    let from = 0;
    let lastAt = events[0].at;
    for (let index = 0; index < events.length; index++) {
      const isLast = index === events.length - 1;
      if (!isLast && events[index].at - lastAt < REPLAY_KEYFRAME_INTERVAL_MS) continue;
      board = applyReplayEvents(board, events.slice(from, index + 1), { shareInput: true });
      from = index + 1;
      lastAt = events[index].at;
      if (!isLast) await put(events[index].seq, events[index].at);
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
