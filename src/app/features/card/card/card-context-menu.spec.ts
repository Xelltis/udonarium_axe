import { Card } from '@axe/domain/card/card';
import { buildCardContextMenu } from '@axe/features/card/card/card-context-menu';
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
  onFlipToFront: vi.fn(),
  onAssignCutIn: vi.fn(),
  onPickTarget: vi.fn(),
  onClearTarget: vi.fn(),
});
const noCutIns: { identifier: string; name: string }[] = [];

describe('buildCardContextMenu()', () => {
  it('offers nothing about the lock mark while it is unlocked', () => {
    const card = makeCard({ isLock: false });
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定する');
    expect(names(menu)).not.toContain('固定マーク消去');
    expect(names(menu)).not.toContain('固定マーク表示');
  });

  it('offers to hide the mark while it is shown', () => {
    const card = makeCard({ isLock: true, dispLockMark: true });
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定解除');
    expect(names(menu)).toContain('固定マーク消去');
  });

  it('offers to show it while it is hidden', () => {
    const card = makeCard({ isLock: true, dispLockMark: false });
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('固定マーク表示');
  });

  it('offers to turn a card onto whichever side is down', () => {
    const visible = buildCardContextMenu(
      makeCard({ isVisible: true, isPeeking: false }) as unknown as Card,
      50,
      defaultCallbacks(),
      noCutIns,
      t
    );
    expect(names(visible)).toContain('裏にする');

    const hidden = buildCardContextMenu(
      makeCard({ isVisible: false, isPeeking: false }) as unknown as Card,
      50,
      defaultCallbacks(),
      noCutIns,
      t
    );
    expect(names(hidden)).toContain('表にする');
  });

  it('offers to turn it back rather than to peek while it is being peeked at', () => {
    const card = makeCard({ isPeeking: true });
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    expect(names(menu).filter((n) => n === '裏にする').length).toBeGreaterThan(0);
    expect(names(menu)).not.toContain('自分だけ見る');
  });

  it('ties a cut-in to the card being turned over', () => {
    const onAssignCutIn = vi.fn();
    const menu = buildCardContextMenu(
      makeCard({ cutInIdentifier: 'cut-1' }) as unknown as Card,
      50,
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

  it('plays that cut-in as it turns face up', () => {
    const onFlipToFront = vi.fn();
    const menu = buildCardContextMenu(
      makeCard({ isVisible: false, isPeeking: false }) as unknown as Card,
      50,
      { ...defaultCallbacks(), onFlipToFront },
      noCutIns,
      t
    );

    menu.find((m) => m.name === '表にする')!.action!();
    expect(onFlipToFront).toHaveBeenCalled();
  });

  it('offers no clearing on a card nothing is aimed at', () => {
    const menu = buildCardContextMenu(makeCard() as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    expect(names(menu)).toContain('ターゲットを指定');
    expect(names(menu)).not.toContain('ターゲットを解除');
  });

  it('clears what is aimed at one', () => {
    const onClearTarget = vi.fn();
    const menu = buildCardContextMenu(
      makeCard({ targetIdentifier: 'other' }) as unknown as Card,
      50,
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
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    menu.find((m) => m.name === 'コピーを作る')!.action!();
    expect(card.clone).toHaveBeenCalledOnce();
    expect(copy.location).toEqual({ x: 150, y: 250 });
    expect(copy.toTopmost).toHaveBeenCalledOnce();
  });

  it('destroys the card', () => {
    const card = makeCard();
    const menu = buildCardContextMenu(card as unknown as Card, 50, defaultCallbacks(), noCutIns, t);
    menu.find((m) => m.name === '削除する')!.action!();
    expect(card.destroy).toHaveBeenCalled();
  });

  it('offers taking that pile into the hand right after making a deck of it', () => {
    const card = makeCard({});
    const callbacks = defaultCallbacks();
    const menu = buildCardContextMenu(card as unknown as Card, 50, callbacks, noCutIns, t);
    const stackIndex = names(menu).indexOf('重なったカードで山札を作る');

    expect(stackIndex).toBeGreaterThanOrEqual(0);
    expect(names(menu)[stackIndex + 1]).toBe('重なったカードを手札に加える');

    menu[stackIndex + 1].action?.();
    expect(callbacks.onOverlappingToHand).toHaveBeenCalledOnce();
  });
});
