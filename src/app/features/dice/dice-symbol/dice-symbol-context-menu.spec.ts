import { TestBed } from '@angular/core/testing';
import { ChatLineEditService } from '@axe/application/chat/chat-line-edit.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { DiceRollService } from '@axe/application/dice/dice-roll.service';
import { Network } from '@axe/core/network/network';
import { DiceSymbol, DiceType } from '@axe/domain/dice/dice-symbol';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import {
  buildDiceSymbolContextMenu,
  type DiceFaceRules,
} from '@axe/features/dice/dice-symbol/dice-symbol-context-menu';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
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
  ownerCandidates,
});
/** The dice service's rules as the menu asks them, letting this seat do everything unless told otherwise. */
const rules = (overrides: Partial<Record<keyof DiceFaceRules, unknown>> = {}) =>
  ({
    canTurn: vi.fn(() => true),
    canChange: vi.fn(() => true),
    canReveal: vi.fn(() => false),
    canKeep: vi.fn(() => false),
    setFace: vi.fn(() => true),
    setNameHidden: vi.fn(() => true),
    reveal: vi.fn(() => true),
    keep: vi.fn(() => true),
    ...overrides,
  }) as unknown as DiceFaceRules & Record<keyof DiceFaceRules, ReturnType<typeof vi.fn>>;

