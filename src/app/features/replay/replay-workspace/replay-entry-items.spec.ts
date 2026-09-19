import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  foldReplayRows,
  pickReplayRows,
  type ReplayEntryRow,
  replayRowStyle,
  replayStepStops,
} from '@axe/features/replay/replay-workspace/replay-entry-items';

function row(seq: number, kind: ReplayEventKind): ReplayEntryRow {
  const event: ReplayEvent = {
    seq,
    at: seq,
    t: seq,
    kind,
    actorId: 'a',
    detail: {},
    visibility: PUBLIC_VISIBILITY,
  };
  return { index: seq - 1, seq, event, isChapter: kind === ReplayEventKind.Marker, editable: false };
}

const line = (seq: number) => row(seq, ReplayEventKind.ChatMessage);
const step = (seq: number) => row(seq, ReplayEventKind.ObjectMove);

describe('replay list items', () => {
  it('draws each kind of row in its own shape', () => {
    expect(replayRowStyle(line(1).event)).toBe('speech');
    expect(replayRowStyle(row(1, ReplayEventKind.ChatDice).event)).toBe('dice');
    expect(replayRowStyle(row(1, ReplayEventKind.Marker).event)).toBe('chapter');
    expect(replayRowStyle(row(1, ReplayEventKind.MediaBgm).event)).toBe('note');
    expect(replayRowStyle(step(1).event)).toBe('board');
  });

  describe('folding the board', () => {
    const rows = [line(1), step(2), step(3), step(4), line(5), step(6), line(7)];

    it('folds a run of board events between the lines under one heading', () => {
      const items = foldReplayRows(rows, new Set());

      expect(items.map((item) => item.key)).toEqual(['r1', 'g2', 'r5', 'r6', 'r7']);
      expect(items[1].kind === 'group' && items[1].rows.map((r) => r.seq)).toEqual([2, 3, 4]);
    });

    it('leaves a single board event as a row of its own', () => {
      const items = foldReplayRows(rows, new Set());

      expect(items[3]).toMatchObject({ kind: 'row', key: 'r6', nested: false });
    });

    it('lists an opened run under its heading, set in', () => {
      const items = foldReplayRows(rows, new Set([2]));

      expect(items.map((item) => item.key)).toEqual(['r1', 'g2', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']);
      expect(items[2]).toMatchObject({ kind: 'row', nested: true });
    });

    it('folds a run at the very end too', () => {
      const items = foldReplayRows([line(1), step(2), step(3)], new Set());

      expect(items.map((item) => item.key)).toEqual(['r1', 'g2']);
    });
  });

  describe('stepping a row past the others', () => {
    const rows = [line(1), step(2), step(3), step(4), line(5)];

    it('steps past a folded run as a whole, from whichever end it meets', () => {
      const items = foldReplayRows(rows, new Set());

      expect([...replayStepStops(items, -1)].sort()).toEqual([1, 2, 5]);
      expect([...replayStepStops(items, 1)].sort()).toEqual([1, 4, 5]);
    });

    it('steps past each row of a run that is open', () => {
      const items = foldReplayRows(rows, new Set([2]));

      expect([...replayStepStops(items, -1)].sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('choosing rows', () => {
    const rows = [line(1), line(2), line(3), line(4), line(5)];
    const plain = { toggle: false, range: false };

    it('chooses one row alone on a plain press', () => {
      expect([...pickReplayRows(new Set([1, 2]), 1, rows, 3, plain).chosen]).toEqual([3]);
    });

    it('adds a row to the choice, or takes it out, with the toggle key', () => {
      const added = pickReplayRows(new Set([1]), 1, rows, 3, { toggle: true, range: false });
      expect([...added.chosen].sort()).toEqual([1, 3]);

      const removed = pickReplayRows(added.chosen, 3, rows, 1, { toggle: true, range: false });
      expect([...removed.chosen]).toEqual([3]);
    });

    it('chooses every row from the last one pressed with the range key, either way', () => {
      expect([...pickReplayRows(new Set([2]), 2, rows, 4, { toggle: false, range: true }).chosen]).toEqual([2, 3, 4]);
      expect([...pickReplayRows(new Set([4]), 4, rows, 2, { toggle: false, range: true }).chosen]).toEqual([2, 3, 4]);
    });

    it('keeps the anchor where it was across a range', () => {
      expect(pickReplayRows(new Set([2]), 2, rows, 4, { toggle: false, range: true }).anchor).toBe(2);
    });

    it('takes a range with nothing pressed before as a plain press', () => {
      expect([...pickReplayRows(new Set(), null, rows, 4, { toggle: false, range: true }).chosen]).toEqual([4]);
    });
  });
});
