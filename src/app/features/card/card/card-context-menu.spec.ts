import { TestBed } from '@angular/core/testing';
import { CardGameService } from '@axe/application/card/card-game.service';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { Card, CardState } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { buildCardContextMenu, type CardRules } from '@axe/features/card/card/card-context-menu';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

interface MutableCard {
  isLock: boolean;
  dispLockMark: boolean;
  isVisible: boolean;
  isPeeking: boolean;
  cutInIdentifier: string;
  targetIdentifier: string;
  faceUp: ReturnType<typeof vi.fn>;
  faceDown: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  clone: ReturnType<typeof vi.fn>;
}

function makeCard(overrides: Partial<MutableCard> = {}): MutableCard {
  return {
    isLock: false,
    dispLockMark: true,
    isVisible: true,
    isPeeking: false,
    cutInIdentifier: '',
    targetIdentifier: '',
    faceUp: vi.fn(),
    faceDown: vi.fn(),
    destroy: vi.fn(),
    clone: vi.fn(() => ({ location: { x: 0, y: 0 }, toTopmost: vi.fn() })),
    ...overrides,
  };
}

const names = (a: { name: string }[]) => a.map((x) => x.name);
const defaultCallbacks = () => ({
  onCreateStack: vi.fn(),
  onOverlappingToHand: vi.fn(),
  onShowDetail: vi.fn(),
  onAssignCutIn: vi.fn(),
  onPickTarget: vi.fn(),
  onClearTarget: vi.fn(),
});
/** The card service's rules as the menu asks them, letting this seat do everything unless told otherwise. */
const rules = (overrides: Partial<Record<keyof CardRules, unknown>> = {}) =>
  ({
    canHandle: vi.fn(() => true),
    canOpenSheet: vi.fn(() => true),
    faceUp: vi.fn(() => true),
    faceDown: vi.fn(() => true),
    peek: vi.fn(() => true),
    takeToHand: vi.fn(() => []),
    ...overrides,
  }) as unknown as CardRules & Record<keyof CardRules, ReturnType<typeof vi.fn>>;
const noCutIns: { identifier: string; name: string }[] = [];

