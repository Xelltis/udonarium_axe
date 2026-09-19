import { PeerRole } from '@axe/domain/peer/peer-role';
import type { ReplayCastMember } from '@axe/domain/replay/replay-cast';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
} from '@axe/domain/replay/replay-event';
import {
  buildReplayStoryboard,
  EMPTY_REPLAY_STORYBOARD,
  REPLAY_CHAPTER_HOLD_MS,
  REPLAY_SHOT_MAX_CHARS,
  REPLAY_SHOT_MIN_MS,
  REPLAY_SHOT_PER_CHAR_MS,
  ReplayShotPacing,
  ReplayShotScope,
  shotAt,
} from '@axe/domain/replay/replay-storyboard';

function say(seq: number, text: string, name = 'アリス', overrides: Partial<ReplayEvent> = {}): ReplayEvent {
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind: ReplayEventKind.ChatMessage,
    actorId: 'alice',
    detail: { text, name },
    visibility: PUBLIC_VISIBILITY,
    ...overrides,
  };
}

function marker(seq: number, label: string): ReplayEvent {
  return { ...say(seq, ''), kind: ReplayEventKind.Marker, detail: { label } };
}

const cast: ReplayCastMember[] = [
  { identifier: 'c1', name: 'アリス', imageIdentifier: 'img-alice', chatColor: '#112233', onTable: true },
];

