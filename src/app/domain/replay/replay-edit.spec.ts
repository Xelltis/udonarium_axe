import {
  chatTabIdentifierNear,
  createReplayEntry,
  hasReplayEdits,
  insertReplayEvent,
  insertReplayEvents,
  insertTimeAt,
  isInsertableKind,
  isTextEditable,
  moveReplayEvent,
  nextInsertSeq,
  removeReplayEvent,
  removeReplayEvents,
  resequenceReplayEvents,
  retextReplayEvent,
  stepReplayEvents,
  textOf,
} from '@axe/domain/replay/replay-edit';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';

function event(seq: number, kind: ReplayEventKind = ReplayEventKind.ChatMessage, at = seq * 1000): ReplayEvent {
  return {
    seq,
    at,
    t: at,
    kind,
    actorId: 'alice',
    detail: kind === ReplayEventKind.Marker ? { label: `章 ${seq}` } : { text: `発言 ${seq}` },
    visibility: PUBLIC_VISIBILITY,
  };
}

const events = [event(1), event(2), event(3)];

describe('isTextEditable() / textOf()', () => {
  it('lets a line and a marker be rewritten', () => {
    expect(isTextEditable(event(1))).toBe(true);
    expect(isTextEditable(event(1, ReplayEventKind.Marker))).toBe(true);
  });

  it('lets nothing on the board be', () => {
    expect(isTextEditable(event(1, ReplayEventKind.ObjectMove))).toBe(false);
  });

  it('takes the text from wherever each kind keeps it', () => {
    expect(textOf(event(1))).toBe('発言 1');
    expect(textOf(event(1, ReplayEventKind.Marker))).toBe('章 1');
  });
});

describe('createReplayEntry()', () => {
  it('builds a line to insert', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.ChatMessage, actorId: 'alice', speaker: '盗賊', text: 'やあ', tabIdentifier: 'tab1' },
      9,
      5000
    );
    expect(entry).toMatchObject({ seq: 9, at: 5000, kind: ReplayEventKind.ChatMessage, actorId: 'alice' });
    expect(entry.detail).toEqual({
      text: 'やあ',
      name: '盗賊',
      from: 'alice',
      to: '',
      tag: '',
      dicebot: '',
      timestamp: 5000,
      tabIdentifier: 'tab1',
      imageIdentifier: '',
      messColor: '',
    });
  });

  it('builds a marker as a heading', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.Marker, actorId: 'gm', speaker: '', text: '第二幕', tabIdentifier: 'tab1' },
      1,
      0
    );
    expect(entry.detail).toEqual({ label: '第二幕' });
  });

  it('gives a line a patch that creates it', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.ChatMessage, actorId: 'alice', speaker: '盗賊', text: 'やあ', tabIdentifier: 'tab1' },
      9,
      5000
    );
    expect(entry.patch?.aliasName).toBe('chat');
    expect(entry.patch?.identifier).toBe(entry.targetId);
    expect(entry.patch?.after).toMatchObject({
      value: 'やあ',
      parentIdentifier: 'tab1',
      'attributes.from': 'alice',
      'attributes.name': '盗賊',
      'attributes.timestamp': 5000,
    });
  });

  it('gives it the portrait and the colour of the chosen piece', () => {
    const entry = createReplayEntry(
      {
        kind: ReplayEventKind.ChatMessage,
        actorId: 'alice',
        speaker: '盗賊',
        text: 'やあ',
        tabIdentifier: 'tab1',
        imageIdentifier: 'img-1',
        chatColor: '#112233',
      },
      9,
      5000
    );
    expect(entry.patch?.after['attributes.imageIdentifier']).toBe('img-1');
    expect(entry.patch?.after['attributes.messColor']).toBe('#112233');
    expect(entry.patch?.after['attributes.originFrom']).toBe('alice');
  });

  it('builds a dice row as a line from the dice bot', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.ChatDice, actorId: 'alice', speaker: '', text: '(1d100) ＞ 42', tabIdentifier: 'tab1' },
      9,
      5000
    );
    expect(entry.detail['from']).toBe('System-BCDice');
    expect(entry.patch?.after['attributes.from']).toBe('System-BCDice');
    expect(entry.patch?.after['attributes.tag']).toBe('system');
  });

  it('creates nothing for a marker', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.Marker, actorId: 'gm', speaker: '', text: '第二幕', tabIdentifier: 'tab1' },
      1,
      0
    );
    expect(entry.patch).toBeUndefined();
  });

  it('gives each insertion an identifier of its own', () => {
    const draft = { kind: ReplayEventKind.ChatMessage, actorId: 'a', speaker: '', text: 'x', tabIdentifier: 't' };
    expect(createReplayEntry(draft, 1, 0).targetId).not.toBe(createReplayEntry(draft, 2, 0).targetId);
  });

  it('leaves an inserted row of a kind that can be rewritten', () => {
    for (const kind of [ReplayEventKind.ChatMessage, ReplayEventKind.ChatDice, ReplayEventKind.Marker]) {
      expect(isInsertableKind(kind)).toBe(true);
    }
    expect(isInsertableKind(ReplayEventKind.ObjectMove)).toBe(false);
  });
});

