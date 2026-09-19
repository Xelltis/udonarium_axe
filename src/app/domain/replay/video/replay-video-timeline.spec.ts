import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayVisibility,
} from '@axe/domain/replay/replay-event';
import { REPLAY_PAGE_MIN_MS } from '@axe/domain/replay/video/replay-text-layout';
import {
  buildReplayVideoTimeline,
  REPLAY_CHAPTER_MS,
  type ReplayBoardSegment,
  type ReplayDiceSegment,
  type ReplayLineSegment,
  ReplayVideoPacing,
  type ReplayVideoSegment,
  type ReplayVideoTimelineOptions,
} from '@axe/domain/replay/video/replay-video-timeline';

let seq = 0;

function event(
  kind: ReplayEventKind,
  detail: Record<string, unknown> = {},
  extra: Partial<ReplayEvent> = {}
): ReplayEvent {
  seq += 1;
  return {
    seq,
    at: seq * 1000,
    t: seq * 1000,
    kind,
    actorId: 'alice',
    detail,
    visibility: PUBLIC_VISIBILITY,
    ...extra,
  };
}

function say(text: string, more: Record<string, unknown> = {}, extra: Partial<ReplayEvent> = {}): ReplayEvent {
  return event(
    ReplayEventKind.ChatMessage,
    { text, name: 'アリス', from: 'alice', tabIdentifier: 'main', messColor: '#ff0000', imageIdentifier: '', ...more },
    extra
  );
}

function roll(text: string, name = '<BCDice：アリス>', more: Record<string, unknown> = {}): ReplayEvent {
  return event(ReplayEventKind.ChatDice, {
    text,
    name,
    from: 'System-BCDice',
    tabIdentifier: 'main',
    dicebot: JSON.stringify({ system: 'DiceBot', faces: [{ sides: 6, value: 5, kind: 'normal' }], outcome: 'success' }),
    ...more,
  });
}

function move(targetId: string, from: [number, number], to: [number, number], place = 'table'): ReplayEvent {
  return event(
    ReplayEventKind.ObjectMove,
    { from: { name: 'table', x: from[0], y: from[1], z: 0 }, to: { name: place, x: to[0], y: to[1], z: 0 } },
    { targetId }
  );
}

const byChars = (text: string) => [...text].length;

function options(more: Partial<ReplayVideoTimelineOptions> = {}): ReplayVideoTimelineOptions {
  return {
    viewer: { userId: 'guest', role: PeerRole.Guest },
    text: {
      lang: 'ja',
      decode: (text) => text.replace(/^@i18n:/, 'decoded:'),
      t: (key, params) => `${key}${params ? JSON.stringify(params) : ''}`,
    },
    subtitle: { measure: byChars, maxWidth: 20, maxLines: 2 },
    ...more,
  };
}

function kinds(segments: readonly ReplayVideoSegment[]): string[] {
  return segments.map((segment) => segment.kind);
}

beforeEach(() => {
  seq = 0;
});

