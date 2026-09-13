import { DiceSymbol } from '@axe/domain/dice/dice-symbol';
import { buildDiceSymbolContextMenu } from '@axe/features/dice/dice-symbol/dice-symbol-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

interface MutableDice {
  isVisible: boolean;
  isMine: boolean;
  hasOwner: boolean;
  isLock: boolean;
  hideName: boolean;
  isUsed: boolean;
  owner: string;
  ownerCharacterIdentifier: string;
  face: string;
  faces: string[];
  clone: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
}

function makeDice(overrides: Partial<MutableDice> = {}): MutableDice {
  return {
    isVisible: true,
    isMine: false,
    hasOwner: false,
    isLock: false,
    hideName: false,
    isUsed: false,
    owner: '',
    ownerCharacterIdentifier: '',
    face: '1',
    faces: ['1', '2', '3'],
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, update: vi.fn() })),
    destroy: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

const names = (a: { name: string }[]) => a.map((x) => x.name);
const cb = (ownerCandidates: { identifier: string; name: string }[] = []) => ({
  onDiceRoll: vi.fn(),
  onShowDetail: vi.fn(),
  onRevealed: vi.fn(),
  ownerCandidates,
});

describe('buildDiceSymbolContextMenu()', () => {
  it('offers rolling and setting the face on a die that can be seen', () => {
    const dice = makeDice({ isVisible: true });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    expect(names(menu)).toContain('ダイスを振る');
    expect(names(menu)).toContain('ダイス目を設定');
  });

  it('offers neither on one that cannot', () => {
    const dice = makeDice({ isVisible: false });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    expect(names(menu)).not.toContain('ダイスを振る');
    expect(names(menu)).not.toContain('ダイス目を設定');
  });

  it('offers to open a die that is owned, and clears its owner', () => {
    const dice = makeDice({ isMine: true, hasOwner: true, owner: 'me' });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    const reveal = menu.find((m) => m.name === 'ダイスを公開');
    expect(reveal).toBeDefined();
    reveal!.action!();
    expect(dice.owner).toBe('');
  });

  it('offers a peek at somebody elses', () => {
    const dice = makeDice({ isMine: false });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    expect(names(menu)).toContain('自分だけ見る');
  });

  it('leaves a die that is already somebody else\u2019s where it is', () => {
    const dice = makeDice({ isMine: false, hasOwner: true, owner: 'somebody' });

    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);

    expect(names(menu)).not.toContain('自分だけ見る');
  });

  it('lets the game master take one that is somebody else\u2019s', () => {
    const dice = makeDice({ isMine: false, hasOwner: true, owner: 'somebody' });

    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, { ...cb(), canRevealHidden: true }, t);

    expect(names(menu)).toContain('自分だけ見る');
  });

  it('offers as many faces as the die has', () => {
    const dice = makeDice({ isVisible: true, faces: ['1', '2', '3', '4', '5', '6'] });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    const face = menu.find((m) => m.name === 'ダイス目を設定');
    expect(face?.subActions).toHaveLength(6);
  });

  it('sets the face from one of them', () => {
    const dice = makeDice({ face: '1' });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    const subs = menu.find((m) => m.name === 'ダイス目を設定')?.subActions;
    subs?.find((s) => s.name === '3')!.action!();
    expect(dice.face).toBe('3');
  });

  it('ticks hiding the name and switches it', () => {
    const shown = makeDice({ hideName: false });
    const shownMenu = buildDiceSymbolContextMenu(shown as unknown as DiceSymbol, 50, cb(), t);
    expect(names(shownMenu)).toContain('☐ 名前を隠す');
    shownMenu.find((m) => m.name === '☐ 名前を隠す')!.action!();
    expect(shown.hideName).toBe(true);

    const hidden = makeDice({ hideName: true });
    const hiddenMenu = buildDiceSymbolContextMenu(hidden as unknown as DiceSymbol, 50, cb(), t);
    expect(names(hiddenMenu)).toContain('☑ 名前を隠す');
  });

  it('destroys the die', () => {
    const dice = makeDice();
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
    menu.find((m) => m.name === '削除する')!.action!();
    expect(dice.destroy).toHaveBeenCalled();
  });

  describe('a die that has been spent', () => {
    it('offers to mark one that has not been', () => {
      const dice = makeDice({ isUsed: false });

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
      const mark = menu.find((each) => each.name === '☐ 使用済み');

      expect(mark).toBeDefined();
      mark!.action!();
      expect(dice.isUsed).toBe(true);
    });

    it('offers to take the mark off one that has', () => {
      const dice = makeDice({ isUsed: true });

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);
      const unmark = menu.find((each) => each.name === '☑ 使用済み');

      expect(unmark).toBeDefined();
      unmark!.action!();
      expect(dice.isUsed).toBe(false);
    });

    it('is offered whether or not the face can be read, since spending is not a secret', () => {
      const hidden = makeDice({ isVisible: false });

      const menu = buildDiceSymbolContextMenu(hidden as unknown as DiceSymbol, 50, cb(), t);

      expect(names(menu)).toContain('☐ 使用済み');
    });
  });

  describe('opening a die nobody could read', () => {
    it('gives out the face it came to rest on', () => {
      const dice = makeDice({ isMine: true, hasOwner: true, face: '5' });
      const callbacks = cb();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, callbacks, t);

      menu.find((action) => action.name === 'ダイスを公開')?.action?.();

      expect(dice.owner).toBe('');
      expect(callbacks.onRevealed).toHaveBeenCalledWith('5');
    });

    it('offers nothing to open on a die that was already there to be read', () => {
      const dice = makeDice({ isMine: true, hasOwner: false, face: '5' });
      const callbacks = cb();

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, callbacks, t);

      expect(names(menu)).not.toContain('ダイスを公開');
    });

    it('leaves somebody else\u2019s die shut to an ordinary player', () => {
      const dice = makeDice({ isMine: false, hasOwner: true, owner: 'somebody', face: '5' });

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);

      expect(names(menu)).not.toContain('ダイスを公開');
    });

    it('lets the game master open one that is somebody else\u2019s', () => {
      const dice = makeDice({ isMine: false, hasOwner: true, owner: 'somebody', face: '5' });
      const callbacks = { ...cb(), canRevealHidden: true };

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, callbacks, t);
      menu.find((action) => action.name === 'ダイスを公開')?.action?.();

      expect(dice.owner).toBe('');
      expect(callbacks.onRevealed).toHaveBeenCalledWith('5');
    });
  });

  describe('whose die it is', () => {
    const goblin = { identifier: 'goblin', name: 'ゴブリンA' };

    it('offers the pieces it can be given to', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      expect(names(owner?.subActions ?? [])).toEqual(['☐ ゴブリンA']);
    });

    it('gives the die to the one that was chosen', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb([goblin]), t);

      menu.find((m) => m.name === 'コマに持たせる')?.subActions?.[0].action!();

      expect(dice.ownerCharacterIdentifier).toBe('goblin');
    });

    it('ticks the piece it already belongs to', () => {
      const dice = makeDice({ ownerCharacterIdentifier: 'goblin' });
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      expect(names(owner?.subActions ?? [])).toContain('☑ ゴブリンA');
    });

    it('offers to take it back once it belongs to somebody', () => {
      const dice = makeDice({ ownerCharacterIdentifier: 'goblin' });
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      owner?.subActions?.find((m) => m.name === '持ち主を外す')?.action!();

      expect(dice.ownerCharacterIdentifier).toBe('');
    });

    it('offers nothing of the sort with no pieces on the table', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, cb(), t);

      expect(names(menu)).not.toContain('コマに持たせる');
    });
  });
});
