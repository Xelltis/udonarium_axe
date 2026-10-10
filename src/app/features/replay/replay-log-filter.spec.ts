import { PeerRole } from '@axe/domain/peer/peer-role';
import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  collectReplayActorIds,
  DEFAULT_REPLAY_LOG_FILTER,
  filterReplayEvents,
  ReplayLogScope,
} from '@axe/features/replay/replay-log-filter';

const viewer = { userId: 'alice', role: PeerRole.Player };
const gm = { userId: 'gm', role: PeerRole.GameMaster };

function event(seq: number, kind: ReplayEventKind, overrides: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind,
    actorId: 'alice',
    detail: {},
    visibility: PUBLIC_VISIBILITY,
    ...overrides,
  };
}

const events: ReplayEvent[] = [
  event(1, ReplayEventKind.ChatMessage),
  event(2, ReplayEventKind.ObjectMove),
  event(3, ReplayEventKind.ChatDice, { actorId: 'bob' }),
  event(4, ReplayEventKind.Marker),
  event(5, ReplayEventKind.ChatMessage, { visibility: { kind: 'gm-only' } }),
];

describe('filterReplayEvents()', () => {
  it('never lists the parts that arrive with a piece, nor the cue of a change of value', () => {
    const filtered = filterReplayEvents(
      [
        event(1, ReplayEventKind.ObjectCreate, { targetId: 'hero' }),
        event(2, ReplayEventKind.ObjectCreate, { targetId: 'hero-hp', detail: { part: true } }),
        event(3, ReplayEventKind.ObjectValue, { targetId: 'hero', detail: { changes: [] } }),
      ],
      { ...DEFAULT_REPLAY_LOG_FILTER, showSystem: true, showIncidental: true },
      gm
    );
    expect(filtered.map((e) => e.seq)).toEqual([1]);
  });

  it('leaves the running of the room out until it is asked for', () => {
    const running = [
      event(1, ReplayEventKind.PeerJoin),
      event(2, ReplayEventKind.ObjectLock),
      event(3, ReplayEventKind.ChatMessage),
    ];

    expect(filterReplayEvents(running, DEFAULT_REPLAY_LOG_FILTER, viewer).map((e) => e.seq)).toEqual([3]);
    expect(
      filterReplayEvents(running, { ...DEFAULT_REPLAY_LOG_FILTER, showSystem: true }, viewer).map((e) => e.seq)
    ).toEqual([1, 2, 3]);
  });

  it('returns everything that can be seen', () => {
    const filtered = filterReplayEvents(events, DEFAULT_REPLAY_LOG_FILTER, viewer);
    expect(filtered.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('returns the hidden events to the game master', () => {
    const filtered = filterReplayEvents(events, DEFAULT_REPLAY_LOG_FILTER, gm);
    expect(filtered.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('narrows to the chat', () => {
    const filtered = filterReplayEvents(events, { ...DEFAULT_REPLAY_LOG_FILTER, scope: ReplayLogScope.Chat }, viewer);
    expect(filtered.map((e) => e.seq)).toEqual([1, 3, 4]);
  });

  it('narrows to the board', () => {
    const filtered = filterReplayEvents(events, { ...DEFAULT_REPLAY_LOG_FILTER, scope: ReplayLogScope.Board }, viewer);
    expect(filtered.map((e) => e.seq)).toEqual([2, 4]);
  });

  it('keeps the markers through any of them', () => {
    for (const scope of [ReplayLogScope.All, ReplayLogScope.Chat, ReplayLogScope.Board]) {
      const filtered = filterReplayEvents(events, { ...DEFAULT_REPLAY_LOG_FILTER, scope }, viewer);
      expect(filtered.some((e) => e.kind === ReplayEventKind.Marker)).toBe(true);
    }
  });

  it('narrows by person', () => {
    const filtered = filterReplayEvents(events, { ...DEFAULT_REPLAY_LOG_FILTER, actorId: 'bob' }, viewer);
    expect(filtered.map((e) => e.seq)).toEqual([3]);
  });

  it('hides what is hidden', () => {
    const filtered = filterReplayEvents(events, { ...DEFAULT_REPLAY_LOG_FILTER, hideSecret: true }, gm);
    expect(filtered.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });
});

describe('collectReplayActorIds()', () => {
  it('gathers everybody who appears, once each', () => {
    expect(collectReplayActorIds(events)).toEqual(['alice', 'bob']);
  });

  it('returns nothing for nothing', () => {
    expect(collectReplayActorIds([])).toEqual([]);
  });
});

describe('the sounds that go with it', () => {
  const withSe = [
    event(1, ReplayEventKind.ChatMessage),
    event(2, ReplayEventKind.ObjectMove),
    event(3, ReplayEventKind.MediaSoundEffect),
  ];

  it('gives them no line of their own', () => {
    expect(filterReplayEvents(withSe, DEFAULT_REPLAY_LOG_FILTER, viewer).map((e) => e.seq)).toEqual([1, 2]);
  });

  it('gives them none even narrowed to the board', () => {
    const filter = { ...DEFAULT_REPLAY_LOG_FILTER, scope: ReplayLogScope.Board };
    expect(filterReplayEvents(withSe, filter, viewer).map((e) => e.seq)).toEqual([2]);
  });

  it('gives them one when they are asked for', () => {
    const filter = { ...DEFAULT_REPLAY_LOG_FILTER, showIncidental: true };
    expect(filterReplayEvents(withSe, filter, viewer).map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});
