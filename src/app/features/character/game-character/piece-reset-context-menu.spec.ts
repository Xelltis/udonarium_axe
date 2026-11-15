import type { ResetCount, ResetRequest } from '@axe/domain/character/piece-reset';
import {
  buildPieceResetMenu,
  doesAnything,
  offeredPieceResets,
  PIECE_RESET_CHOICES,
  type PieceResetChoice,
  resetRequestOf,
} from '@axe/features/character/game-character/piece-reset-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

/** What a reset would reach on a piece wearing so many buffs and debuffs, with so many items off their defaults. */
function reachOn(piece: { buffs: number; debuffs: number; off: number }): (request: ResetRequest) => ResetCount {
  return (request) => {
    const kind = request.rule?.kind;
    const buffs =
      kind === 'all'
        ? piece.buffs + piece.debuffs
        : kind === 'buffs'
          ? piece.buffs
          : kind === 'debuffs'
            ? piece.debuffs
            : 0;
    const items = request.values ? piece.off : 0;
    return { characters: buffs + items > 0 ? 1 : 0, buffs, items };
  };
}

describe('the resets a piece’s menu offers (acceptance 21)', () => {
  it('asks each choice for what its name says', () => {
    expect(resetRequestOf('allBuffs')).toEqual({ rule: { kind: 'all' }, values: false });
    expect(resetRequestOf('buffs')).toEqual({ rule: { kind: 'buffs' }, values: false });
    expect(resetRequestOf('debuffs')).toEqual({ rule: { kind: 'debuffs' }, values: false });
    expect(resetRequestOf('values')).toEqual({ rule: null, values: true });
    expect(resetRequestOf('everything')).toEqual({ rule: { kind: 'all' }, values: true });
  });

  it('offers all five for a piece wearing a buff and a debuff with a value off its default', () => {
    expect(offeredPieceResets(reachOn({ buffs: 1, debuffs: 1, off: 1 }))).toEqual(PIECE_RESET_CHOICES);
  });

  it.each<[string, { buffs: number; debuffs: number; off: number }, PieceResetChoice[]]>([
    ['nothing for a piece wearing nothing and standing at its defaults', { buffs: 0, debuffs: 0, off: 0 }, []],
    [
      'no clearing of debuffs where it wears buffs alone',
      { buffs: 2, debuffs: 0, off: 0 },
      ['allBuffs', 'buffs', 'everything'],
    ],
    [
      'no clearing of buffs where it wears debuffs alone',
      { buffs: 0, debuffs: 1, off: 0 },
      ['allBuffs', 'debuffs', 'everything'],
    ],
    [
      'the values and the whole reset alone where it wears nothing',
      { buffs: 0, debuffs: 0, off: 3 },
      ['values', 'everything'],
    ],
  ])('offers %s', (_, piece, offered) => {
    expect(offeredPieceResets(reachOn(piece))).toEqual(offered);
  });

  it('tells a reset that would take a buff or put a value back from one that would do nothing', () => {
    expect(doesAnything({ characters: 1, buffs: 1, items: 0 })).toBe(true);
    expect(doesAnything({ characters: 1, buffs: 0, items: 2 })).toBe(true);
    expect(doesAnything({ characters: 0, buffs: 0, items: 0 })).toBe(false);
  });

  it('builds an entry for each choice offered, in the menu’s own order, each running its choice', () => {
    const onReset = vi.fn();

    const entries = buildPieceResetMenu(['everything', 'values', 'allBuffs'], onReset, t);

    expect(entries.map((entry) => entry.name)).toEqual(['バフをすべて外す', '値を既定値に戻す', 'すべてリセット']);
    entries[1].action!();
    expect(onReset).toHaveBeenCalledExactlyOnceWith('values');
  });

  it('names all five', () => {
    expect(buildPieceResetMenu(PIECE_RESET_CHOICES, vi.fn(), t).map((entry) => entry.name)).toEqual([
      'バフをすべて外す',
      'バフだけ外す',
      'デバフだけ外す',
      '値を既定値に戻す',
      'すべてリセット',
    ]);
  });

  it('builds nothing for a seat given no way to reset, whatever is offered', () => {
    expect(buildPieceResetMenu(PIECE_RESET_CHOICES, undefined, t)).toEqual([]);
  });
});
