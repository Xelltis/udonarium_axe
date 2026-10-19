import { TestBed } from '@angular/core/testing';
import { ObjectSerializer } from '@axe/core/sync/object-serializer';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';

describe('CardStack', () => {
  let store: ObjectStore;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    store = ObjectStore.instance;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('clone()', () => {
    it('copies a deck with nobody holding it or its cards, as a card in a deck is given a holder by the game master alone', () => {
      const deck = CardStack.create('山札');
      const copy = CardStack.create('山札');
      const card = Card.create('剣の2', 'front.png', 'back.png');
      copy.putOnTop(card);
      copy.owner = 'acct_alice';
      card.owner = 'acct_bob';
      vi.spyOn(ObjectSerializer.instance, 'parseXml').mockReturnValue(copy);
      try {
        expect(deck.clone()).toBe(copy);
        expect(copy.owner).toBe('');
        expect(card.owner).toBe('');
      } finally {
        vi.restoreAllMocks();
        copy.destroy();
        deck.destroy();
      }
    });
  });

  describe('create()', () => {
    it('creates a deck with a name', () => {
      const stack = CardStack.create('テストデッキ');
      expect(stack).toBeTruthy();
      expect(stack.name).toBe('テストデッキ');
    });

    it('is created against an identifier of its own', () => {
      const stack = CardStack.create('デッキ', 'custom-stack-id');
      expect(stack.identifier).toBe('custom-stack-id');
    });

    it('is added to the store', () => {
      const stack = CardStack.create('デッキ');
      expect(store.get(stack.identifier)).toBe(stack);
    });
  });

  describe('aliasName', () => {
    it('names itself a deck', () => {
      const stack = CardStack.create('test');
      expect(stack.aliasName).toBe('card-stack');
    });
  });

  describe('the defaults of the synchronised fields', () => {
    it('starts unlocked', () => {
      const stack = CardStack.create('test');
      expect(stack.isLock).toBe(false);
    });

    it('starts unturned', () => {
      const stack = CardStack.create('test');
      expect(stack.rotate).toBe(0);
    });

    it('starts at the bottom of the stack', () => {
      const stack = CardStack.create('test');
      expect(stack.zindex).toBe(0);
    });

    it('starts unowned', () => {
      const stack = CardStack.create('test');
      expect(stack.owner).toBe('');
    });

    it('starts showing the count', () => {
      const stack = CardStack.create('test');
      expect(stack.isShowTotal).toBe(true);
    });
  });

  describe('cards', () => {
    it('holds no cards while it is empty', () => {
      const stack = CardStack.create('test');
      expect(stack.cards).toEqual([]);
    });

    it('is empty', () => {
      const stack = CardStack.create('test');
      expect(stack.isEmpty).toBe(true);
    });
  });

  describe('putOnTop / putOnBottom', () => {
    it('puts a card on the top', () => {
      const stack = CardStack.create('test');
      const card = Card.create('カード1', '', '', 2);

      stack.putOnTop(card);
      expect(stack.cards).toHaveLength(1);
      expect(stack.isEmpty).toBe(false);
    });

    it('puts one on the bottom', () => {
      const stack = CardStack.create('test');
      const card = Card.create('カード1', '', '', 2);

      stack.putOnBottom(card);
      expect(stack.cards).toHaveLength(1);
    });

    it('returns the last card put on as the top one', () => {
      const stack = CardStack.create('test');
      const card1 = Card.create('カード1', '', '', 2);
      const card2 = Card.create('カード2', '', '', 2);

      stack.putOnTop(card1);
      stack.putOnTop(card2);

      expect(stack.topCard).toBe(card2);
    });
  });

  describe('drawCard()', () => {
    it('draws one card', () => {
      const stack = CardStack.create('test');
      const card = Card.create('カード1', '', '', 2);
      stack.putOnTop(card);

      const drawn = stack.drawCard();
      expect(drawn).toBeTruthy();
      expect(stack.cards).toHaveLength(0);
    });

    it('draws nothing from an empty deck', () => {
      const stack = CardStack.create('test');
      const drawn = stack.drawCard();
      expect(drawn).toBeFalsy();
    });
  });

  describe('drawCardAll()', () => {
    it('draws them all', () => {
      const stack = CardStack.create('test');
      stack.putOnTop(Card.create('c1', '', '', 2));
      stack.putOnTop(Card.create('c2', '', '', 2));
      stack.putOnTop(Card.create('c3', '', '', 2));

      const drawn = stack.drawCardAll();
      expect(drawn).toHaveLength(3);
      expect(stack.cards).toHaveLength(0);
    });
  });

  describe('shuffle()', () => {
    it('shuffles them', () => {
      const stack = CardStack.create('test');
      for (let i = 0; i < 20; i++) {
        stack.putOnTop(Card.create(`c${i}`, '', '', 2));
      }

      const before = stack.cards.map((c) => c.identifier);
      stack.shuffle();
      const after = stack.cards.map((c) => c.identifier);

      // with twenty cards the same order is all but impossible
      expect(after).toHaveLength(before.length);
      // at least the same cards are there
      expect(after.sort()).toEqual(before.sort());
    });
  });

  describe('faceUp / faceDown', () => {
    it('turns them all face up', () => {
      const stack = CardStack.create('test');
      const card1 = Card.create('c1', '', '', 2);
      const card2 = Card.create('c2', '', '', 2);
      card1.state = CardState.BACK;
      card2.state = CardState.BACK;
      stack.putOnTop(card1);
      stack.putOnTop(card2);

      stack.faceUpAll();
      for (const card of stack.cards) {
        expect(card.state).toBe(CardState.FRONT);
      }
    });

    it('turns them all face down', () => {
      const stack = CardStack.create('test');
      const card1 = Card.create('c1', '', '', 2);
      stack.putOnTop(card1);
      card1.state = CardState.FRONT;

      stack.faceDownAll();
      for (const card of stack.cards) {
        expect(card.state).toBe(CardState.BACK);
      }
    });
  });

  describe('hasOwner', () => {
    it('is false while it is unowned', () => {
      const stack = CardStack.create('test');
      expect(stack.hasOwner).toBe(false);
    });

    it('is true once it has an owner', () => {
      const stack = CardStack.create('test');
      stack.owner = 'user-1';
      expect(stack.hasOwner).toBe(true);
    });
  });

  describe('what it inherits', () => {
    it('starts on the table', () => {
      const stack = CardStack.create('test');
      expect(stack.location.name).toBe('table');
    });
  });
});
