import { Network } from '@axe/core/network/network';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { Card } from '@axe/domain/card/card';
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
    const seat = (peerId: string, role: PeerRole) => {
      const cursor = new PeerCursor();
      cursor.peerId = peerId;
      cursor.role = role;
      cursor.isDisConnect = false;
      cursor.initialize();
      return cursor;
    };
    const others = [
      seat('gm', PeerRole.GameMaster),
      seat('guest', PeerRole.Guest),
      seat('gone', PeerRole.Player),
      seat('reloaded', PeerRole.Player),
      seat('reloaded', PeerRole.Player),
    ];
    vi.spyOn(Network, 'peerIds', 'get').mockReturnValue(['gm', 'guest', 'reloaded']);

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

      expect(onSplitStack).toHaveBeenCalledWith(3);
    } finally {
      vi.restoreAllMocks();
      for (const cursor of others) cursor.destroy();
      cardStack.destroy();
    }
  });

  it('copies a deck with nobody holding its cards, as a card in a deck is given a holder by the game master alone', () => {
    const cardStack = CardStack.create('test stack');
    const copy = CardStack.create('test stack');
    const card = Card.create('剣の2', 'front.png', 'back.png');
    copy.putOnTop(card);
    card.owner = 'acct_bob';
    vi.spyOn(ObjectSerializer.instance, 'parseXml').mockReturnValue(copy);
    PeerCursor.createMyCursor().role = PeerRole.Player;

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
      actions.find((action) => action.name === t('feature.tabletop.contextMenu.copy'))?.action?.();

      expect(copy.cards.map((copied) => copied.owner)).toEqual(['']);
    } finally {
      vi.restoreAllMocks();
      copy.destroy();
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