describe('buildReplayStoryboard()', () => {
  it('lays the lines out as shots with their lengths', () => {
    const board = buildReplayStoryboard([say(1, 'やあ'), say(2, 'こんばんは')], cast);

    expect(board.shots).toHaveLength(2);
    expect(board.shots[0].startMs).toBe(0);
    expect(board.shots[0].durationMs).toBe(REPLAY_SHOT_MIN_MS + 2 * REPLAY_SHOT_PER_CHAR_MS);
    expect(board.shots[1].startMs).toBe(board.shots[0].durationMs);
    expect(board.totalMs).toBe(board.shots[0].durationMs + board.shots[1].durationMs);
  });

  it('carries a long line on to another shot rather than cutting it', () => {
    const board = buildReplayStoryboard([say(1, 'あ'.repeat(500))], cast);

    expect(board.shots.length).toBe(Math.ceil(500 / REPLAY_SHOT_MAX_CHARS));
    expect(board.shots.map((shot) => shot.text).join('')).toBe('あ'.repeat(500));
    expect(board.shots.every((shot) => shot.speaker === 'アリス')).toBe(true);
  });

  it('leaves a short one as one shot', () => {
    expect(buildReplayStoryboard([say(1, 'やあ')], cast).shots).toHaveLength(1);
  });

  it('fills the speakers portrait in from their piece', () => {
    const board = buildReplayStoryboard([say(1, 'やあ')], cast);
    expect(board.shots[0].portraitId).toBe('img-alice');
    expect(board.shots[0].isNarration).toBe(false);
  });

  it('takes the portrait a line carries over that', () => {
    const board = buildReplayStoryboard(
      [say(1, 'やあ', 'アリス', { detail: { text: 'やあ', name: 'アリス', imageIdentifier: 'img-said' } })],
      cast
    );
    expect(board.shots[0].portraitId).toBe('img-said');
  });

  it('reads a line with no name as narration', () => {
    const board = buildReplayStoryboard([say(1, 'しんと静まり返った', '')], cast);
    expect(board.shots[0].isNarration).toBe(true);
    expect(board.shots[0].speaker).toBe('');
  });

  it('puts a marker in as a chapter heading', () => {
    const board = buildReplayStoryboard([say(1, 'やあ'), marker(2, '第二幕'), say(3, 'ここから')], cast);

    expect(board.shots.map((shot) => shot.isChapterStart)).toEqual([false, true, false]);
    expect(board.shots[1].durationMs).toBe(REPLAY_CHAPTER_HOLD_MS);
    expect(board.shots.map((shot) => shot.chapter)).toEqual(['', '第二幕', '第二幕']);
  });

  it('carries a change of scene in the novel mode through as the backdrop', () => {
    const scene: ReplayEvent = {
      ...say(1, ''),
      kind: ReplayEventKind.VnScene,
      targetId: 'bg-1',
      detail: {},
    };
    const board = buildReplayStoryboard([say(1, '前'), scene, say(3, '後')], cast);

    expect(board.shots.map((shot) => shot.backgroundId)).toEqual(['', 'bg-1']);
  });

  it('pictures nothing that happens on the board by default', () => {
    const move: ReplayEvent = { ...say(2, ''), kind: ReplayEventKind.ObjectMove, detail: {} };
    const cutIn: ReplayEvent = { ...say(3, ''), kind: ReplayEventKind.MediaCutIn, detail: { text: '幕間' } };
    const board = buildReplayStoryboard([say(1, 'やあ'), move, cutIn], cast);

    expect(board.shots).toHaveLength(1);
  });

  it('makes shots of it when the events are asked for', () => {
    const move: ReplayEvent = { ...say(2, ''), kind: ReplayEventKind.ObjectMove, detail: {} };
    const cutIn: ReplayEvent = { ...say(3, ''), kind: ReplayEventKind.MediaCutIn, detail: {} };
    const board = buildReplayStoryboard([say(1, 'やあ'), move, cutIn], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: (event) => (event.kind === ReplayEventKind.ObjectMove ? '盗賊が動いた' : 'カットイン'),
    });

    expect(board.shots.map((shot) => shot.kind)).toEqual([
      ReplayEventKind.ChatMessage,
      ReplayEventKind.ObjectMove,
      ReplayEventKind.MediaCutIn,
    ]);
    expect(board.shots[1].text).toBe('盗賊が動いた');
    expect(board.shots[1].isNarration).toBe(true);
  });

  it('makes no shot of a part arriving with its piece, nor of the running of the room', () => {
    const part: ReplayEvent = { ...say(2, ''), kind: ReplayEventKind.ObjectCreate, detail: { part: true } };
    const join: ReplayEvent = { ...say(3, ''), kind: ReplayEventKind.PeerJoin, detail: {} };
    const board = buildReplayStoryboard([say(1, 'やあ'), part, join], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: () => '何かが起きた',
    });

    expect(board.shots.map((shot) => shot.kind)).toEqual([ReplayEventKind.ChatMessage]);
  });

  it('pictures no sound that only accompanies a move', () => {
    const se: ReplayEvent = { ...say(2, ''), kind: ReplayEventKind.MediaSoundEffect, detail: { identifier: 'se-1' } };
    const board = buildReplayStoryboard([say(1, 'やあ'), se], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: () => '効果音を鳴らした',
    });

    expect(board.shots).toHaveLength(1);
    expect(board.timeOfSeq.has(2)).toBe(true);
  });

  it('pictures no event it has no words for', () => {
    const move: ReplayEvent = { ...say(2, ''), kind: ReplayEventKind.ObjectMove, detail: {} };
    const board = buildReplayStoryboard([say(1, 'やあ'), move], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
    });

    expect(board.shots).toHaveLength(1);
  });

  it('drops an empty line rather than borrowing words for it', () => {
    const board = buildReplayStoryboard([say(1, '')], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Lines,
      caption: () => '借り物の言葉',
    });

    expect(board.shots).toHaveLength(0);
  });

  it('takes the gap to the next line as the length in real time', () => {
    const events = [
      { ...say(1, 'やあ'), t: 0 },
      { ...say(2, 'ん'), t: 5000 },
    ];
    const board = buildReplayStoryboard(events, cast, {
      pacing: ReplayShotPacing.Recorded,
      scope: ReplayShotScope.Lines,
    });

    expect(board.shots[0].durationMs).toBe(5000);
  });

  it('rounds up only what is too short to read and leaves a long gap as it was', () => {
    const events = [
      { ...say(1, 'やあ'), t: 0 },
      { ...say(2, 'ん'), t: 10 },
      { ...say(3, 'ん'), t: 999_999 },
    ];
    const board = buildReplayStoryboard(events, cast, {
      pacing: ReplayShotPacing.Recorded,
      scope: ReplayShotScope.Lines,
    });

    // A floor is kept because anything shorter cannot be read; a ceiling would stop it matching the pace of the day.
    expect(board.shots[0].durationMs).toBe(REPLAY_SHOT_MIN_MS);
    expect(board.shots[1].durationMs).toBe(999_999 - 10);
  });

  it('leaves out a line the viewer may not see', () => {
    const secret = say(2, '内緒話', 'アリス', { visibility: GM_ONLY_VISIBILITY });
    const events = [say(1, 'やあ'), secret];

    const asPlayer = buildReplayStoryboard(events, cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Lines,
      viewer: { userId: 'bob', role: PeerRole.Player },
    });
    const asGm = buildReplayStoryboard(events, cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Lines,
      viewer: { userId: 'gm', role: PeerRole.GameMaster },
    });

    expect(asPlayer.shots).toHaveLength(1);
    expect(asGm.shots).toHaveLength(2);
  });

  it('gives a shot of a move the path it slides along', () => {
    const move: ReplayEvent = {
      ...say(2, ''),
      kind: ReplayEventKind.ObjectMove,
      targetId: 'c1',
      detail: { from: { x: 0, y: 0, z: 0 }, to: { x: 300, y: 100, z: 0 } },
    };
    const board = buildReplayStoryboard([move], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: () => '盗賊が動いた',
    });

    expect(board.shots[0].move).toEqual({
      targetId: 'c1',
      route: [
        { x: 0, y: 0, z: 0 },
        { x: 300, y: 100, z: 0 },
      ],
    });
  });

  it('takes the way it went into that path', () => {
    const move: ReplayEvent = {
      ...say(2, ''),
      kind: ReplayEventKind.ObjectMove,
      targetId: 'c1',
      detail: { from: { x: 0, y: 0 }, path: [{ x: 100, y: 0 }], to: { x: 100, y: 200 } },
    };
    const board = buildReplayStoryboard([move], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: () => '盗賊が動いた',
    });

    expect(board.shots[0].move?.route).toHaveLength(3);
  });

  it('gives none to a move that went nowhere', () => {
    const move: ReplayEvent = {
      ...say(2, ''),
      kind: ReplayEventKind.ObjectMove,
      targetId: 'c1',
      detail: { from: { x: 5, y: 5 }, to: { x: 5, y: 5 } },
    };
    const board = buildReplayStoryboard([move], cast, {
      pacing: ReplayShotPacing.Reading,
      scope: ReplayShotScope.Everything,
      caption: () => '盗賊が動いた',
    });

    expect(board.shots[0].move).toBeNull();
  });

  it('gives none to a shot of a line', () => {
    expect(buildReplayStoryboard([say(1, 'やあ')], cast).shots[0].move).toBeNull();
  });

  it('makes an empty storyboard of an empty recording', () => {
    expect(buildReplayStoryboard([], cast).shots).toEqual([]);
    expect(buildReplayStoryboard([], cast).totalMs).toBe(0);
  });
});

describe('shotAt()', () => {
  const board = buildReplayStoryboard([say(1, 'やあ'), say(2, 'こんばんは')], cast);

  it('returns the shot showing at that moment', () => {
    expect(shotAt(board, 0)?.seq).toBe(1);
    expect(shotAt(board, board.shots[0].durationMs - 1)?.seq).toBe(1);
    expect(shotAt(board, board.shots[1].startMs)?.seq).toBe(2);
  });

  it('returns the first before it starts and nothing after it ends', () => {
    expect(shotAt(board, -100)?.seq).toBe(1);
    expect(shotAt(board, board.totalMs)).toBeNull();
  });

  it('returns nothing for an empty storyboard', () => {
    expect(shotAt(EMPTY_REPLAY_STORYBOARD, 0)).toBeNull();
  });
});
