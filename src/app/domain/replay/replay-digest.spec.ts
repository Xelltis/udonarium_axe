import { encodeDiceRollDetail } from '@axe/domain/dice/dice-roll-detail';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  buildReplayDigest,
  buildReplayDigestMarkdown,
  type ReplayDigestLabels,
} from '@axe/domain/replay/replay-digest';
import {
  GM_ONLY_VISIBILITY,
  PUBLIC_VISIBILITY,
  type ReplayEvent,
  ReplayEventKind,
  type ReplayManifest,
} from '@axe/domain/replay/replay-event';

const MANIFEST: Pick<ReplayManifest, 'roomName' | 'startedAt' | 'endedAt' | 'actors' | 'targets'> = {
  roomName: '洞窟の夜',
  startedAt: 1000,
  endedAt: null,
  actors: [
    { userId: 'alice', peerId: 'p1', name: 'アリス', role: PeerRole.Player, imageIdentifier: '', sinceSeq: 0 },
    { userId: 'bob', peerId: 'p2', name: 'ボブ', role: PeerRole.Player, imageIdentifier: '', sinceSeq: 0 },
    { userId: 'gm', peerId: 'p3', name: 'GM', role: PeerRole.GameMaster, imageIdentifier: '', sinceSeq: 0 },
  ],
  targets: [
    { identifier: 'char-1', aliasName: 'character', name: 'ゴブリン', sinceSeq: 0 },
    { identifier: 'char-2', aliasName: 'character', name: '戦士', sinceSeq: 0 },
  ],
};

const PLAYER = { userId: 'alice', role: PeerRole.Player };
const GAME_MASTER = { userId: 'gm', role: PeerRole.GameMaster };

let seq = 0;

function event(kind: ReplayEventKind, actorId: string, detail: Record<string, unknown> = {}, targetId?: string) {
  seq++;
  return {
    seq,
    at: 1000 + seq * 1000,
    t: seq * 1000,
    kind,
    actorId,
    targetId,
    detail,
    visibility: PUBLIC_VISIBILITY,
  } satisfies ReplayEvent;
}

function dice(actorId: string, faces: [number, number][], outcome = '', system = 'Cthulhu') {
  return event(ReplayEventKind.ChatDice, actorId, {
    dicebot: encodeDiceRollDetail({
      system,
      faces: faces.map(([sides, value]) => ({ sides, value, kind: 'normal' })),
      outcome: outcome as '',
    }),
  });
}

function change(actorId: string, targetId: string, changes: Record<string, unknown>[]) {
  return event(ReplayEventKind.ObjectValue, actorId, { changes }, targetId);
}

beforeEach(() => {
  seq = 0;
});