describe('buildCardContextMenu()', () => {
  it('offers nothing about the lock mark while it is unlocked', () => {
    const card = makeCard({ isLock: false });
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定する');
    expect(names(menu)).not.toContain('固定マーク消去');
    expect(names(menu)).not.toContain('固定マーク表示');
  });

  it('offers to hide the mark while it is shown', () => {
    const card = makeCard({ isLock: true, dispLockMark: true });
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定解除');
    expect(names(menu)).toContain('固定マーク消去');
  });

  it('offers to show it while it is hidden', () => {
    const card = makeCard({ isLock: true, dispLockMark: false });
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定マーク表示');
  });

  it('offers to turn a card onto whichever side is down', () => {
    const visible = buildCardContextMenu(
      makeCard({ isVisible: true, isPeeking: false }) as unknown as Card,
      50,
      rules(),
      defaultCallbacks(),
      noCutIns,
      t
    );
    expect(names(visible)).toContain('裏にする');

    const hidden = buildCardContextMenu(
      makeCard({ isVisible: false, isPeeking: false }) as unknown as Card,
      50,
      rules(),
      defaultCallbacks(),
      noCutIns,
      t
    );
    expect(names(hidden)).toContain('表にする');
  });

  it('offers to turn it back rather than to peek while it is being peeked at', () => {
    const card = makeCard({ isPeeking: true });
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    expect(names(menu).filter((n) => n === '裏にする').length).toBeGreaterThan(0);
    expect(names(menu)).not.toContain('自分だけ見る');
  });

  it('ties a cut-in to the card being turned over', () => {
    const onAssignCutIn = vi.fn();
    const menu = buildCardContextMenu(
      makeCard({ cutInIdentifier: 'cut-1' }) as unknown as Card,
      50,
      rules(),
      { ...defaultCallbacks(), onAssignCutIn },
      [
        { identifier: 'cut-1', name: '召喚' },
        { identifier: 'cut-2', name: '撃破' },
      ],
      t
    );

    const entry = menu.find((m) => m.name === 'めくったときのカットイン');
    expect(names(entry!.subActions!)).toEqual(['（なし）', '✔ 召喚', '撃破']);

    entry!.subActions!.find((m) => m.name === '撃破')!.action!();
    expect(onAssignCutIn).toHaveBeenCalledWith('cut-2');

    entry!.subActions!.find((m) => m.name === '（なし）')!.action!();
    expect(onAssignCutIn).toHaveBeenCalledWith('');
  });

  it('turns, peeks at and takes the card through the card service', () => {
    const card = makeCard({ isVisible: false, isPeeking: false });
    const cards = rules();
    const menu = buildCardContextMenu(card as unknown as Card, 50, cards, defaultCallbacks(), noCutIns, t);

    menu.find((m) => m.name === '表にする')!.action!();
    menu.find((m) => m.name === '自分だけ見る')!.action!();
    menu.find((m) => m.name === '手札に加える')!.action!();

    expect(cards.faceUp).toHaveBeenCalledWith(card);
    expect(cards.peek).toHaveBeenCalledWith(card);
    expect(cards.takeToHand).toHaveBeenCalledWith([card]);
    expect(card.faceUp).not.toHaveBeenCalled();
  });

  it('offers no turning, peeking, taking or gathering into a stack of a card this seat may not handle', () => {
    const card = makeCard({ isVisible: false, isPeeking: false });
    const menu = buildCardContextMenu(
      card as unknown as Card,
      50,
      rules({ canHandle: vi.fn(() => false) }),
      defaultCallbacks(),
      noCutIns,
      t
    );

    expect(names(menu)).not.toContain('表にする');
    expect(names(menu)).not.toContain('裏にする');
    expect(names(menu)).not.toContain('自分だけ見る');
    expect(names(menu)).not.toContain('手札に加える');
    expect(names(menu)).not.toContain('重なったカードで山札を作る');
  });

  it('leaves editing shut where this seat may not open the sheet', () => {
    const shut = buildCardContextMenu(
      makeCard() as unknown as Card,
      50,
      rules({ canOpenSheet: vi.fn(() => false) }),
      defaultCallbacks(),
      noCutIns,
      t
    );
    const open = buildCardContextMenu(makeCard() as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);

    expect(shut.find((m) => m.name === 'カードを編集')!.enabled).toBe(false);
    expect(open.find((m) => m.name === 'カードを編集')!.enabled).toBe(true);
  });

  describe('as the card service answers it', () => {
    let card: Card;

    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
      const me = { userId: 'me', isOpen: true } as IPeerContext;
      const them = { userId: 'them', isOpen: true } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me, them], peerIds: [], peerId: 'me' });
      PeerCursor.createMyCursor();
      PeerCursor.myCursor.userId = 'me';
      card = Card.create('秘密', 'front.png', 'back.png');
      card.location.name = 'table';
    });

    afterEach(() => {
      card.destroy();
      PeerCursor.myCursor = null!;
    });

    it.each([PeerRole.Player, PeerRole.GameMaster])(
      'offers the %s nothing to turn, peek at or take of a card another seat connected now peeks at',
      (role) => {
        PeerCursor.myCursor.role = role;
        card.state = CardState.BACK;
        card.owner = 'them';
        const menu = buildCardContextMenu(card, 50, TestBed.inject(CardGameService), defaultCallbacks(), noCutIns, t);

        expect(names(menu)).not.toContain('表にする');
        expect(names(menu)).not.toContain('自分だけ見る');
        expect(names(menu)).not.toContain('手札に加える');
      }
    );

    it('leaves a player no editing of a face-down card, and the game master editing of it', () => {
      card.state = CardState.BACK;
      const edit = () =>
        buildCardContextMenu(card, 50, TestBed.inject(CardGameService), defaultCallbacks(), noCutIns, t).find(
          (m) => m.name === 'カードを編集'
        )!.enabled;

      PeerCursor.myCursor.role = PeerRole.Player;
      expect(edit()).toBe(false);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect(edit()).toBe(true);
    });
  });

  it('offers no clearing on a card nothing is aimed at', () => {
    const menu = buildCardContextMenu(makeCard() as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('ターゲットを指定');
    expect(names(menu)).not.toContain('ターゲットを解除');
  });

  it('clears what is aimed at one', () => {
    const onClearTarget = vi.fn();
    const menu = buildCardContextMenu(
      makeCard({ targetIdentifier: 'other' }) as unknown as Card,
      50,
      rules(),
      { ...defaultCallbacks(), onClearTarget },
      noCutIns,
      t
    );

    menu.find((m) => m.name === 'ターゲットを解除')!.action!();
    expect(onClearTarget).toHaveBeenCalled();
  });

  it('makes a deck out of the cards piled on it', () => {
    const onCreateStack = vi.fn();
    const menu = buildCardContextMenu(
      makeCard() as unknown as Card,
      50,
      rules(),
      { ...defaultCallbacks(), onCreateStack },
      noCutIns,
      t
    );
    menu.find((m) => m.name === '重なったカードで山札を作る')!.action!();
    expect(onCreateStack).toHaveBeenCalled();
  });

  it('opens the sheet of the card from "edit card"', () => {
    const onShowDetail = vi.fn();
    const menu = buildCardContextMenu(
      makeCard() as unknown as Card,
      50,
      rules(),
      { ...defaultCallbacks(), onShowDetail },
      noCutIns,
      t
    );
    menu.find((m) => m.name === 'カードを編集')!.action!();
    expect(onShowDetail).toHaveBeenCalledOnce();
  });

  it('copies the card a cell down and to the right, on top of the rest', () => {
    const copy = { location: { x: 100, y: 200 }, toTopmost: vi.fn() };
    const card = makeCard({ clone: vi.fn(() => copy) });
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    menu.find((m) => m.name === 'コピーを作る')!.action!();
    expect(card.clone).toHaveBeenCalledOnce();
    expect(copy.location).toEqual({ x: 150, y: 250 });
    expect(copy.toTopmost).toHaveBeenCalledOnce();
  });

  it('destroys the card', () => {
    const card = makeCard();
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), defaultCallbacks(), noCutIns, t);
    menu.find((m) => m.name === '削除する')!.action!();
    expect(card.destroy).toHaveBeenCalled();
  });

  it('offers taking that pile into the hand right after making a deck of it', () => {
    const card = makeCard({});
    const callbacks = defaultCallbacks();
    const menu = buildCardContextMenu(card as unknown as Card, 50, rules(), callbacks, noCutIns, t);
    const stackIndex = names(menu).indexOf('重なったカードで山札を作る');

    expect(stackIndex).toBeGreaterThanOrEqual(0);
    expect(names(menu)[stackIndex + 1]).toBe('重なったカードを手札に加える');

    menu[stackIndex + 1].action?.();
    expect(callbacks.onOverlappingToHand).toHaveBeenCalledOnce();
  });
});