describe('laying a recording out as a video', () => {
  describe('lines', () => {
    it('shows a line with who said it, held long enough to read', () => {
      const timeline = buildReplayVideoTimeline([say('こんにちは')], options());
      const line = timeline.segments[0] as ReplayLineSegment;

      expect(line).toMatchObject({ kind: 'line', mode: 'speech', speaker: 'アリス', color: '#ff0000', startMs: 0 });
      expect(line.pages).toHaveLength(1);
      expect(line.durationMs).toBe(REPLAY_PAGE_MIN_MS);
      expect(timeline.totalMs).toBe(line.durationMs);
    });

    it('turns a long line over onto another page rather than cutting it off', () => {
      const long = 'あ'.repeat(50);
      const line = buildReplayVideoTimeline([say(long)], options()).segments[0] as ReplayLineSegment;

      expect(line.pages.map((page) => page.lines.length)).toEqual([2, 1]);
      expect(line.pages[1].startMs).toBe(line.pages[0].durationMs);
      expect(line.durationMs).toBe(line.pages[0].durationMs + line.pages[1].durationMs);
    });

    it('leaves out what the room says of itself', () => {
      const timeline = buildReplayVideoTimeline(
        [say('@i18n:common.chat.logCleared:{}', { from: 'System' }), say('本題')],
        options()
      );

      expect(timeline.segments).toHaveLength(1);
      expect((timeline.segments[0] as ReplayLineSegment).pages[0].lines).toEqual(['本題']);
    });

    it('shows only the lines of the tabs chosen', () => {
      const timeline = buildReplayVideoTimeline(
        [say('雑談です', { tabIdentifier: 'chat' }), say('本編です')],
        options({ tabs: new Set(['main']) })
      );

      expect((timeline.segments as ReplayLineSegment[]).map((line) => line.pages[0].lines[0])).toEqual(['本編です']);
    });

    it('keeps a line meant for the game master out of a video for the public', () => {
      const secret = say('黒幕は執事', {}, { visibility: GM_ONLY_VISIBILITY as ReplayVisibility });

      expect(buildReplayVideoTimeline([secret], options()).segments).toHaveLength(0);
      expect(
        buildReplayVideoTimeline([secret], options({ viewer: { userId: 'gm', role: PeerRole.GameMaster } })).segments
      ).toHaveLength(1);
    });

    it('takes the staging off the end of an older line and stages it as narration', () => {
      const line = buildReplayVideoTimeline([say('風が吹く〔地の文〕')], options()).segments[0] as ReplayLineSegment;

      expect(line).toMatchObject({ mode: 'narration', speaker: '' });
      expect(line.pages[0].lines).toEqual(['風が吹く']);
    });
  });

  describe('the novel stage', () => {
    const character = (sendFrom: string, name: string, image: string, text: string) =>
      say(text, { name, imageIdentifier: image }, { patch: patchOf(sendFrom) });

    function patchOf(sendFrom: string) {
      return { identifier: 'chat', aliasName: 'chat', before: {}, after: { 'attributes.sendFrom': sendFrom } };
    }

    it('stands everyone who spoke as a character, the speaker to the fore', () => {
      const timeline = buildReplayVideoTimeline(
        [character('c-alice', 'アリス', 'img-a', 'やあ'), character('c-bob', 'ボブ', 'img-b', 'どうも')],
        options({ isCharacter: (identifier) => identifier.startsWith('c-') })
      );
      const second = timeline.segments[1] as ReplayLineSegment;

      expect(second.stage.map((figure) => [figure.imageIdentifier, figure.isActive])).toEqual([
        ['img-a', false],
        ['img-b', true],
      ]);
      expect(timeline.imageIdentifiers).toEqual(expect.arrayContaining(['img-a', 'img-b']));
    });

    it('stands nobody for a line not said as a character', () => {
      const line = buildReplayVideoTimeline(
        [character('', 'PL', 'img-a', 'やあ')],
        options({ isCharacter: () => true })
      ).segments[0] as ReplayLineSegment;

      expect(line.stage).toEqual([]);
    });

    it('sets the scene behind what follows', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.VnScene, {}, { targetId: 'bg-forest' }), say('森だ')],
        options()
      );

      expect(timeline.segments[0].background).toBe('bg-forest');
      expect(timeline.imageIdentifiers).toContain('bg-forest');
    });
  });

  describe('dice', () => {
    it('shows a roll with the command said before it, and what it came to', () => {
      const timeline = buildReplayVideoTimeline(
        [say('2d6+3 攻撃'), roll('DiceBot : (2D6+3) ＞ 5[2,3]+3 ＞ 8')],
        options()
      );
      const dice = timeline.segments[0] as ReplayDiceSegment;

      expect(kinds(timeline.segments)).toEqual(['dice']);
      expect(dice).toMatchObject({
        speaker: 'アリス',
        comment: '攻撃',
        steps: ['(2D6+3)', '5[2,3]+3'],
        result: '8',
        outcome: 'success',
        isSecret: false,
      });
    });

    it('takes a system command said before the roll as its command too', () => {
      const timeline = buildReplayVideoTimeline([say('CC<=50 目星'), roll('(1D100<=50) ＞ 42 ＞ 成功')], options());

      expect(timeline.segments[0]).toMatchObject({ kind: 'dice', comment: '目星', result: '成功' });
    });

    it('keeps a line that was not the command as a line of its own', () => {
      const timeline = buildReplayVideoTimeline([say('いくぞ'), roll('(1D6) ＞ 4')], options());

      expect(kinds(timeline.segments)).toEqual(['line', 'dice']);
      expect((timeline.segments[1] as ReplayDiceSegment).comment).toBe('');
    });

    it('names the roller from the dice bot when nothing was said before', () => {
      const dice = buildReplayVideoTimeline([roll('(1D100) ＞ 42', '<BCDice：ボブ>')], options())
        .segments[0] as ReplayDiceSegment;

      expect(dice).toMatchObject({ speaker: 'ボブ', steps: ['(1D100)'], result: '42' });
    });

    it('rattles the dice as the roll comes on screen', () => {
      const events = [
        say('いくぞ'),
        roll('(1D6) ＞ 4'),
        event(ReplayEventKind.MediaSoundEffect, { identifier: 'se-dice' }),
      ];
      const timeline = buildReplayVideoTimeline(events, options());
      const dice = timeline.segments[1];

      expect(dice.kind).toBe('dice');
      expect(timeline.timeOfSeq.get(3)).toBe(dice.startMs);
    });
  });

  describe('chapters and notices', () => {
    it('opens a chapter with a title card, and carries its name on', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.Marker, { label: '第一章' }), say('始まり')],
        options()
      );

      expect(timeline.segments[0]).toMatchObject({ kind: 'chapter', title: '第一章', durationMs: REPLAY_CHAPTER_MS });
      expect(timeline.segments[1].chapter).toBe('第一章');
    });

    it('opens with the card it is given', () => {
      const timeline = buildReplayVideoTimeline([say('やあ')], options({ opening: { title: '卓', subtitle: '日付' } }));

      expect(timeline.segments[0]).toMatchObject({ kind: 'chapter', title: '卓', subtitle: '日付', startMs: 0 });
      expect(timeline.segments[1].startMs).toBe(timeline.segments[0].durationMs);
    });

    it('opens nothing when there is nothing to show', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.PeerJoin)],
        options({ opening: { title: '卓', subtitle: '日付' } })
      );

      expect(timeline).toMatchObject({ segments: [], totalMs: 0 });
    });

    it('says whose turn it is in the language of the video', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.TurnChange, { round: 2 }, { targetId: 'c-alice' })],
        options({ nameOf: () => 'アリス' })
      );

      expect(timeline.segments[0]).toMatchObject({
        kind: 'banner',
        text: 'feature.replay.video.roundTurn{"round":2,"name":"アリス"}',
        focus: ['c-alice'],
      });
    });

    it('plays a cut-in that shows a picture', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.MediaCutIn, { isStart: true, soundOnly: false }, { targetId: 'cut-1' })],
        options({ cutInOf: () => ({ imageIdentifier: 'img-cut', scene: null, durationMs: 2_000 }) })
      );

      expect(timeline.segments[0]).toMatchObject({ kind: 'cut-in', imageIdentifier: 'img-cut', durationMs: 2_000 });
    });

    it('passes over a cut-in that only sounds', () => {
      const timeline = buildReplayVideoTimeline(
        [event(ReplayEventKind.MediaCutIn, { isStart: true, soundOnly: true }, { targetId: 'cut-1' })],
        options({ cutInOf: () => ({ imageIdentifier: 'img-cut', scene: null, durationMs: 2_000 }) })
      );

      expect(timeline.segments).toEqual([]);
    });
  });

  describe('the board', () => {
    it('plays what happened between two lines as one beat, each move a little after the one before', () => {
      const events = [say('動くぞ'), move('p1', [0, 0], [100, 0]), move('p2', [0, 0], [0, 100]), say('動いた')];
      const timeline = buildReplayVideoTimeline(events, options());
      const beat = timeline.segments[1] as ReplayBoardSegment;

      expect(kinds(timeline.segments)).toEqual(['line', 'board', 'line']);
      expect(beat.motions.map((motion) => [motion.kind, motion.targetId])).toEqual([
        ['path', 'p1'],
        ['path', 'p2'],
      ]);
      expect(beat.motions[1].startMs).toBeGreaterThan(beat.motions[0].startMs);
      expect(beat.focus).toEqual(['p1', 'p2']);
    });

    it('shows the board as it stood before the beat, and after it', () => {
      const events = [say('動くぞ'), move('p1', [0, 0], [100, 0]), say('動いた')];
      const beat = buildReplayVideoTimeline(events, options()).segments[1] as ReplayBoardSegment;

      expect(beat).toMatchObject({ boardFrom: 1, boardTo: 2 });
    });

    it('fades in a piece brought onto the table and fades out one taken off it', () => {
      const events = [
        event(ReplayEventKind.ObjectCreate, { aliasName: 'character' }, { targetId: 'p1' }),
        move('p2', [0, 0], [0, 0], 'graveyard'),
      ];
      const beat = buildReplayVideoTimeline(events, options()).segments[0] as ReplayBoardSegment;

      expect(beat.motions.map((motion) => [motion.kind, motion.targetId])).toEqual([
        ['arrive', 'p1'],
        ['depart', 'p2'],
      ]);
    });

    it('draws nothing for what arrives off the board', () => {
      const events = [event(ReplayEventKind.ObjectCreate, { aliasName: 'chat-tab' }, { targetId: 't1' })];

      expect(buildReplayVideoTimeline(events, options()).segments).toEqual([]);
    });

    it('raises a change of value over the piece it belongs to', () => {
      const events = [
        event(ReplayEventKind.ObjectValue, { name: 'HP', current: { from: '10', to: '7' } }, { targetId: 'hp-1' }),
      ];
      const beat = buildReplayVideoTimeline(events, options({ ownerOf: () => 'p1' })).segments[0] as ReplayBoardSegment;

      expect(beat.pops).toEqual([{ targetId: 'p1', label: 'HP', value: '7', delta: -3, startMs: 0 }]);
    });

    it('places a sound made with a roll where the roll is played', () => {
      const events = [
        move('p1', [0, 0], [100, 0]),
        event(ReplayEventKind.ObjectDiceRoll, {}, { targetId: 'die' }),
        event(ReplayEventKind.MediaSoundEffect, { identifier: 'se-dice' }),
      ];
      const timeline = buildReplayVideoTimeline(events, options());
      const beat = timeline.segments[0] as ReplayBoardSegment;

      expect(timeline.timeOfSeq.get(3)).toBe(beat.startMs + beat.motions[1].startMs);
    });

    it('cuts a long run of moves into beats', () => {
      const moves = Array.from({ length: 20 }, (_, index) => move(`p${index}`, [0, 0], [100, 0]));

      expect(kinds(buildReplayVideoTimeline(moves, options()).segments)).toEqual(['board', 'board']);
    });
  });

  describe('pacing', () => {
    it('holds a moment as long as it took on the day, up to the cap', () => {
      const first = say('やあ');
      const second = { ...say('どうも'), t: 5_000 };
      const timeline = buildReplayVideoTimeline(
        [first, second],
        options({ pacing: ReplayVideoPacing.Recorded, quietCapMs: 3_000 })
      );

      expect(timeline.segments[0].durationMs).toBe(3_000);
    });

    it('gives every event the moment it falls at, for the sound', () => {
      const events = [say('やあ'), event(ReplayEventKind.MediaBgm, { isPlaying: true }), say('どうも')];
      const timeline = buildReplayVideoTimeline(events, options());

      expect(timeline.timeOfSeq.get(2)).toBe(timeline.segments[1].startMs);
      expect(timeline.timeOfSeq.get(3)).toBe(timeline.segments[1].startMs);
    });
  });
});
