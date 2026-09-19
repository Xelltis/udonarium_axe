import { encode } from '@axe/core/util/message-pack';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  decodeReplayEvents,
  decodeReplayManifest,
  encodeReplayEvents,
  encodeReplayManifest,
  isSupportedReplayFormat,
} from '@axe/domain/replay/replay-codec';
import {
  PUBLIC_VISIBILITY,
  REPLAY_FORMAT_VERSION,
  ReplayDetailLevel,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';

const moveEvent: ReplayEvent = {
  seq: 7,
  at: 1_700_000_000_000,
  t: 4_200,
  kind: ReplayEventKind.ObjectMove,
  actorId: 'alice',
  targetId: 'c1',
  detail: { from: { name: 'table', x: 0, y: 0, z: 0 }, to: { name: 'table', x: 100, y: 50, z: 0 } },
  patch: {
    identifier: 'c1',
    aliasName: 'character',
    before: { location: { name: 'table', x: 0, y: 0 } },
    after: { location: { name: 'table', x: 100, y: 50 } },
  },
  visibility: PUBLIC_VISIBILITY,
  merged: 3,
};

const chatEvent: ReplayEvent = {
  seq: 8,
  at: 1_700_000_001_000,
  t: 5_200,
  kind: ReplayEventKind.ChatMessage,
  actorId: 'bob',
  detail: { text: 'こんばんは' },
  visibility: { kind: 'direct', to: ['alice'] },
};

describe('isSupportedReplayFormat()', () => {
  it('takes the current format', () => {
    expect(isSupportedReplayFormat(REPLAY_FORMAT_VERSION)).toBe(true);
  });

  it('takes every earlier format', () => {
    expect(REPLAY_FORMAT_VERSION).toBe(3);
    expect(isSupportedReplayFormat(1)).toBe(true);
    expect(isSupportedReplayFormat(2)).toBe(true);
  });

  it('turns away a later format and a broken value', () => {
    expect(isSupportedReplayFormat(REPLAY_FORMAT_VERSION + 1)).toBe(false);
    expect(isSupportedReplayFormat(0)).toBe(false);
    expect(isSupportedReplayFormat('1')).toBe(false);
    expect(isSupportedReplayFormat(undefined)).toBe(false);
  });
});

describe('encodeReplayEvents() / decodeReplayEvents()', () => {
  it('makes the round trip with a run of events', () => {
    const decoded = decodeReplayEvents(encodeReplayEvents([moveEvent, chatEvent]));
    expect(decoded).toEqual([moveEvent, chatEvent]);
  });

  it('grows no field that was left out', () => {
    const decoded = decodeReplayEvents(encodeReplayEvents([chatEvent]));
    expect('targetId' in decoded[0]).toBe(false);
    expect('patch' in decoded[0]).toBe(false);
    expect('merged' in decoded[0]).toBe(false);
    expect('parts' in decoded[0]).toBe(false);
    expect('removedParts' in decoded[0]).toBe(false);
  });

  it('carries the parts that came and went with a piece', () => {
    const arrival: ReplayEvent = {
      ...moveEvent,
      kind: ReplayEventKind.ObjectCreate,
      parts: [{ identifier: 'hp', aliasName: 'data', before: {}, after: { value: 10 } }],
    };
    const removal: ReplayEvent = { ...moveEvent, seq: 9, kind: ReplayEventKind.ObjectRemove, removedParts: ['hp'] };

    expect(decodeReplayEvents(encodeReplayEvents([arrival, removal]))).toEqual([arrival, removal]);
  });

  it('makes it with an empty run', () => {
    expect(decodeReplayEvents(encodeReplayEvents([]))).toEqual([]);
  });

  it('returns nothing for a format it does not support', () => {
    const future = encode({ v: REPLAY_FORMAT_VERSION + 1, events: [moveEvent] });
    expect(decodeReplayEvents(future)).toEqual([]);
  });

  it('does not fall over on broken contents', () => {
    expect(decodeReplayEvents(encode({ v: REPLAY_FORMAT_VERSION }))).toEqual([]);
    expect(decodeReplayEvents(encode(null))).toEqual([]);
  });
});

describe('encodeReplayManifest() / decodeReplayManifest()', () => {
  const manifest: ReplayManifest = {
    formatVersion: REPLAY_FORMAT_VERSION,
    roomName: '第一夜',
    startedAt: 1_700_000_000_000,
    endedAt: null,
    recordedBy: {
      userId: 'gm',
      peerId: 'p1',
      name: 'ゲームマスター',
      role: PeerRole.GameMaster,
      imageIdentifier: '',
      sinceSeq: 0,
    },
    detailLevel: ReplayDetailLevel.Notable,
    actors: [],
    targets: [],
    keyframes: [{ seq: 0, at: 1_700_000_000_000, byteSize: 2048 }],
    chunks: [{ index: 0, seqStart: 1, seqEnd: 40, eventCount: 40, byteSize: 900 }],
  };

  it('makes the round trip with the catalogue', () => {
    expect(decodeReplayManifest(encodeReplayManifest(manifest))).toEqual(manifest);
  });

  it('returns nothing for a format it does not support', () => {
    const future = encode({ v: REPLAY_FORMAT_VERSION + 1, manifest });
    expect(decodeReplayManifest(future)).toBeNull();
  });
});

describe('reading a recording written in format 2', () => {
  it('reads the parts of a piece told as events of their own', () => {
    const arrival = { ...moveEvent, seq: 1, kind: ReplayEventKind.ObjectCreate, targetId: 'c1' };
    const part = {
      ...moveEvent,
      seq: 2,
      kind: ReplayEventKind.ObjectCreate,
      targetId: 'hp',
      detail: { part: true },
      patch: { identifier: 'hp', aliasName: 'data', before: {}, after: { parentIdentifier: 'c1' } },
    };

    const decoded = decodeReplayEvents(encode({ v: 2, events: [arrival, part] }));

    expect(decoded.map((event) => event.targetId)).toEqual(['c1', 'hp']);
    expect(decoded[1].detail['part']).toBe(true);
    expect('parts' in decoded[0]).toBe(false);
  });
});

describe('reading a broken recording', () => {
  it('drops folded parts of the wrong shape and keeps the rest', () => {
    const bytes = encode({
      v: REPLAY_FORMAT_VERSION,
      events: [
        {
          ...moveEvent,
          kind: ReplayEventKind.ObjectCreate,
          parts: [{ identifier: 'hp', aliasName: 'data', before: {}, after: { value: 1 } }, { identifier: 3 }, 'x'],
          removedParts: ['hp', 7, ''],
        },
      ],
    });

    const [event] = decodeReplayEvents(bytes);

    expect(event.parts?.map((part) => part.identifier)).toEqual(['hp']);
    expect(event.removedParts).toEqual(['hp']);
  });

  it('keeps no list of folded parts that is not a list', () => {
    const bytes = encode({ v: REPLAY_FORMAT_VERSION, events: [{ ...chatEvent, parts: 'hp', removedParts: {} }] });

    const [event] = decodeReplayEvents(bytes);

    expect('parts' in event).toBe(false);
    expect('removedParts' in event).toBe(false);
  });

  it('drops an event of the wrong shape', () => {
    const bytes = encode({ v: REPLAY_FORMAT_VERSION, events: [{ seq: 1 }, null, 'x', { kind: 'chat.message' }] });
    expect(decodeReplayEvents(bytes)).toEqual([]);
  });

  it('fills a missing field in with its default', () => {
    const bytes = encode({
      v: REPLAY_FORMAT_VERSION,
      events: [{ seq: 1, kind: ReplayEventKind.ChatMessage, patch: 'こわれている' }],
    });
    const [event] = decodeReplayEvents(bytes);

    expect(event.detail).toEqual({});
    expect(event.visibility).toEqual(PUBLIC_VISIBILITY);
    expect(event.actorId).toBe('');
    expect(event.at).toBe(0);
    expect(event.patch).toBeUndefined();
  });

  it('keeps a hidden event addressed as it was', () => {
    const bytes = encode({
      v: REPLAY_FORMAT_VERSION,
      events: [
        { seq: 1, kind: ReplayEventKind.ChatMessage, visibility: { kind: 'direct', to: ['bob'] } },
        { seq: 2, kind: ReplayEventKind.ChatMessage, visibility: { kind: 'gm-only' } },
      ],
    });
    const [direct, gmOnly] = decodeReplayEvents(bytes);

    expect(direct.visibility).toEqual({ kind: 'direct', to: ['bob'] });
    expect(gmOnly).toEqual(expect.objectContaining({ visibility: { kind: 'gm-only' } }));
  });

  it('reads no catalogue of the wrong shape', () => {
    expect(decodeReplayManifest(encode({ v: REPLAY_FORMAT_VERSION, manifest: null }))).toBeNull();
    expect(decodeReplayManifest(encode({ v: REPLAY_FORMAT_VERSION, manifest: { formatVersion: 99 } }))).toBeNull();
  });

  it('fills a missing list in as empty', () => {
    const bytes = encode({
      v: REPLAY_FORMAT_VERSION,
      manifest: { formatVersion: REPLAY_FORMAT_VERSION, roomName: 7, endedAt: 'まだ' },
    });
    const manifest = decodeReplayManifest(bytes)!;

    expect(manifest.roomName).toBe('');
    expect(manifest.startedAt).toBe(0);
    expect(manifest.endedAt).toBeNull();
    expect(manifest.actors).toEqual([]);
    expect(manifest.targets).toEqual([]);
    expect(manifest.keyframes).toEqual([]);
    expect(manifest.chunks).toEqual([]);
  });
});