describe('buildReplayDigest()', () => {
  it('returns the name of the room alone for an empty recording', () => {
    const digest = buildReplayDigest([], MANIFEST, PLAYER);

    expect(digest.roomName).toBe('洞窟の夜');
    expect(digest.numbers.messages).toBe(0);
    expect(digest.awards).toEqual([]);
  });

  it('counts the lines, the rolls, the effects and the rounds', () => {
    const digest = buildReplayDigest(
      [
        event(ReplayEventKind.ChatMessage, 'alice'),
        event(ReplayEventKind.ChatMessage, 'bob'),
        event(ReplayEventKind.ChatMessage, 'alice'),
        dice('alice', [[6, 4]]),
        event(ReplayEventKind.EffectCast, 'gm'),
        event(ReplayEventKind.TurnChange, 'gm', { round: 2 }),
        event(ReplayEventKind.TurnChange, 'gm', { round: 3 }),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.numbers.messages).toBe(3);
    expect(digest.numbers.diceRolls).toBe(1);
    expect(digest.numbers.effects).toBe(1);
    expect(digest.numbers.rounds).toBe(3);
    expect(digest.numbers.speakers).toBe(2);
    expect(digest.speakers[0]).toMatchObject({ userId: 'alice', name: 'アリス', messages: 2, diceRolls: 1 });
  });

  it('does not count a notice the tool wrote into the chat as anybody’s line', () => {
    const digest = buildReplayDigest(
      [
        event(ReplayEventKind.ChatMessage, 'alice'),
        event(ReplayEventKind.ChatMessage, 'gm', { from: 'System', text: '@i18n:common.chat.logClearedBy:{}' }),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.numbers.messages).toBe(1);
    expect(digest.speakers.map((speaker) => speaker.userId)).toEqual(['alice']);
  });

  it('leaves a line a player cannot see out of their summary', () => {
    const secret = { ...event(ReplayEventKind.ChatMessage, 'gm'), visibility: GM_ONLY_VISIBILITY };
    const events = [event(ReplayEventKind.ChatMessage, 'alice'), secret];

    expect(buildReplayDigest(events, MANIFEST, PLAYER).numbers.messages).toBe(1);
    expect(buildReplayDigest(events, MANIFEST, GAME_MASTER).numbers.messages).toBe(2);
  });

  it('measures the rolls by the total of each throw', () => {
    const digest = buildReplayDigest(
      [
        // Two dice showing one and five are six in one throw; counted face by face the average halves.
        dice('alice', [
          [6, 1],
          [6, 5],
        ]),
        dice('alice', [[6, 6]], 'critical'),
        // A percentile roll is kept as its tens and its units, and their total is the one roll.
        dice(
          'bob',
          [
            [10, 70],
            [10, 8],
          ],
          'fumble'
        ),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.fortunes.find((row) => row.userId === 'alice')).toMatchObject({
      rolls: 2,
      counted: 2,
      average: 6,
      best: 6,
      worst: 6,
      criticals: 1,
      fumbles: 0,
    });
    expect(digest.fortunes.find((row) => row.userId === 'bob')).toMatchObject({ fumbles: 1, best: 78, worst: 78 });
    expect(digest.hasDiceDetail).toBe(true);
  });

  it('does not read a zero as no roll at all', () => {
    const digest = buildReplayDigest([dice('alice', [[10, 0]]), dice('alice', [[10, 7]])], MANIFEST, PLAYER);

    expect(digest.fortunes[0]).toMatchObject({ worst: 0, best: 7, average: 3.5 });
  });

  it('averages over the system rolled most where several are mixed', () => {
    const digest = buildReplayDigest(
      [
        dice('alice', [[6, 3]], '', 'SwordWorld2.5'),
        dice('alice', [[6, 5]], '', 'SwordWorld2.5'),
        dice('alice', [[100, 90]], '', 'Cthulhu7th'),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.fortunes[0]).toMatchObject({ rolls: 3, system: 'SwordWorld2.5', counted: 2, average: 4, best: 5 });
  });

  it('measures the session the same for everybody', () => {
    const events = [event(ReplayEventKind.ChatMessage, 'alice')];
    const digest = buildReplayDigest(events, { ...MANIFEST, endedAt: 1000 + 45 * 60 * 1000 }, PLAYER);

    expect(digest.numbers.elapsedMs).toBe(45 * 60 * 1000);
  });

  it('does not spoil the count when a round cannot be read', () => {
    const digest = buildReplayDigest(
      [
        event(ReplayEventKind.TurnChange, 'gm', { round: 2 }),
        event(ReplayEventKind.TurnChange, 'gm', { round: 'なにか' }),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.numbers.rounds).toBe(2);
  });

  it('does not count a change of unreadable kind as healing', () => {
    const digest = buildReplayDigest([change('gm', 'char-1', [{ delta: -10, name: 'HP' }])], MANIFEST, PLAYER);

    expect(digest.hasLedger).toBe(false);
    expect(digest.ledger).toEqual([]);
  });

  it('leaves no remainder when it adds fractional changes', () => {
    const digest = buildReplayDigest(
      [
        change('gm', 'char-1', [{ kind: 'damage', delta: -0.1, name: 'HP' }]),
        change('gm', 'char-1', [{ kind: 'damage', delta: -0.2, name: 'HP' }]),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.ledger[0].damage).toBe(0.3);
  });

  it('tells no fortune for a recording that kept no rolls', () => {
    const digest = buildReplayDigest([event(ReplayEventKind.ChatDice, 'alice', { dicebot: '' })], MANIFEST, PLAYER);

    expect(digest.hasDiceDetail).toBe(false);
    expect(digest.fortunes).toEqual([]);
    expect(digest.numbers.diceRolls).toBe(1);
  });

  it('gathers what each piece took and remembers the heaviest blow', () => {
    const digest = buildReplayDigest(
      [
        change('gm', 'char-1', [{ kind: 'damage', delta: -7, name: 'HP' }]),
        change('gm', 'char-1', [
          { kind: 'damage', delta: -12, name: 'HP' },
          { kind: 'heal', delta: 3, name: 'HP' },
        ]),
        change('alice', 'char-2', [{ kind: 'damage', delta: -2, name: 'MP' }]),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.hasLedger).toBe(true);
    expect(digest.ledger[0]).toMatchObject({
      targetId: 'char-1',
      name: 'ゴブリン',
      damage: 19,
      heal: 3,
      biggestHit: 12,
      biggestHitLabel: 'HP',
    });
    expect(digest.ledger[1]).toMatchObject({ targetId: 'char-2', damage: 2 });
  });

  it('counts no change of value that carries no list', () => {
    // One change can be kept two ways, and only the side that carries the list is counted, so it is not counted twice.
    const digest = buildReplayDigest(
      [event(ReplayEventKind.ObjectValue, 'gm', { name: 'HP', current: { from: 10, to: 3 } }, 'char-1')],
      MANIFEST,
      PLAYER
    );

    expect(digest.hasLedger).toBe(false);
    expect(digest.ledger).toEqual([]);
  });

  it('gives a title only where the numbers bear it out', () => {
    const digest = buildReplayDigest(
      [
        dice('alice', [[6, 1]], 'fumble'),
        dice('alice', [[6, 1]], 'fumble'),
        dice('alice', [[6, 2]], 'failure'),
        dice('bob', [[6, 6]], 'critical'),
        event(ReplayEventKind.ChatMessage, 'alice'),
        event(ReplayEventKind.ChatMessage, 'alice'),
        event(ReplayEventKind.ChatMessage, 'bob'),
        change('gm', 'char-1', [{ kind: 'damage', delta: -9, name: 'HP' }]),
      ],
      MANIFEST,
      PLAYER
    );

    const keys = digest.awards.map((award) => award.key);
    expect(keys).toContain('unlucky');
    expect(digest.awards.find((award) => award.key === 'unlucky')).toMatchObject({ name: 'アリス', value: 2 });
    // One throw is one throw, and a single critical earns no title.
    expect(keys).not.toContain('blessed');
    expect(digest.awards.find((award) => award.key === 'talkative')).toMatchObject({ name: 'アリス', value: 2 });
    expect(digest.awards.find((award) => award.key === 'battered')).toMatchObject({ name: 'ゴブリン', value: 9 });
  });

  it('gives none where two are level', () => {
    const digest = buildReplayDigest(
      [
        event(ReplayEventKind.ChatMessage, 'alice'),
        event(ReplayEventKind.ChatMessage, 'bob'),
        change('gm', 'char-1', [{ kind: 'damage', delta: -5, name: 'HP' }]),
        change('gm', 'char-2', [{ kind: 'damage', delta: -5, name: 'HP' }]),
      ],
      MANIFEST,
      PLAYER
    );

    expect(digest.awards.map((award) => award.key)).toEqual([]);
  });

  describe('buildReplayDigestMarkdown()', () => {
    const LABELS: ReplayDigestLabels = {
      numbers: {
        elapsedMs: '経過',
        messages: '発言',
        diceRolls: 'ダイス',
        effects: '演出',
        rounds: 'ラウンド',
        speakers: '話した人',
      },
      awards: '称号',
      awardOf: (key) => `称号:${key}`,
      fortune: { title: 'ダイスの出方', columns: ['人', '振り', '平均', '最高', '最低', '会心', '大失敗'] },
      ledger: { title: '受けた増減', columns: ['コマ', 'ダメージ', '回復', '最大'], note: '受けた側だけ' },
      elapsed: (ms) => `${Math.round(ms / 1000)}秒`,
    };

    it('lays out the name of the room and the numbers', () => {
      const digest = buildReplayDigest([event(ReplayEventKind.ChatMessage, 'alice')], MANIFEST, PLAYER);

      const markdown = buildReplayDigestMarkdown(digest, LABELS);

      expect(markdown).toContain('# 洞窟の夜');
      expect(markdown).toContain('発言: 1');
    });

    it('writes no section with nothing in it', () => {
      const digest = buildReplayDigest([event(ReplayEventKind.ChatMessage, 'alice')], MANIFEST, PLAYER);

      const markdown = buildReplayDigestMarkdown(digest, LABELS);

      expect(markdown).not.toContain('ダイスの出方');
      expect(markdown).not.toContain('受けた増減');
    });

    it('writes it so it reads as a table', () => {
      const digest = buildReplayDigest(
        [dice('alice', [[6, 3]]), change('gm', 'char-1', [{ kind: 'damage', delta: -4, name: 'HP' }])],
        MANIFEST,
        PLAYER
      );

      const markdown = buildReplayDigestMarkdown(digest, LABELS);

      expect(markdown).toContain('| 人 | 振り | 平均 | 最高 | 最低 | 会心 | 大失敗 |');
      expect(markdown).toContain('| アリス | 1 | 3 | 3 | 3 | 0 | 0 |');
      expect(markdown).toContain('| ゴブリン | 4 | 0 | 4 |');
      expect(markdown).toContain('受けた側だけ');
    });
  });
});
