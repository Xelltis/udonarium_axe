import { collectReplayCast, replayCastOnTable } from '@axe/domain/replay/replay-cast';
import type { ReplayObjectSnapshot } from '@axe/domain/replay/replay-keyframe';

function character(identifier: string, colors: string[] = ['#112233']): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName: 'character',
    syncData: { value: '', attributes: { chatColorCode: colors, location: { name: 'table', x: 0, y: 0 } } },
  };
}

function data(identifier: string, parent: string, name: string, value: string = ''): ReplayObjectSnapshot {
  return {
    identifier,
    aliasName: 'data',
    syncData: { value, attributes: { name }, parentIdentifier: parent },
  };
}

function characterTree(identifier: string, name: string, image: string): ReplayObjectSnapshot[] {
  return [
    character(identifier),
    data(`${identifier}-root`, identifier, 'character'),
    data(`${identifier}-common`, `${identifier}-root`, 'common'),
    data(`${identifier}-name`, `${identifier}-common`, 'name', name),
    data(`${identifier}-image`, `${identifier}-root`, 'image'),
    data(`${identifier}-img-id`, `${identifier}-image`, 'imageIdentifier', image),
  ];
}

describe('collectReplayCast()', () => {
  it('gathers the pieces on the board with their names and portraits', () => {
    const cast = collectReplayCast([
      ...characterTree('c1', '盗賊', 'img-1'),
      ...characterTree('c2', '魔術師', 'img-2'),
    ]);

    expect(cast).toEqual([
      { identifier: 'c1', name: '盗賊', imageIdentifier: 'img-1', chatColor: '#112233', onTable: true },
      { identifier: 'c2', name: '魔術師', imageIdentifier: 'img-2', chatColor: '#112233', onTable: true },
    ]);
  });

  it('names a piece whose name was hidden as everyone was told it', () => {
    const [villain, ...rest] = characterTree('c3', '黒幕', 'img-3');
    const attributes = { ...(villain.syncData['attributes'] as Record<string, unknown>), hideName: true };
    const hidden = { ...villain, syncData: { ...villain.syncData, attributes } };

    expect(collectReplayCast([hidden, ...rest])[0].name).toBe('？？？');
  });

  it('picks up a piece that appears in no event', () => {
    const cast = collectReplayCast([...characterTree('quiet', '沈黙の人', '')]);
    expect(cast.map((member) => member.name)).toEqual(['沈黙の人']);
  });

  it('mixes in nothing that is not a piece', () => {
    const snapshots: ReplayObjectSnapshot[] = [
      ...characterTree('c1', '盗賊', 'img-1'),
      { identifier: 'k1', aliasName: 'card', syncData: { attributes: {} } },
      { identifier: 't1', aliasName: 'table-mask', syncData: { attributes: {} } },
    ];
    expect(collectReplayCast(snapshots).map((member) => member.identifier)).toEqual(['c1']);
  });

  it('does not fall over without a name or a portrait', () => {
    const cast = collectReplayCast([character('bare')]);
    expect(cast).toEqual([{ identifier: 'bare', name: '', imageIdentifier: '', chatColor: '#112233', onTable: true }]);
  });

  it('tells a piece put away from one on the board', () => {
    const stored: ReplayObjectSnapshot = {
      identifier: 'kept',
      aliasName: 'character',
      syncData: { value: '', attributes: { chatColorCode: ['#112233'], location: { name: 'inventory', x: 0, y: 0 } } },
    };

    expect(collectReplayCast([stored])[0].onTable).toBe(false);
    expect(collectReplayCast([character('c1')])[0].onTable).toBe(true);
  });

  it('leaves the colour empty when there is none', () => {
    expect(collectReplayCast([character('c1', [])])[0].chatColor).toBe('');
  });

  it('takes the common field where another section holds the same name', () => {
    const snapshots: ReplayObjectSnapshot[] = [
      ...characterTree('c1', '盗賊', 'img-1'),
      data('c1-detail', 'c1-root', 'detail'),
      data('c1-detail-name', 'c1-detail', 'name', '別の名前'),
    ];
    expect(collectReplayCast(snapshots)[0].name).toBe('盗賊');
  });

  it('returns nothing for an empty board', () => {
    expect(collectReplayCast([])).toEqual([]);
  });
});

describe('replayCastOnTable()', () => {
  const on = { identifier: 'a', name: 'アリス', imageIdentifier: '', chatColor: '', onTable: true };
  const off = { identifier: 'b', name: 'ボブ', imageIdentifier: '', chatColor: '', onTable: false };

  it('keeps only the pieces that were out on the board', () => {
    expect(replayCastOnTable([on, off])).toEqual([on]);
  });

  it('returns them all when none was', () => {
    expect(replayCastOnTable([off])).toEqual([off]);
  });
});
