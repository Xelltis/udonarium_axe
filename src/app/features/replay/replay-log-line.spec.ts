import { PUBLIC_VISIBILITY, type ReplayEvent, ReplayEventKind } from '@axe/domain/replay/replay-event';
import {
  formatReplayElapsed,
  formatReplayTime,
  renderReplayLogLine,
  replayLineParams,
  type ReplayNameLookup,
  toReplayLogLine,
} from '@axe/features/replay/replay-log-line';

const names: ReplayNameLookup = {
  actorName: (userId) => ({ alice: 'アリス', bob: 'ボブ' })[userId] ?? userId,
  targetName: (identifier) => ({ c1: '盗賊', d1: 'ダイス' })[identifier] ?? identifier,
};

function event(
  kind: ReplayEventKind,
  detail: Record<string, unknown>,
  overrides: Partial<ReplayEvent> = {}
): ReplayEvent {
  return {
    seq: 1,
    at: 0,
    t: 0,
    kind,
    actorId: 'alice',
    targetId: 'c1',
    detail,
    visibility: PUBLIC_VISIBILITY,
    ...overrides,
  };
}

describe('formatReplayTime()', () => {
  it('writes a time as hours, minutes and seconds', () => {
    const at = new Date(2026, 0, 1, 9, 5, 3).getTime();
    expect(formatReplayTime(at)).toBe('09:05:03');
  });
});

describe('formatReplayElapsed()', () => {
  it('writes an elapsed time the same way', () => {
    expect(formatReplayElapsed(0)).toBe('00:00:00');
    expect(formatReplayElapsed(65_000)).toBe('00:01:05');
    expect(formatReplayElapsed(3_725_000)).toBe('01:02:05');
  });

  it('reads a negative value as none', () => {
    expect(formatReplayElapsed(-5)).toBe('00:00:00');
  });
});

describe('toReplayLogLine()', () => {
  it('writes a move as from one place to another', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, {
        from: { name: 'table', x: 0, y: 25.4, z: 0 },
        to: { name: 'table', x: 100.4, y: 49.6, z: 0 },
      }),
      names
    );
    expect(line.key).toBe('feature.replay.line.move');
    expect(line.params).toEqual({ actor: 'アリス', target: '盗賊', fromX: 0, fromY: 25, toX: 100, toY: 50 });
    expect(line.icon).toBe('open_with');
  });

  it('writes the height into a move that changes it', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, {
        from: { name: 'table', x: 0, y: 0, z: 0 },
        to: { name: 'table', x: 0, y: 0, z: 30 },
      }),
      names
    );
    expect(line.key).toBe('feature.replay.line.moveHeight');
    expect(line.params['fromZ']).toBe(0);
    expect(line.params['toZ']).toBe(30);
  });

  it('writes the face into a move across a wall', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, {
        from: { name: 'table', x: 0, y: 0, z: 0 },
        to: { name: 'table', x: 0, y: 0, z: 0, surface: 'north-wall' },
      }),
      names
    );
    expect(line.key).toBe('feature.replay.line.moveSurface');
    expect(line.paramKeys).toEqual({
      fromSurface: 'feature.replay.surface.floor',
      toSurface: 'feature.replay.surface.north-wall',
    });
  });

  it('writes the place into a move that changes it', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, {
        from: { name: 'table', x: 0, y: 0, z: 0 },
        to: { name: 'd1', x: 0, y: 0, z: 0 },
      }),
      names
    );
    expect(line.key).toBe('feature.replay.line.movePlace');
    expect(line.paramKeys).toEqual({ fromPlace: 'feature.replay.place.table' });
    expect(line.params['toPlace']).toBe('ダイス');
  });

  it('writes a move to an unknown place as a plain move', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, { to: { name: 'table', x: 10, y: 20, z: 0 } }),
      names
    );
    expect(line.key).toBe('feature.replay.line.move');
  });

  it('leaves an unnamed place as its identifier', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectMove, {
        from: { name: 'table', x: 0, y: 0, z: 0 },
        to: { name: 'unknown-stack', x: 0, y: 0, z: 0 },
      }),
      names
    );
    expect(line.params['toPlace']).toBe('unknown-stack');
  });

  it('writes a line as its speaker and its words', () => {
    const line = toReplayLogLine(event(ReplayEventKind.ChatMessage, { name: '盗賊', text: 'こんばんは' }), names);
    expect(line.key).toBe('feature.replay.line.chat');
    expect(line.params['speaker']).toBe('盗賊');
    expect(line.params['text']).toBe('こんばんは');
  });

  it('falls back to the persons name for a line with no speaker', () => {
    const line = toReplayLogLine(event(ReplayEventKind.ChatMessage, { name: '', text: 'やあ' }), names);
    expect(line.params['speaker']).toBe('アリス');
  });

  it('writes a resource change as the values before and after', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectValue, { name: 'HP', current: { from: 12, to: 7 } }),
      names
    );
    expect(line.key).toBe('feature.replay.line.value');
    expect(line.params).toEqual({ actor: 'アリス', target: '盗賊', name: 'HP', from: '12', to: '7' });
  });

  it('writes a change to a piece’s value under the piece’s name', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ObjectValue, { name: 'HP', current: { from: 12, to: 7 } }, { targetId: 'c1-hp' }),
      { ...names, targetName: (id) => (id === 'c1-hp' ? 'HP' : id), ownerName: (id) => (id === 'c1-hp' ? '盗賊' : '') }
    );
    expect(line.params).toMatchObject({ target: '盗賊', name: 'HP', from: '12', to: '7' });
  });

  it('writes a turn as an angle', () => {
    const line = toReplayLogLine(event(ReplayEventKind.ObjectRotate, { rotate: { from: 0, to: 90.2 } }), names);
    expect(line.params['angle']).toBe(90);
  });

  it('writes locking and unlocking as separate lines', () => {
    expect(toReplayLogLine(event(ReplayEventKind.ObjectLock, { locked: true }), names).key).toBe(
      'feature.replay.line.lock'
    );
    expect(toReplayLogLine(event(ReplayEventKind.ObjectLock, { locked: false }), names).key).toBe(
      'feature.replay.line.unlock'
    );
  });

  it('writes a change of owner as their name', () => {
    const line = toReplayLogLine(event(ReplayEventKind.ObjectOwner, { from: '', to: 'bob' }), names);
    expect(line.params['owner']).toBe('ボブ');
  });

  it('writes a marker as a heading', () => {
    const line = toReplayLogLine(event(ReplayEventKind.Marker, { label: '第二幕' }, { targetId: undefined }), names);
    expect(line.key).toBe('feature.replay.line.marker');
    expect(line.params['label']).toBe('第二幕');
  });

  it('writes an effect as its name and its targets', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.EffectCast, { caster: '', targets: ['c1'] }, { targetId: 'preset-fire' }),
      { ...names, targetName: (id) => ({ c1: '盗賊', 'preset-fire': '火炎' })[id] ?? '' }
    );
    expect(line.key).toBe('feature.replay.line.effectOn');
    expect(line.params['effect']).toBe('火炎');
    expect(line.params['targets']).toBe('盗賊');
  });

  it('writes an effect with a caster as cast by them', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.EffectCast, { caster: 'c1', targets: ['c2', 'c3'] }, { targetId: 'preset-fire' }),
      { ...names, targetName: (id) => ({ c1: '術者', c2: '敵A', c3: '敵B', 'preset-fire': '火炎' })[id] ?? '' }
    );
    expect(line.key).toBe('feature.replay.line.effectFrom');
    expect(line.params['caster']).toBe('術者');
    expect(line.lists?.['targets']).toEqual(['敵A', '敵B']);
  });

  it('writes one whose target is unknown all the same', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.EffectCast, { caster: '', targets: [] }, { targetId: 'preset-fire' }),
      { ...names, targetName: (id) => (id === 'preset-fire' ? '火炎' : '') }
    );
    expect(line.key).toBe('feature.replay.line.effect');
    expect(line.params['effect']).toBe('火炎');
  });

  it('marks a hidden event as hidden', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ChatMessage, { text: 'ないしょ' }, { visibility: { kind: 'direct', to: ['bob'] } }),
      names
    );
    expect(line.isSecret).toBe(true);
  });

  it('does not fall over on a kind it does not know', () => {
    const line = toReplayLogLine(event('object.unknown' as ReplayEventKind, {}), names);
    expect(line.key).toBe('feature.replay.line.update');
    expect(line.icon).toBe('radio_button_unchecked');
  });
});

