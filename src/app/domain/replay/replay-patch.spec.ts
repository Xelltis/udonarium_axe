import {
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayPatch,
} from '@axe/domain/replay/replay-event';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';
import { applyReplayEvents, applyReplayPatch, indexOfSeq } from '@axe/domain/replay/replay-patch';

function patchEvent(seq: number, patch: ReplayPatch, kind: ReplayEventKind = ReplayEventKind.ObjectMove): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind,
    actorId: 'alice',
    targetId: patch.identifier,
    detail: {},
    patch,
    visibility: PUBLIC_VISIBILITY,
  };
}

describe('applyReplayPatch()', () => {
  it('writes to a nested attribute by its path', () => {
    const next = applyReplayPatch(
      { value: '', attributes: { posZ: 0, rotate: 45, owner: 'alice' } },
      {
        identifier: 'c1',
        aliasName: 'character',
        before: { 'attributes.posZ': 0 },
        after: { 'attributes.posZ': 30 },
      }
    );
    expect(next).toEqual({ value: '', attributes: { posZ: 30, rotate: 45, owner: 'alice' } });
  });

  it('removes a key the later state does not have', () => {
    const next = applyReplayPatch(
      { attributes: { posZ: 0, owner: 'alice' } },
      { identifier: 'c1', aliasName: 'character', before: { 'attributes.owner': 'alice' }, after: {} }
    );
    expect(next).toEqual({ attributes: { posZ: 0 } });
  });

  it('builds from the later values alone when there was nothing before', () => {
    const next = applyReplayPatch(null, {
      identifier: 'c1',
      aliasName: 'character',
      before: {},
      after: { 'attributes.posZ': 10 },
    });
    expect(next).toEqual({ attributes: { posZ: 10 } });
  });

  it('leaves the values it was given alone', () => {
    const source = { attributes: { location: { x: 0, y: 0 } } };
    const next = applyReplayPatch(source, {
      identifier: 'c1',
      aliasName: 'character',
      before: { 'attributes.location': { x: 0, y: 0 } },
      after: { 'attributes.location': { x: 5, y: 0 } },
    });
    expect(source.attributes.location).toEqual({ x: 0, y: 0 });
    expect((next['attributes'] as Record<string, unknown>)['location']).toEqual({ x: 5, y: 0 });
  });
});

