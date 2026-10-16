import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { buildCardStackContextMenu } from '@axe/features/card/card-stack/card-stack-context-menu';
import { createSyncTranslate } from '@axe/testing/transloco-testing';

const t = createSyncTranslate('ja');

describe('buildCardStackContextMenu', () => {
  it('splits the deck into a pile for each seat that plays, this one included, but no guest or seat gone', () => {
    const cardStack = CardStack.create('test stack');
    const onSplitStack = vi.fn();
    PeerCursor.createMyCursor().role = PeerRole.Player;
    const seat = (role: PeerRole, connected: boolean) => {
      const cursor = new PeerCursor();
      cursor.role = role;
      cursor.isDisConnect = !connected;
      cursor.initialize();
      return cursor;
    };
    const others = [seat(PeerRole.GameMaster, true), seat(PeerRole.Guest, true), seat(PeerRole.Player, false)];

    try {
      const actions = buildCardStackContextMenu(
        cardStack,
        50,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        onSplitStack,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        t
      );
      actions.find((action) => action.name === t('feature.cardStack.contextMenu.splitByPeers'))?.action?.();

      expect(onSplitStack).toHaveBeenCalledWith(2);
    } finally {
      for (const cursor of others) cursor.destroy();
      cardStack.destroy();
    }
  });

  it('offers drawing to the hand and drawing several right below drawing one, and does each', () => {
    const cardStack = CardStack.create('test stack');
    const onDrawCard = vi.fn();
    const onDrawToHand = vi.fn();
    const onDrawCards = vi.fn();

    try {
      const actions = buildCardStackContextMenu(
        cardStack,
        50,
        onDrawCard,
        onDrawToHand,
        onDrawCards,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        t
      );
      const drawIndex = actions.findIndex((action) => action.name === '１枚引く');

      expect(drawIndex).toBeGreaterThanOrEqual(0);
      expect(actions[drawIndex + 1].name).toBe('１枚引いて手札に加える');
      expect(actions[drawIndex + 2].name).toBe('X枚を引く');

      actions[drawIndex + 1].action?.();
      actions[drawIndex + 2].action?.();

      expect(onDrawToHand).toHaveBeenCalledOnce();
      expect(onDrawCards).toHaveBeenCalledOnce();
    } finally {
      cardStack.destroy();
    }
  });

  it('offers dealing the deck out before splitting it', () => {
    const cardStack = CardStack.create('test stack');
    try {
      const actions = buildCardStackContextMenu(
        cardStack,
        50,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        t
      );
      const dealIndex = actions.findIndex((action) => action.name === '全員に配り切る');

      expect(dealIndex).toBeGreaterThanOrEqual(0);
      expect(actions[dealIndex + 1].name).toBe('山札を人数分に分割する');
    } finally {
      cardStack.destroy();
    }
  });

  it('no longer offers the card list, which the sheet now holds', () => {
    const cardStack = CardStack.create('test stack');
    try {
      const actions = buildCardStackContextMenu(
        cardStack,
        50,
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        vi.fn(),
        t
      );
      expect(actions.some((action) => action.name === 'カード一覧')).toBe(false);
    } finally {
      cardStack.destroy();
    }
  });
});