describe('reading a line in the reader’s language', () => {
  const words: Record<string, string> = {
    'common.chat.logClearedBy': '{{user}}さんがログを消しました',
    'feature.role.gm': 'ゲームマスター',
    'feature.replay.face.back': '裏',
  };
  const t = (key: string, params: Record<string, unknown> = {}): string =>
    (words[key] ?? key).replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params[name] ?? ''));

  it('decodes a notice the tool packed for translation', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.ChatMessage, { name: 'System', text: '@i18n:common.chat.logClearedBy:{"user":"GM"}' }),
      names
    );

    expect(replayLineParams(line, t, 'ja')['text']).toBe('GMさんがログを消しました');
  });

  it('names a role rather than showing its code', () => {
    const line = toReplayLogLine(event(ReplayEventKind.PeerRoleChange, { role: 'gm' }), names);

    expect(replayLineParams(line, t, 'ja')['role']).toBe('ゲームマスター');
  });

  it('names the side a card or coin was turned to, and leaves a die’s number as it is', () => {
    const card = toReplayLogLine(event(ReplayEventKind.ObjectFace, { from: 0, to: 1 }), names);
    const die = toReplayLogLine(event(ReplayEventKind.ObjectFace, { to: '1' }), names);

    expect(replayLineParams(card, t, 'ja')['face']).toBe('裏');
    expect(replayLineParams(die, t, 'ja')['face']).toBe('1');
  });

  it('joins the targets of an effect the way the language joins a list', () => {
    const line = toReplayLogLine(
      event(ReplayEventKind.EffectCast, { targets: ['c1', 'd1'] }, { targetId: 'preset' }),
      names
    );

    expect(replayLineParams(line, t, 'ja')['targets']).toBe('盗賊、ダイス');
    expect(replayLineParams(line, t, 'en')['targets']).toBe('盗賊 and ダイス');
  });

  it('renders the whole line with those parameters', () => {
    const line = toReplayLogLine(event(ReplayEventKind.PeerRoleChange, { role: 'gm' }), names);

    const t = (key: string, params?: Record<string, unknown>): string =>
      params ? `${key}:${String(params['role'])}` : key;

    expect(renderReplayLogLine(line, t, 'ja')).toBe('feature.replay.line.role:feature.role.gm');
  });
});