describe('buildDiceSymbolContextMenu()', () => {
  it('offers rolling, setting the face and hiding the name of a die this seat may turn', () => {
    const dice = makeDice();
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
    expect(names(menu)).toContain('ダイスを振る');
    expect(names(menu)).toContain('ダイス目を設定');
    expect(names(menu)).toContain('☐ 名前を隠す');
  });

  it('offers none of them on one it may not', () => {
    const dice = makeDice();
    const menu = buildDiceSymbolContextMenu(
      dice as unknown as DiceSymbol,
      50,
      rules({ canTurn: vi.fn(() => false), canChange: vi.fn(() => false) }),
      cb(),
      t
    );
    expect(names(menu)).not.toContain('ダイスを振る');
    expect(names(menu)).not.toContain('ダイス目を設定');
    expect(names(menu)).not.toContain('☐ 名前を隠す');
  });

  it('opens a die through the dice service where it lets this seat', () => {
    const dice = makeDice({ hasOwner: true, owner: 'me', isMine: true });
    const shut = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
    expect(names(shut)).not.toContain('ダイスを公開');

    const dieRules = rules({ canReveal: vi.fn(() => true) });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, dieRules, cb(), t);
    menu.find((m) => m.name === 'ダイスを公開')!.action!();
    expect(dieRules.reveal).toHaveBeenCalledWith(dice);
  });

  it('keeps a die through the dice service where it lets this seat', () => {
    const dice = makeDice();
    const shut = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
    expect(names(shut)).not.toContain('自分だけ見る');

    const dieRules = rules({ canKeep: vi.fn(() => true) });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, dieRules, cb(), t);
    menu.find((m) => m.name === '自分だけ見る')!.action!();
    expect(dieRules.keep).toHaveBeenCalledWith(dice);
  });

  it('offers as many faces as the die has', () => {
    const dice = makeDice({ faces: ['1', '2', '3', '4', '5', '6'] });
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
    const face = menu.find((m) => m.name === 'ダイス目を設定');
    expect(face?.subActions).toHaveLength(6);
  });

  it('sets the face from one of them through the dice service', () => {
    const dice = makeDice({ face: '1' });
    const dieRules = rules();
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, dieRules, cb(), t);
    const subs = menu.find((m) => m.name === 'ダイス目を設定')?.subActions;
    subs?.find((s) => s.name === '3')!.action!();
    expect(dieRules.setFace).toHaveBeenCalledWith(dice, '3');
  });

  it('ticks hiding the name and switches it through the dice service', () => {
    const shown = makeDice({ hideName: false });
    const dieRules = rules();
    const shownMenu = buildDiceSymbolContextMenu(shown as unknown as DiceSymbol, 50, dieRules, cb(), t);
    shownMenu.find((m) => m.name === '☐ 名前を隠す')!.action!();
    expect(dieRules.setNameHidden).toHaveBeenCalledWith(shown, true);

    const hidden = makeDice({ hideName: true });
    const hiddenMenu = buildDiceSymbolContextMenu(hidden as unknown as DiceSymbol, 50, rules(), cb(), t);
    expect(names(hiddenMenu)).toContain('☑ 名前を隠す');
  });

  it('destroys the die', () => {
    const dice = makeDice();
    const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
    menu.find((m) => m.name === '削除する')!.action!();
    expect(dice.destroy).toHaveBeenCalled();
  });

  describe('a die that has been spent', () => {
    it('offers to mark one that has not been', () => {
      const dice = makeDice({ isUsed: false });

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
      const mark = menu.find((each) => each.name === '☐ 使用済み');

      expect(mark).toBeDefined();
      mark!.action!();
      expect(dice.isUsed).toBe(true);
    });

    it('offers to take the mark off one that has', () => {
      const dice = makeDice({ isUsed: true });

      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);
      const unmark = menu.find((each) => each.name === '☑ 使用済み');

      expect(unmark).toBeDefined();
      unmark!.action!();
      expect(dice.isUsed).toBe(false);
    });

    it('is offered whether or not the face can be read, since spending is not a secret', () => {
      const hidden = makeDice();

      const menu = buildDiceSymbolContextMenu(
        hidden as unknown as DiceSymbol,
        50,
        rules({ canTurn: vi.fn(() => false) }),
        cb(),
        t
      );

      expect(names(menu)).toContain('☐ 使用済み');
    });
  });

  describe('as the dice service answers it', () => {
    let die: DiceSymbol;

    const menuOf = () => names(buildDiceSymbolContextMenu(die, 50, TestBed.inject(DiceRollService), cb(), t));

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
      beMyself('me');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'me';
      die = DiceSymbol.create('隠しダイス', DiceType.D6, 1);
      die.owner = 'somebody';
      vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice').mockReturnValue(null);
      vi.spyOn(TestBed.inject(ChatLineEditService), 'discloseDieRolls').mockReturnValue(0);
    });

    afterEach(() => {
      die.destroy();
      vi.restoreAllMocks();
      PeerCursor.myCursor = null!;
    });

    it('offers a player nothing to roll, set, hide, show or take of a die another seat keeps', () => {
      PeerCursor.myCursor.role = PeerRole.Player;

      const menu = menuOf();

      for (const entry of ['ダイスを振る', 'ダイス目を設定', '☐ 名前を隠す', 'ダイスを公開', '自分だけ見る']) {
        expect(menu).not.toContain(entry);
      }
    });

    it('offers the game master every entry on that die but throwing it and setting its face, which are its keeper’s', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;

      const menu = menuOf();

      for (const entry of ['☐ 名前を隠す', 'ダイスを公開', '自分だけ見る']) expect(menu).toContain(entry);
      for (const entry of ['ダイスを振る', 'ダイス目を設定']) expect(menu).not.toContain(entry);
    });

    it('lets its keeper show it, which says the face it shows', () => {
      PeerCursor.myCursor.role = PeerRole.Player;
      die.owner = 'me';
      die.face = '5';

      buildDiceSymbolContextMenu(die, 50, TestBed.inject(DiceRollService), cb(), t).find(
        (m) => m.name === 'ダイスを公開'
      )!.action!();

      expect(die.owner).toBe('');
      expect(TestBed.inject(ChatMessageService).sendSystemNotice).toHaveBeenCalledWith(
        'diceReveal',
        expect.stringContaining('5')
      );
    });
  });

  describe('whose die it is', () => {
    const goblin = { identifier: 'goblin', name: 'ゴブリンA' };

    it('offers the pieces it can be given to', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      expect(names(owner?.subActions ?? [])).toEqual(['☐ ゴブリンA']);
    });

    it('gives the die to the one that was chosen', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb([goblin]), t);

      menu.find((m) => m.name === 'コマに持たせる')?.subActions?.[0].action!();

      expect(dice.ownerCharacterIdentifier).toBe('goblin');
    });

    it('ticks the piece it already belongs to', () => {
      const dice = makeDice({ ownerCharacterIdentifier: 'goblin' });
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      expect(names(owner?.subActions ?? [])).toContain('☑ ゴブリンA');
    });

    it('offers to take it back once it belongs to somebody', () => {
      const dice = makeDice({ ownerCharacterIdentifier: 'goblin' });
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb([goblin]), t);
      const owner = menu.find((m) => m.name === 'コマに持たせる');

      owner?.subActions?.find((m) => m.name === '持ち主を外す')?.action!();

      expect(dice.ownerCharacterIdentifier).toBe('');
    });

    it('offers to put it away onto that piece, but not one whose face a room server keeps back', () => {
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
      beMyself('me');
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'me';
      PeerCursor.myCursor.role = PeerRole.Player;
      vi.spyOn(Network.instance, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const die = DiceSymbol.create('攻撃ダイス', DiceType.D6, 1);
      try {
        die.ownerCharacterIdentifier = 'goblin';
        const store = () =>
          buildDiceSymbolContextMenu(die, 50, rules(), { ...cb([goblin]), onStoreToOwner: vi.fn() }, t).find(
            (m) => m.name === 'コマにしまう'
          );
        expect(store()?.enabled).not.toBe(false);

        die.owner = 'someone';
        expect(store()?.enabled).toBe(false);
      } finally {
        die.destroy();
        vi.restoreAllMocks();
        PeerCursor.myCursor = null!;
      }
    });

    it('offers nothing of the sort with no pieces on the table', () => {
      const dice = makeDice();
      const menu = buildDiceSymbolContextMenu(dice as unknown as DiceSymbol, 50, rules(), cb(), t);

      expect(names(menu)).not.toContain('コマに持たせる');
    });
  });
});
