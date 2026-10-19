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
  tabVisibilityNear,
  textOf,
} from '@axe/domain/replay/replay-edit';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
} from '@axe/domain/replay/replay-event';

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

  it('passes over a whisper, a secret roll and what is no line, which say nothing of a tab to write in', () => {
    const events: ReplayEvent[] = [
      { ...event(1), detail: { text: '一', tabIdentifier: 'main-tab' } },
      { ...event(2), detail: { text: '二', tabIdentifier: 'gm-tab' }, visibility: { kind: 'direct', to: ['bob'] } },
      { ...event(3), detail: { tabIdentifier: 'gm-tab', tag: 'DiceBot secret' } },
      { ...event(4), kind: ReplayEventKind.VnPlayhead, detail: { tabIdentifier: 'gm-tab' } },
    ];

    expect(chatTabIdentifierNear(events, 4)).toBe('main-tab');
    expect(chatTabIdentifierNear(events.slice(1), 0)).toBe('');
  });
});

describe('tabVisibilityNear()', () => {
  const line = (seq: number, tabIdentifier: string, visibility = PUBLIC_VISIBILITY): ReplayEvent => ({
    ...event(seq),
    detail: { text: `${seq}`, tabIdentifier },
    visibility,
  });
  const lines = [
    line(1, 'gm-tab', GM_ONLY_VISIBILITY),
    line(2, 'gm-tab', { kind: 'direct', to: ['bob'] }),
    line(3, 'main-tab'),
  ];

  it('keeps a line inserted in a tab as the nearest line said in it was kept, passing over a whisper', () => {
    expect(tabVisibilityNear(lines, 2, 'gm-tab')).toEqual(GM_ONLY_VISIBILITY);
    expect(tabVisibilityNear(lines, 0, 'gm-tab')).toEqual(GM_ONLY_VISIBILITY);
    expect(tabVisibilityNear(lines, 3, 'main-tab')).toEqual(PUBLIC_VISIBILITY);
    expect(tabVisibilityNear(lines, 3, 'new-tab')).toEqual(PUBLIC_VISIBILITY);
  });

  it('passes over a secret roll an older recording kept to the GM, which says nothing of the tab', () => {
    const secret = {
      ...line(4, 'main-tab', GM_ONLY_VISIBILITY),
      detail: { tabIdentifier: 'main-tab', tag: 'DiceBot secret' },
    };

    expect(tabVisibilityNear([line(3, 'main-tab'), secret], 2, 'main-tab')).toEqual(PUBLIC_VISIBILITY);
  });

  it('looks only at the lines the one writing sees, for the tab and for who could read it', () => {
    const sees = (event: ReplayEvent) => event.visibility.kind !== 'gm-only';

    expect(chatTabIdentifierNear(lines, 3, sees)).toBe('main-tab');
    expect(tabVisibilityNear(lines, 1, 'gm-tab', sees)).toEqual(PUBLIC_VISIBILITY);
  });

  it('puts the visibility on the line made', () => {
    const made = createReplayEntry(
      {
        kind: ReplayEventKind.ChatMessage,
        actorId: 'gm',
        speaker: 'GM',
        text: 'メモ',
        tabIdentifier: 'gm-tab',
        visibility: GM_ONLY_VISIBILITY,
      },
      10,
      10_000
    );
    expect(made.visibility).toEqual(GM_ONLY_VISIBILITY);
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

  describe('among lines of one speaker said a moment apart', () => {
    const by = (speaker: string, seq: number, moment: number, text = `発言 ${seq}`) =>
      said(createReplayEntry({ ...draft(ReplayEventKind.ChatMessage, text), actorId: speaker }, seq, seq * 10), moment);
    const minor = (event: ReplayEvent, value: number): ReplayEvent => ({
      ...event,
      patch: { ...event.patch!, after: { ...event.patch!.after, minorIndex: value } },
    });

    it('never says a roll moved up at the moment of a line of its speaker, which would take its result', () => {
      const events = [by('bob', 1, 1000), by('alice', 2, 1001), by('alice', 3, 5000, '2d6'), result(4, 40, 5001)];

      const stepped = stepReplayEvents(events, new Set([3]), -1);
      const back = stepReplayEvents(stepped, new Set([3, 4]), 1);

      expect(stepped.map((event) => event.seq)).toEqual([1, 3, 2, 4]);
      expect(momentOf(bySeq(stepped, 3))).not.toBe(1001);
      expect(momentOf(bySeq(stepped, 4))).toBe(momentOf(bySeq(stepped, 3)) + 1);
      expect(momentOf(bySeq(back, 4))).toBe(momentOf(bySeq(back, 3)) + 1);
    });

    it('keeps two lines of one speaker in the order they were moved to, with no answer between them to keep', () => {
      const events = [by('bob', 1, 10000, '2d6'), result(2, 20, 10001), by('carol', 3, 20000), by('carol', 4, 30000)];
      events[1].patch!.after['attributes.originFrom'] = 'bob';

      const first = stepReplayEvents(events, new Set([4]), -1);
      const second = stepReplayEvents(stepReplayEvents(first, new Set([3]), -1), new Set([3]), -1);
      const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);

      expect(second.map((event) => event.seq)).toEqual([1, 3, 2, 4]);
      expect(keyOf(bySeq(second, 3))).toBeLessThan(keyOf(bySeq(second, 4)));
      expect(keyOf(bySeq(second, 3))).toBeGreaterThan(keyOf(bySeq(second, 1)));
    });

    it('says a line moved above a run of its speaker’s lines a moment apart before the first of them', () => {
      const run = [0, 1, 2].map((n) => minor(by('alice', n + 2, 100000 + n), 0.5));
      const events = [minor(by('bob', 1, 99999), 0.5), ...run, by('alice', 9, 200000)];
      const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);

      const moved = moveReplayEvent(events, 9, -3);

      expect(moved.map((event) => event.seq)).toEqual([1, 9, 2, 3, 4]);
      expect(keyOf(bySeq(moved, 9))).toBeGreaterThan(99999.5);
      expect(keyOf(bySeq(moved, 9))).toBeLessThan(100000.5);
    });

    it('says a line moved before a roll of its speaker before it, never between the roll and its result', () => {
      const events = [
        minor(by('bob', 1, 99999), 0.5),
        minor(by('alice', 2, 100000, '2d6'), 0.5),
        result(3, 30, 100001),
        by('alice', 4, 200000),
      ];

      const moved = moveReplayEvent(events, 4, -2);

      expect(moved.map((event) => event.seq)).toEqual([1, 4, 2, 3]);
      expect(momentOf(bySeq(moved, 4))).toBeLessThan(100000);
      expect(momentOf(bySeq(moved, 3))).toBe(100001);
    });

    it('never says a line moved before a line with a notice at the moment just before that notice', () => {
      const notice = minor(by('alice', 4, 100002, 'HP -3'), 0.4);
      notice.patch!.after['attributes.from'] = 'System';
      const events = [
        minor(by('alice', 1, 50000), 0.3),
        minor(by('bob', 2, 99999), 0.5),
        minor(by('alice', 3, 100000, ':HP-3'), 0.6),
        notice,
      ];

      const moved = moveReplayEvent(events, 1, 1);
      const back = moveReplayEvent(moved, 1, -1);

      expect(moved.map((event) => event.seq)).toEqual([2, 1, 3, 4]);
      expect(momentOf(bySeq(moved, 1))).not.toBe(100001);
      expect(momentOf(bySeq(back, 4))).toBe(100002);
    });

    it('ties a result left behind by its roll to no other line of the speaker', () => {
      const events = [
        minor(by('dave', 9, 900000), 0.5),
        minor(by('alice', 1, 1000000), 0.4),
        minor(by('bob', 2, 1030000), 0.6),
        minor(by('alice', 3, 1060000, '2d6'), 0.5),
        minor(result(4, 40, 1060001), 0.3),
        minor(by('carol', 5, 1090000), 0.7),
      ];

      const together = stepReplayEvents(events, new Set([3, 4]), -1);
      const apart = moveReplayEvent(together, 3, 1);
      const moved = moveReplayEvent(apart, 1, -1);

      expect(apart.map((event) => event.seq)).toEqual([9, 1, 4, 3, 2, 5]);
      expect(momentOf(bySeq(moved, 4))).toBe(momentOf(bySeq(apart, 4)));
    });

    it('moves a notice left behind when there is no room for the lines moved in after it, keeping a roll with its result', () => {
      const answering = (event: ReplayEvent, asker: string): ReplayEvent => ({
        ...event,
        patch: { ...event.patch!, after: { ...event.patch!.after, 'attributes.originFrom': asker } },
      });
      const events = [
        minor(by('gm', 1, 1000000), 0.5),
        minor(by('quinn', 2, 1060000), 0.3),
        minor(by('pat', 3, 1060001), 0.7),
        minor(answering(by('System', 4, 1060003, '知らせ'), 'pat'), 0.1),
        minor(by('pat', 5, 1060004, '2d6'), 0.9),
        minor(answering(result(6, 60, 1060005), 'pat'), 0.9),
      ];
      const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);

      const stepped = stepReplayEvents(events, new Set([2, 3]), 1);
      const keys = stepped.map(keyOf);

      expect(stepped.map((event) => event.seq)).toEqual([1, 4, 2, 3, 5, 6]);
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
      expect(momentOf(bySeq(stepped, 6))).toBe(momentOf(bySeq(stepped, 5)) + 1);
    });

    describe('with results and notices left behind as their lines move', () => {
      const answering = (event: ReplayEvent, asker: string): ReplayEvent => ({
        ...event,
        patch: { ...event.patch!, after: { ...event.patch!.after, 'attributes.originFrom': asker } },
      });
      const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);
      const inOrder = (events: readonly ReplayEvent[]) => {
        const keys = events.map(keyOf);
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
      };

      it('keeps a line after a roll dropped below its result from coming between the roll and its notice', () => {
        const events = [
          minor(by('gm', 1, 995000), 0.5),
          minor(by('pat', 2, 1000000, '2d6'), 0.9),
          minor(by('gm', 3, 1000001), 0.1),
          minor(answering(result(4, 40, 1000001), 'pat'), 0.5),
          minor(answering(by('System', 5, 1000002, '知らせ'), 'pat'), 0.3),
          minor(by('gm', 6, 1000004), 0.5),
        ];

        const moved = moveReplayEvent(events, 2, 2);

        inOrder(moved);
      });

      it('leaves room behind a roll it moves for the results left behind after it, in a run said a moment apart', () => {
        const events = [
          minor(by('gm', 1, 1000007), 0.8),
          minor(by('quinn', 2, 1000008, '2d6'), 0.5),
          minor(answering(result(3, 30, 1000009), 'quinn'), 0.5),
          minor(by('gm', 4, 1000010), 0.5),
          minor(by('quinn', 5, 1000011, '2d6'), 0.5),
          minor(answering(result(6, 60, 1000012), 'quinn'), 0.5),
          minor(by('quinn', 7, 1000013), 0.5),
          minor(answering(by('System', 8, 1000015, '知らせ'), 'quinn'), 0.5),
        ];

        const stepped = stepReplayEvents(events, new Set([2, 5]), 1);

        expect(stepped.map((event) => event.seq)).toEqual([1, 3, 2, 4, 6, 5, 7, 8]);
        inOrder(stepped);
      });

      it('keeps a run of rolls by one speaker in order when several are stepped down past their results', () => {
        const events = [
          minor(by('quinn', 1, 1000002, '2d6'), 0.5),
          minor(answering(result(2, 20, 1000003), 'quinn'), 0.5),
          minor(by('quinn', 3, 1000004, '2d6'), 0.5),
          minor(answering(result(4, 40, 1000005), 'quinn'), 0.5),
          minor(by('quinn', 5, 1000006, '2d6'), 0.5),
          minor(answering(result(6, 60, 1000007), 'quinn'), 0.5),
          minor(by('quinn', 7, 1000008, '2d6'), 0.5),
          minor(answering(result(8, 80, 1000009), 'quinn'), 0.5),
          minor(by('gm', 9, 1000010), 0.5),
        ];

        const stepped = stepReplayEvents(events, new Set([1, 3, 5]), 1);

        expect(stepped.map((event) => event.seq)).toEqual([2, 1, 4, 3, 6, 5, 7, 8, 9]);
        inOrder(stepped);
      });

      it('leaves a result where it is when it fits there, so that the next edit still has room for its roll', () => {
        const events = [
          minor(by('quinn', 1, 1000001, '2d6'), 0.5),
          minor(answering(result(2, 20, 1000002), 'quinn'), 0.5),
          minor(by('quinn', 3, 1000004, '2d6'), 0.5),
          minor(answering(result(4, 40, 1000005), 'quinn'), 0.5),
          minor(answering(by('System', 5, 1000006, '知らせ'), 'quinn'), 0.5),
          minor(by('gm', 6, 1000007), 0.5),
        ];

        const moved = moveReplayEvent(events, 3, 2);
        const stepped = stepReplayEvents(moved, new Set([1]), 1);

        expect(momentOf(bySeq(moved, 4))).toBe(1000005);
        inOrder(stepped);
      });

      it('counts the room up to the next line kept to the moment it is said in, fraction and all', () => {
        const events = [
          minor(by('gm', 1, 1000000), 0.07),
          minor(by('pat', 2, 1000001, '2d6'), 0.31),
          minor(answering(result(3, 30, 1000002), 'pat'), 0.26),
          minor(by('pat', 4, 1000003, '2d6'), 0.97),
          minor(answering(result(5, 50, 1000004), 'pat'), 0.1),
          minor(by('pat', 6, 1000005), 0.32),
          minor(answering(by('System', 7, 1000007, '知らせ'), 'pat'), 0.68),
        ];

        const stepped = stepReplayEvents(events, new Set([2, 4]), 1);

        inOrder(stepped);
      });
    });

    it('leaves a result whose roll was deleted at its moment, where that ties it to no other line', () => {
      const events = [
        minor(by('bob', 1, 1000000), 0.4),
        minor(by('alice', 2, 1060000, '2d6'), 0.5),
        minor(result(3, 30, 1060001), 0.3),
        minor(by('dave', 4, 1120000), 0.6),
      ];

      const left = removeReplayEvent(events, 2);

      expect(momentOf(bySeq(left, 3))).toBe(1060001);
    });

    it('leaves a result tied to its roll made again later, when only the first making is deleted', () => {
      const roll = minor(by('alice', 2, 1060000, '2d6'), 0.5);
      const answer = minor(result(3, 30, 1060001), 0.3);
      const events = [
        minor(by('bob', 1, 1000000), 0.4),
        roll,
        answer,
        minor(by('dave', 4, 1120000), 0.6),
        { ...minor(by('alice', 5, 1060000, '2d6'), 0.5), patch: { ...roll.patch! } },
        { ...minor(result(6, 60, 1060001), 0.3), patch: { ...answer.patch! } },
      ];

      const left = removeReplayEvent(events, 2);

      expect(momentOf(bySeq(left, 3))).toBe(1060001);
      expect(momentOf(bySeq(left, 6))).toBe(1060001);
    });

    it('ties a result whose roll was deleted to no other line of the speaker', () => {
      const events = [
        minor(by('dave', 9, 900000), 0.5),
        minor(by('alice', 1, 1000000), 0.4),
        minor(by('alice', 3, 1000001, '2d6'), 0.5),
        minor(result(4, 40, 1000002), 0.3),
        minor(by('carol', 5, 1090000), 0.7),
      ];

      const left = removeReplayEvent(events, 3);
      const moved = moveReplayEvent(left, 1, -1);

      expect(moved.map((event) => event.seq)).toEqual([1, 9, 4, 5]);
      expect(momentOf(bySeq(moved, 4))).toBe(momentOf(bySeq(left, 4)));
    });

    it('keeps a result moved on its own with its roll, never handing it to a line moved beside the roll', () => {
      const events = [
        minor(by('alice', 1, 95000), 0.3),
        minor(by('bob', 2, 100000), 0.6),
        minor(by('alice', 3, 100001, '2d6'), 0.5),
        minor(result(4, 40, 100002), 0.4),
        minor(by('carol', 5, 105000), 0.7),
      ];

      const stepped = stepReplayEvents(events, new Set([1, 4]), 1);

      expect(stepped.map((event) => event.seq)).toEqual([2, 1, 3, 5, 4]);
      expect(momentOf(bySeq(stepped, 1))).not.toBe(100001);
      expect(momentOf(bySeq(stepped, 4))).toBe(100002);
    });

    it('puts a roll with a result alone just after the line before it, though its speaker says the moment after', () => {
      const events = [
        minor(by('bob', 1, 100000), 0.9),
        minor(by('carol', 2, 100001), 0.4),
        minor(by('alice', 3, 100002), 0.8),
        minor(by('alice', 4, 105000, '2d6'), 0.5),
        minor(result(5, 50, 105001), 0.1),
      ];
      const keyOf = (event: ReplayEvent) => momentOf(event) + Number(event.patch?.after['minorIndex'] ?? 0);

      const moved = moveReplayEvent(removeReplayEvent(events, 2), 4, -1);

      expect(moved.map((event) => event.seq)).toEqual([1, 4, 3, 5]);
      expect(keyOf(bySeq(moved, 4))).toBeLessThan(keyOf(bySeq(moved, 3)));
      expect(momentOf(bySeq(moved, 5))).toBe(momentOf(bySeq(moved, 4)) + 1);
    });

    it.each([
      ['a fraction that is no number', Number.NaN],
      ['a fraction past all bounds', Number.POSITIVE_INFINITY],
      ['a fraction far too large', 1e300],
    ])('takes %s for none, rather than never finishing', (_what, fraction) => {
      const events = [
        minor(by('bob', 1, 100000), fraction),
        by('carol', 2, 100100),
        by('alice', 3, 100200, '2d6'),
        result(4, 40, 100201),
        by('alice', 5, 100300, '2d6'),
        result(6, 60, 100301),
      ];

      const stepped = stepReplayEvents(events, new Set([3, 4, 5, 6]), -1);
      const moved = moveReplayEvent(events, 3, -1);

      expect(stepped.every((event) => Number.isFinite(momentOf(event)))).toBe(true);
      expect(Number.isFinite(momentOf(bySeq(moved, 3)))).toBe(true);
    });

    it('takes a moment too near the largest a number counts exactly for none, rather than never finishing', () => {
      const near = 2 ** 53 - 10;
      const lines = [0, 1, 2, 3].flatMap((n) => [
        by('alice', 10 + n * 2, 100 + n, '2d6'),
        result(11 + n * 2, 0, 101 + n),
      ]);
      const events = [by('alice', 1, near), ...lines];

      const stepped = stepReplayEvents(events, new Set(lines.map((event) => event.seq)), -1);

      expect(stepped).toHaveLength(events.length);
    });

    it.each([
      ['no number', Number.NaN],
      ['one too large to count on', 2 ** 53],
    ])('takes a line said at %s for no line, rather than never finishing', (_what, moment) => {
      const events = [by('alice', 2, 500), result(1, 10, moment)];

      const moved = stepReplayEvents(events, new Set([2]), 1);

      expect(moved.map((event) => event.seq)).toEqual([1, 2]);
      expect(momentOf(bySeq(moved, 2))).toBe(500);
    });

    it('never says a line moved before a roll at the moment of that roll, which would take its result', () => {
      const events = [by('bob', 1, 10000), minor(by('alice', 2, 10001, '2d6'), 0.7), result(3, 30, 10002)];

      const moved = moveReplayEvent([...events, by('alice', 4, 30000)], 4, -2);

      expect(moved.map((event) => event.seq)).toEqual([1, 4, 2, 3]);
      expect(momentOf(bySeq(moved, 4))).not.toBe(10001);
      expect(momentOf(bySeq(moved, 4))).toBeLessThan(10001.7);
    });
  });

  it('leaves the moments of the lines that did not move alone', () => {
    const events = [line(1, 1000, 103000), line(2, 1100, 103100), line(3, 1200, 103200)];

    const moved = moveReplayEvent(events, 3, -1);

    expect(momentOf(bySeq(moved, 1))).toBe(103000);
    expect(momentOf(bySeq(moved, 2))).toBe(103100);
  });
});