describe('applyReplayEvents()', () => {
  const start: ReplayObjectSnapshot[] = [
    { identifier: 'c1', aliasName: 'character', syncData: { attributes: { posZ: 0, rotate: 0 } } },
    { identifier: 'c2', aliasName: 'character', syncData: { attributes: { posZ: 0 } } },
  ];

  it('carries the board forward, applying them in order', () => {
    const result = applyReplayEvents(start, [
      patchEvent(1, {
        identifier: 'c1',
        aliasName: 'character',
        before: { 'attributes.posZ': 0 },
        after: { 'attributes.posZ': 30 },
      }),
      patchEvent(2, {
        identifier: 'c1',
        aliasName: 'character',
        before: { 'attributes.rotate': 0 },
        after: { 'attributes.rotate': 90 },
      }),
    ]);
    expect(result.find((o) => o.identifier === 'c1')?.syncData).toEqual({ attributes: { posZ: 30, rotate: 90 } });
  });

  it('adds an object that appears along the way', () => {
    const result = applyReplayEvents(start, [
      patchEvent(
        1,
        { identifier: 'c3', aliasName: 'card', before: {}, after: { 'attributes.state': 'front' } },
        ReplayEventKind.ObjectCreate
      ),
    ]);
    expect(result.find((o) => o.identifier === 'c3')).toEqual({
      identifier: 'c3',
      aliasName: 'card',
      syncData: { attributes: { state: 'front' } },
    });
  });

  it('lays the parts that arrived with a piece', () => {
    const arrival: ReplayEvent = {
      ...patchEvent(
        1,
        { identifier: 'c3', aliasName: 'character', before: {}, after: { 'attributes.name': 'ゴブリン' } },
        ReplayEventKind.ObjectCreate
      ),
      parts: [
        { identifier: 'hp', aliasName: 'data', before: {}, after: { parentIdentifier: 'c3', value: 8 } },
        { identifier: 'mp', aliasName: 'data', before: {}, after: { parentIdentifier: 'c3', value: 2 } },
      ],
    };

    const result = applyReplayEvents(start, [arrival]);

    expect(result.map((o) => o.identifier)).toEqual(['c1', 'c2', 'c3', 'hp', 'mp']);
    expect(result.find((o) => o.identifier === 'hp')).toEqual({
      identifier: 'hp',
      aliasName: 'data',
      syncData: { parentIdentifier: 'c3', value: 8 },
    });
  });

  it('takes the parts away with the piece they went with', () => {
    const board: ReplayObjectSnapshot[] = [
      ...start,
      { identifier: 'hp', aliasName: 'data', syncData: { parentIdentifier: 'c2' } },
    ];
    const removal: ReplayEvent = {
      seq: 1,
      at: 1000,
      t: 1000,
      kind: ReplayEventKind.ObjectRemove,
      actorId: 'alice',
      targetId: 'c2',
      detail: {},
      removedParts: ['hp'],
      visibility: PUBLIC_VISIBILITY,
    };

    expect(applyReplayEvents(board, [removal]).map((o) => o.identifier)).toEqual(['c1']);
  });

  it('takes away one that is put away', () => {
    const removal: ReplayEvent = {
      seq: 1,
      at: 1000,
      t: 1000,
      kind: ReplayEventKind.ObjectRemove,
      actorId: 'alice',
      targetId: 'c2',
      detail: {},
      visibility: PUBLIC_VISIBILITY,
    };
    const result = applyReplayEvents(start, [removal]);
    expect(result.map((o) => o.identifier)).toEqual(['c1']);
  });

  it('leaves the board it was given alone', () => {
    applyReplayEvents(start, [
      patchEvent(1, {
        identifier: 'c1',
        aliasName: 'character',
        before: { 'attributes.posZ': 0 },
        after: { 'attributes.posZ': 99 },
      }),
    ]);
    expect(start[0].syncData).toEqual({ attributes: { posZ: 0, rotate: 0 } });
  });

  it('passes over an event with no patch', () => {
    const marker: ReplayEvent = {
      seq: 1,
      at: 1000,
      t: 1000,
      kind: ReplayEventKind.Marker,
      actorId: 'alice',
      detail: { label: '第二幕' },
      visibility: PUBLIC_VISIBILITY,
    };
    expect(applyReplayEvents(start, [marker])).toHaveLength(2);
  });
});

describe('indexOfSeq()', () => {
  const events = [1, 4, 9].map((seq) =>
    patchEvent(seq, { identifier: 'c1', aliasName: 'character', before: {}, after: {} })
  );

  it('returns the last position at or before that number', () => {
    expect(indexOfSeq(events, 0)).toBe(-1);
    expect(indexOfSeq(events, 1)).toBe(0);
    expect(indexOfSeq(events, 5)).toBe(1);
    expect(indexOfSeq(events, 100)).toBe(2);
  });

  it('returns nothing for an empty run', () => {
    expect(indexOfSeq([], 5)).toBe(-1);
  });
});

describe('copying as it applies the events', () => {
  const board: ReplayObjectSnapshot[] = [
    { identifier: 'c1', aliasName: 'character', syncData: { attributes: { name: 'アリス' } } },
  ];

  it('leaves the original alone when the result is written to', () => {
    const applied = applyReplayEvents(board, []);
    (applied[0].syncData['attributes'] as Record<string, unknown>)['name'] = 'ボブ';

    expect((board[0].syncData['attributes'] as Record<string, unknown>)['name']).toBe('アリス');
  });

  it('copies nothing where it is known that nothing will be written', () => {
    const applied = applyReplayEvents(board, [], { shareInput: true });

    expect(applied[0]).toBe(board[0]);
  });

  it('still makes what it applied a separate thing even then', () => {
    const applied = applyReplayEvents(
      board,
      [
        patchEvent(1, {
          identifier: 'c1',
          aliasName: 'character',
          before: { 'attributes.name': 'アリス' },
          after: { 'attributes.name': 'ボブ' },
        }),
      ],
      { shareInput: true }
    );

    expect(applied[0]).not.toBe(board[0]);
    expect((board[0].syncData['attributes'] as Record<string, unknown>)['name']).toBe('アリス');
  });
});