describe('chatTabIdentifierNear()', () => {
  const withTabs: ReplayEvent[] = [
    { ...event(1), detail: { text: '一', tabIdentifier: 'tab-a' } },
    { ...event(2), kind: ReplayEventKind.ObjectMove, detail: {} },
    { ...event(3), detail: { text: '三', tabIdentifier: 'tab-b' } },
  ];

  it('takes the nearest tab before it', () => {
    expect(chatTabIdentifierNear(withTabs, 2)).toBe('tab-a');
    expect(chatTabIdentifierNear(withTabs, 3)).toBe('tab-b');
  });

  it('looks after it when there is none', () => {
    expect(chatTabIdentifierNear(withTabs, 0)).toBe('tab-a');
  });

  it('returns nothing when there is none either way', () => {
    expect(chatTabIdentifierNear([event(1)], 0)).toBe('');
  });
});

describe('insertReplayEvent()', () => {
  it('inserts at the place it is given', () => {
    const entry = event(9);
    expect(insertReplayEvent(events, 1, entry).map((e) => e.seq)).toEqual([1, 9, 2, 3]);
  });

  it('inserts at the front and at the end', () => {
    expect(insertReplayEvent(events, 0, event(9)).map((e) => e.seq)).toEqual([9, 1, 2, 3]);
    expect(insertReplayEvent(events, 3, event(9)).map((e) => e.seq)).toEqual([1, 2, 3, 9]);
  });

  it('pulls a place outside the range back in', () => {
    expect(insertReplayEvent(events, -5, event(9))[0].seq).toBe(9);
    expect(insertReplayEvent(events, 99, event(9))[3].seq).toBe(9);
  });

  it('leaves the list it was given alone', () => {
    insertReplayEvent(events, 1, event(9));
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

describe('insertReplayEvents()', () => {
  it('inserts several together and numbers them on', () => {
    const block = [event(90), event(91)];
    const merged = insertReplayEvents(events, 1, block);
    expect(merged.map((e) => e.seq)).toEqual([1, 4, 5, 2, 3]);
  });

  it('spaces them evenly between the moments either side', () => {
    const merged = insertReplayEvents(events, 1, [event(90), event(91)]);
    expect(merged[1].at).toBe(1333);
    expect(merged[2].at).toBe(1667);
  });

  it('moves the moment on when it adds at the end', () => {
    const merged = insertReplayEvents(events, 3, [event(90)]);
    expect(merged[3].at).toBeGreaterThanOrEqual(3000);
  });

  it('does nothing for nothing', () => {
    expect(insertReplayEvents(events, 1, []).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('leaves the list it was given alone', () => {
    insertReplayEvents(events, 1, [event(90)]);
    expect(events).toHaveLength(3);
  });
});

describe('nextInsertSeq() / insertTimeAt()', () => {
  it('returns a number nothing is using', () => {
    expect(nextInsertSeq(events)).toBe(4);
    expect(nextInsertSeq([])).toBe(1);
  });

  it('places it between the moments either side', () => {
    expect(insertTimeAt(events, 1)).toBe(1500);
  });

  it('takes the neighbouring moment at either end', () => {
    expect(insertTimeAt(events, 0)).toBe(1000);
    expect(insertTimeAt(events, 3)).toBe(3000);
  });

  it('returns nothing for an empty run', () => {
    expect(insertTimeAt([], 0)).toBe(0);
  });
});

describe('removeReplayEvent()', () => {
  it('drops the one it is asked for', () => {
    expect(removeReplayEvent(events, 2).map((e) => e.seq)).toEqual([1, 3]);
  });

  it('leaves the list it was given alone', () => {
    removeReplayEvent(events, 2);
    expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('drops nothing for a number that is not there', () => {
    expect(removeReplayEvent(events, 9).map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

describe('restampReplayTimes()', () => {
  it('gives an inserted row its elapsed time too', () => {
    const entry = createReplayEntry(
      { kind: ReplayEventKind.ChatMessage, actorId: 'alice', speaker: 'A', text: 'やあ', tabIdentifier: 'tab-1' },
      9,
      2500
    );
    const inserted = insertReplayEvent(events, 2, entry);

    expect(inserted[2].t).toBe(1500);
    expect(inserted.map((e) => e.t)).toEqual([0, 1000, 1500, 2000]);
  });

  it('gives it to several inserted together', () => {
    const staged = [
      { ...events[0], seq: 90, at: 0, t: 0 },
      { ...events[0], seq: 91, at: 40, t: 40 },
    ];
    const inserted = insertReplayEvents(events, 1, staged);

    expect(inserted.map((e) => e.t)).toEqual([0, 333, 667, 1000, 2000]);
  });

  it('measures the rest again once the first is dropped', () => {
    expect(removeReplayEvent(events, 1).map((e) => e.t)).toEqual([0, 1000]);
  });
});

describe('removeReplayEvents()', () => {
  it('takes every chosen event out and keeps the rest in order', () => {
    const five = [1, 2, 3, 4, 5].map((seq) => event(seq));

    expect(removeReplayEvents(five, new Set([2, 4])).map((e) => e.seq)).toEqual([1, 3, 5]);
  });

  it('counts the offsets from the new first event', () => {
    const removed = removeReplayEvents(events, new Set([1]));

    expect(removed.map((e) => e.t)).toEqual([0, 1000]);
  });
});

describe('stepReplayEvents()', () => {
  const five = [1, 2, 3, 4, 5].map((seq) => event(seq));
  const order = (list: readonly ReplayEvent[]) => list.map((e) => e.seq);

  it('moves each chosen event up one place, keeping them apart', () => {
    expect(order(stepReplayEvents(five, new Set([3, 5]), -1))).toEqual([1, 3, 2, 5, 4]);
  });

  it('moves a run of chosen events down together', () => {
    expect(order(stepReplayEvents(five, new Set([1, 2]), 1))).toEqual([3, 1, 2, 4, 5]);
  });

  it('leaves a run at the top of the list where it is', () => {
    expect(order(stepReplayEvents(five, new Set([1, 2]), -1))).toEqual([1, 2, 3, 4, 5]);
  });

  it('moves past the next event shown, over those left out on the way', () => {
    const shown = new Set([1, 4, 5]);
    const isStop = (e: ReplayEvent) => shown.has(e.seq);

    expect(order(stepReplayEvents(five, new Set([4]), -1, isStop))).toEqual([4, 1, 2, 3, 5]);
    expect(order(stepReplayEvents(five, new Set([1]), 1, isStop))).toEqual([2, 3, 4, 1, 5]);
  });

  it('keeps a run together as it passes events left out', () => {
    const isStop = (e: ReplayEvent) => e.seq !== 3;

    expect(order(stepReplayEvents(five, new Set([1, 2]), 1, isStop))).toEqual([3, 4, 1, 2, 5]);
  });

  it('leaves an event where it is when only events left out lie beyond it', () => {
    const isStop = (e: ReplayEvent) => e.seq < 4;

    expect(order(stepReplayEvents(five, new Set([3]), 1, isStop))).toEqual([1, 2, 3, 4, 5]);
  });

  it('gives an event that moves a time between its new neighbours', () => {
    const moved = stepReplayEvents(five, new Set([3]), -1);

    expect(moved[1].at).toBeGreaterThan(moved[0].at);
    expect(moved[1].at).toBeLessThan(moved[2].at);
  });
});

describe('moveReplayEvent()', () => {
  it('moves a row back and forward', () => {
    expect(moveReplayEvent(events, 2, -1).map((e) => e.seq)).toEqual([2, 1, 3]);
    expect(moveReplayEvent(events, 2, 1).map((e) => e.seq)).toEqual([1, 3, 2]);
  });

  it('moves nothing past either end', () => {
    expect(moveReplayEvent(events, 1, -1).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(moveReplayEvent(events, 3, 1).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('leaves the order alone for a number that is not there', () => {
    expect(moveReplayEvent(events, 9, 1).map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(moveReplayEvent(events, 2, 0).map((e) => e.at)).toEqual([1000, 2000, 3000]);
  });

  it('takes the moment of where it lands', () => {
    const moved = moveReplayEvent(events, 1, 2);
    expect(moved.map((e) => e.seq)).toEqual([2, 3, 1]);
    expect(moved.map((e) => e.at)).toEqual([2000, 3000, 3000]);
  });

  it('places it between the two it lands among', () => {
    const spaced = [event(1, ReplayEventKind.ChatMessage, 0), event(2), event(3, ReplayEventKind.ChatMessage, 9000)];
    expect(moveReplayEvent(spaced, 2, 1).map((e) => e.at)).toEqual([0, 9000, 9000]);
    expect(moveReplayEvent(spaced, 3, -1).map((e) => e.at)).toEqual([0, 1000, 2000]);
  });

  it('measures the elapsed time afresh when it moves to the front', () => {
    const moved = moveReplayEvent(events, 3, -2);
    expect(moved.map((e) => e.at)).toEqual([1000, 1000, 2000]);
    expect(moved.map((e) => e.t)).toEqual([0, 0, 1000]);
  });
});

describe('retextReplayEvent()', () => {
  it('rewrites a line', () => {
    const edited = retextReplayEvent(events, 2, 'あらためて');
    expect(textOf(edited[1])).toBe('あらためて');
    expect(textOf(edited[0])).toBe('発言 1');
  });

  it('rewrites the heading of a marker', () => {
    const marked = [event(1, ReplayEventKind.Marker)];
    expect(textOf(retextReplayEvent(marked, 1, '第二幕')[0])).toBe('第二幕');
  });

  it('carries the rewritten text into the patch', () => {
    const recorded: ReplayEvent = {
      ...event(1),
      targetId: 'm1',
      detail: { text: '元の台詞', name: '盗賊', tabIdentifier: 'tab1' },
      patch: {
        identifier: 'm1',
        aliasName: 'chat',
        before: {},
        after: { value: '元の台詞', parentIdentifier: 'tab1', 'attributes.name': '盗賊' },
      },
    };

    const [edited] = retextReplayEvent([recorded], 1, 'あらためて');
    expect(edited.detail['text']).toBe('あらためて');
    expect(edited.patch?.after['value']).toBe('あらためて');
    expect(edited.patch?.after['attributes.name']).toBe('盗賊');
  });

  it('rewrites a row with no patch without breaking it', () => {
    const [edited] = retextReplayEvent(events, 2, 'あらためて');
    expect(edited).toBeDefined();
    expect(retextReplayEvent(events, 2, 'あらためて')[1].patch).toBeUndefined();
  });

  it('leaves a kind that cannot be rewritten alone', () => {
    const moves = [event(1, ReplayEventKind.ObjectMove)];
    expect(retextReplayEvent(moves, 1, 'むり')[0]).toBe(moves[0]);
  });

  it('leaves the events it was given alone', () => {
    retextReplayEvent(events, 2, 'あらためて');
    expect(textOf(events[1])).toBe('発言 2');
  });
});

describe('resequenceReplayEvents()', () => {
  it('numbers them again after a reorder', () => {
    const reordered = moveReplayEvent(events, 3, -2);
    expect(resequenceReplayEvents(reordered).map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('measures the elapsed time again from the first', () => {
    const trimmed = removeReplayEvent(events, 1);
    const resequenced = resequenceReplayEvents(trimmed);
    expect(resequenced.map((e) => e.t)).toEqual([0, 1000]);
  });

  it('keeps the original moments', () => {
    const resequenced = resequenceReplayEvents(removeReplayEvent(events, 1));
    expect(resequenced.map((e) => e.at)).toEqual([2000, 3000]);
  });

  it('does not fall over on nothing', () => {
    expect(resequenceReplayEvents([])).toEqual([]);
  });
});

describe('hasReplayEdits()', () => {
  it('is false while nothing has been touched', () => {
    expect(hasReplayEdits(events, [...events])).toBe(false);
  });

  it('is true once something is deleted', () => {
    expect(hasReplayEdits(events, removeReplayEvent(events, 2))).toBe(true);
  });

  it('is true once something is reordered', () => {
    expect(hasReplayEdits(events, moveReplayEvent(events, 1, 1))).toBe(true);
  });

  it('is true once something is rewritten', () => {
    expect(hasReplayEdits(events, retextReplayEvent(events, 2, '別の台詞'))).toBe(true);
  });
});

describe('chat moments that follow a new place', () => {
  const draft = (kind: ReplayEventKind, text: string) => ({
    kind,
    actorId: 'alice',
    speaker: 'アリス',
    text,
    tabIdentifier: 'main',
  });
  const momentOf = (event: ReplayEvent) => Number(event.patch?.after['attributes.timestamp']);
  const said = (event: ReplayEvent, moment: number): ReplayEvent => ({
    ...event,
    detail: { ...event.detail, timestamp: moment },
    patch: { ...event.patch!, after: { ...event.patch!.after, 'attributes.timestamp': moment } },
  });
  const line = (seq: number, at: number, moment: number, text = `発言 ${seq}`) =>
    said(createReplayEntry(draft(ReplayEventKind.ChatMessage, text), seq, at), moment);
  const result = (seq: number, at: number, moment: number) =>
    said(createReplayEntry(draft(ReplayEventKind.ChatDice, '(2D6) → 7'), seq, at), moment);
  const bySeq = (events: readonly ReplayEvent[], seq: number) => events.find((event) => event.seq === seq)!;

  it('says an inserted line between the lines either side, and its dice result the moment after it', () => {
    const around = [line(1, 5000, 5000), line(2, 6000, 6000)];

    const placed = insertReplayEvents(around, 1, [line(10, 100, 100, '2d6'), result(11, 101, 101)]);

    const [said, rolled] = [placed[1], placed[2]];
    expect(momentOf(said)).toBeGreaterThan(5000);
    expect(said.detail['timestamp']).toBe(momentOf(said));
    expect(momentOf(rolled)).toBe(momentOf(said) + 1);
    expect(momentOf(rolled)).toBeLessThan(6000);
  });

  it('says a written line between the lines either side, though the list keeps its times by another clock', () => {
    const events = [line(1, 1000, 103000), line(2, 1100, 103100)];
    const written = createReplayEntry(draft(ReplayEventKind.ChatMessage, '書き足し'), 9, insertTimeAt(events, 1));

    const placed = insertReplayEvent(events, 1, written);

    expect(momentOf(placed[1])).toBeGreaterThan(103000);
    expect(momentOf(placed[1])).toBeLessThan(103100);
  });

  it('says a moved line between the lines either side, though the list keeps its times by another clock', () => {
    const events = [line(1, 1000, 103000), line(2, 1100, 103100), line(3, 1200, 103200)];

    const moved = moveReplayEvent(events, 3, -1);

    expect(moved.map((event) => event.seq)).toEqual([1, 3, 2]);
    expect(momentOf(bySeq(moved, 3))).toBeGreaterThan(103000);
    expect(momentOf(bySeq(moved, 3))).toBeLessThan(103100);
  });

  it('says a line moved to the end after the last line, never at its moment', () => {
    const events = [line(1, 1000, 1000), line(2, 2000, 2000), line(3, 3000, 3000)];

    const moved = moveReplayEvent(events, 1, 2);

    expect(moved.map((event) => event.seq)).toEqual([2, 3, 1]);
    expect(momentOf(bySeq(moved, 1))).toBeGreaterThan(3000);
  });

  it('says a line moved to the start before the first line, never at its moment', () => {
    const events = [line(1, 1000, 1000), line(2, 2000, 2000), line(3, 3000, 3000)];

    const stepped = stepReplayEvents(events, new Set([3]), -1);
    const moved = stepReplayEvents(stepped, new Set([3]), -1);

    expect(moved.map((event) => event.seq)).toEqual([3, 1, 2]);
    expect(momentOf(bySeq(moved, 3))).toBeLessThan(1000);
  });

  it('keeps a dice result moved on its own the moment after its line, while it still follows the line', () => {
    const events = [line(1, 1000, 4000, '2d6'), line(2, 1010, 4010), result(3, 1020, 4001)];

    const stepped = stepReplayEvents(events, new Set([3]), -1);

    expect(stepped.map((event) => event.seq)).toEqual([1, 3, 2]);
    expect(momentOf(bySeq(stepped, 3))).toBe(4001);
  });

  it('takes the dice result along with a line moved on its own, while the result still follows it', () => {
    const events = [
      line(1, 1000, 3000),
      line(2, 1010, 4000, '2d6'),
      line(3, 1020, 4010),
      result(4, 1030, 4001),
      line(5, 1040, 5000),
    ];

    const moved = moveReplayEvent(events, 2, 1);

    expect(moved.map((event) => event.seq)).toEqual([1, 3, 2, 4, 5]);
    const [rolled, answer] = [momentOf(bySeq(moved, 2)), momentOf(bySeq(moved, 4))];
    expect(rolled).toBeGreaterThan(4010);
    expect(answer).toBe(rolled + 1);
    expect(answer).toBeLessThan(5000);
  });

  it('takes a resource notice along two moments after its line, as the line moves', () => {
    const notice = line(3, 1020, 4002, 'HP -3');
    notice.patch!.after['attributes.from'] = 'System';
    const events = [line(1, 1000, 3000), line(2, 1010, 4000, ':HP-3'), notice, line(4, 1030, 5000)];

    const moved = moveReplayEvent(events, 2, -1);

    expect(moved.map((event) => event.seq)).toEqual([2, 1, 3, 4]);
    expect(momentOf(bySeq(moved, 2))).toBeLessThan(3000);
    expect(momentOf(bySeq(moved, 3))).toBe(momentOf(bySeq(moved, 2)) + 2);
  });

  it('lets a dice result go its own way once it is moved above its line', () => {
    const events = [line(1, 1000, 4000, '2d6'), result(2, 1010, 4001), line(3, 1020, 4010)];

    const stepped = stepReplayEvents(events, new Set([2]), -1);

    expect(stepped.map((event) => event.seq)).toEqual([2, 1, 3]);
    expect(momentOf(bySeq(stepped, 2))).toBeLessThan(4000);
  });

  it('orders lines by the lines of their own tab only', () => {
    const other = said({ ...line(2, 1100, 9000) }, 9000);
    other.patch!.after['parentIdentifier'] = 'other';
    const events = [line(1, 1000, 1000), other, line(3, 1200, 1200)];

    const moved = moveReplayEvent(events, 3, -1);

    expect(momentOf(bySeq(moved, 3))).toBeGreaterThan(1000);
    expect(momentOf(bySeq(moved, 3))).toBeLessThan(9000);
  });

  it('says a line moved past a line with answers after those answers, which stay tied to that line', () => {
    const notice = line(4, 1030, 10002, 'HP -3');
    notice.patch!.after['attributes.from'] = 'System';
    const events = [line(1, 1000, 10000, ':HP-3 2d6'), line(2, 1010, 10050), result(3, 1020, 10001), notice];
    const later = line(5, 1040, 90000);

    const moved = moveReplayEvent([...events, later], 5, -3);
    const again = stepReplayEvents(moved, new Set([5]), 1);

    expect(moved.map((event) => event.seq)).toEqual([1, 5, 2, 3, 4]);
    expect(momentOf(bySeq(moved, 5))).toBeGreaterThan(10002);
    expect(momentOf(bySeq(moved, 5))).toBeLessThan(10050);
    expect(momentOf(bySeq(again, 4))).toBe(10002);
  });

  describe('by the key the chat sorts on, the moment with its fraction', () => {
    const minor = (event: ReplayEvent, value: number): ReplayEvent => ({
      ...event,
      patch: { ...event.patch!, after: { ...event.patch!.after, minorIndex: value } },
    });
    const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);
    const writtenAt = (events: ReplayEvent[], index: number) =>
      insertReplayEvent(
        events,
        index,
        createReplayEntry(draft(ReplayEventKind.ChatMessage, '書き足し'), 9, insertTimeAt(events, index))
      );

    it('says a line written between two said at the same moment between them, never by chance', () => {
      const placed = writtenAt([minor(line(1, 1000, 10000), 0.3), minor(line(2, 1010, 10000), 0.8)], 1);

      expect(keyOf(placed[1])).toBeGreaterThan(keyOf(placed[0]));
      expect(keyOf(placed[1])).toBeLessThan(keyOf(placed[2]));
    });

    it('says a line written between a roll and its result after both, as the result stays just after its roll', () => {
      const placed = writtenAt([minor(line(1, 1000, 10000, '2d6'), 0.73), minor(result(2, 1010, 10001), 0.21)], 1);

      expect(keyOf(placed[1])).toBeGreaterThan(keyOf(placed[2]));
      expect(momentOf(placed[2])).toBe(momentOf(placed[0]) + 1);
    });
  });

  it('says a line made again under the same message at the moment its first making moved to', () => {
    const first = line(1, 1000, 9000, '2d6');
    const remade = { ...line(4, 1030, 9000, '2d6'), patch: { ...first.patch! } };
    const events = [line(5, 900, 8000), first, result(2, 1010, 9001), line(3, 1020, 9500), remade];

    const moved = moveReplayEvent(events, 1, -1);

    expect(moved.map((event) => event.seq)).toEqual([1, 5, 2, 3, 4]);
    expect(momentOf(bySeq(moved, 4))).toBe(momentOf(bySeq(moved, 1)));
    expect(momentOf(bySeq(moved, 2))).toBe(momentOf(bySeq(moved, 1)) + 1);
  });

  it('leaves the moments of the lines that did not move alone', () => {
    const events = [line(1, 1000, 103000), line(2, 1100, 103100), line(3, 1200, 103200)];

    const moved = moveReplayEvent(events, 3, -1);

    expect(momentOf(bySeq(moved, 1))).toBe(103000);
    expect(momentOf(bySeq(moved, 2))).toBe(103100);
  });
});
