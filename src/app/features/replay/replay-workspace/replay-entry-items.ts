import { type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import { ReplayEventCategory, replayEventCategory } from '@axe/domain/replay/replay-event-category';

/** One event as a row of the replay list: where it stands in the whole recording, and what it is. */
export interface ReplayEntryRow {
  index: number;
  seq: number;
  event: ReplayEvent;
  isChapter: boolean;
  editable: boolean;
}

/**
 * An item of the list: a row, or a run of board events folded under one heading.
 *
 * A row inside an opened run is marked `nested` so it can be drawn set in under its heading.
 */
export type ReplayListItem =
  | { kind: 'row'; key: string; row: ReplayEntryRow; nested: boolean }
  | { kind: 'group'; key: string; rows: readonly ReplayEntryRow[]; open: boolean };

/**
 * The shape a row is drawn in: a line spoken, a roll, a chapter heading, a note of something staged
 * (music, a cut-in, a scene, a turn, a vote), or a short line of what happened on the board.
 */
export type ReplayRowStyle = 'speech' | 'dice' | 'chapter' | 'note' | 'board';

/** How a row is drawn, read from its event. */
export function replayRowStyle(event: ReplayEvent): ReplayRowStyle {
  if (event.kind === ReplayEventKind.Marker) return 'chapter';
  if (event.kind === ReplayEventKind.ChatDice) return 'dice';
  if (event.kind === ReplayEventKind.ChatMessage) return 'speech';
  return replayEventCategory(event) === ReplayEventCategory.Story ? 'note' : 'board';
}

/**
 * The items of the list, with the board events between the lines of the story folded.
 *
 * Two or more board events in a row become one heading, open or shut as `openGroups` says (by the
 * sequence number of the first). A single board event stays a row of its own, since folding one
 * saves nothing.
 */
export function foldReplayRows(rows: readonly ReplayEntryRow[], openGroups: ReadonlySet<number>): ReplayListItem[] {
  const items: ReplayListItem[] = [];
  let run: ReplayEntryRow[] = [];

  const flush = (): void => {
    if (run.length === 1) items.push({ kind: 'row', key: `r${run[0].seq}`, row: run[0], nested: false });
    if (run.length > 1) {
      const open = openGroups.has(run[0].seq);
      items.push({ kind: 'group', key: `g${run[0].seq}`, rows: run, open });
      if (open) for (const row of run) items.push({ kind: 'row', key: `r${row.seq}`, row, nested: true });
    }
    run = [];
  };

  for (const row of rows) {
    if (replayRowStyle(row.event) === 'board') {
      run.push(row);
      continue;
    }
    flush();
    items.push({ kind: 'row', key: `r${row.seq}`, row, nested: false });
  }
  flush();
  return items;
}

/**
 * The events a chosen row steps past when moved up (`-1`) or down (`1`): each row on show, and a
 * folded run as a whole, by its first event going up and its last going down.
 */
export function replayStepStops(items: readonly ReplayListItem[], direction: -1 | 1): Set<number> {
  const stops = new Set<number>();
  for (const item of items) {
    if (item.kind === 'row') stops.add(item.row.seq);
    else if (!item.open) stops.add((direction < 0 ? item.rows[0] : item.rows[item.rows.length - 1]).seq);
  }
  return stops;
}

/** How a press on a row was made: plainly, adding to the choice, or reaching to it from the last. */
export interface ReplayPickModifiers {
  toggle: boolean;
  range: boolean;
}

/**
 * The rows chosen after a press on one, as a list of files is chosen.
 *
 * A plain press chooses that row alone. With the toggle key the row joins or leaves the choice.
 * With the range key every row from the last one pressed to this one is chosen, in the order the
 * rows stand. The row pressed becomes the anchor for the next range, except that a range keeps its
 * anchor where it was.
 */
export function pickReplayRows(
  chosen: ReadonlySet<number>,
  anchor: number | null,
  rows: readonly ReplayEntryRow[],
  seq: number,
  modifiers: ReplayPickModifiers
): { chosen: Set<number>; anchor: number } {
  if (modifiers.range && anchor !== null) {
    const from = rows.findIndex((row) => row.seq === anchor);
    const to = rows.findIndex((row) => row.seq === seq);
    if (from >= 0 && to >= 0) {
      const [low, high] = from <= to ? [from, to] : [to, from];
      return { chosen: new Set(rows.slice(low, high + 1).map((row) => row.seq)), anchor };
    }
  }
  if (modifiers.toggle) {
    const next = new Set(chosen);
    if (next.has(seq)) next.delete(seq);
    else next.add(seq);
    return { chosen: next, anchor: seq };
  }
  return { chosen: new Set([seq]), anchor: seq };
}
