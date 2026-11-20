import { TestBed } from '@angular/core/testing';
import { CardFlipCutInService } from '@axe/application/card/card-flip-cut-in.service';
import { CardGameService } from '@axe/application/card/card-game.service';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { Network } from '@axe/core/network/network';
import type { IPeerContext } from '@axe/core/network/peer-context';
import { setPeerContextProvider } from '@axe/core/network/peer-context-source';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card, CardState } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { handLocationOf } from '@axe/domain/card/hand-location';
import { ChatMessage } from '@axe/domain/chat/chat-message';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardGameService', () => {
  let service: CardGameService;
  let sendSystemNotice: ReturnType<typeof vi.fn>;
  const created: { destroy(): void }[] = [];

  function trumpCard(code: string): Card {
    const card = Card.create('カード', `./assets/images/trump/${code}.webp`, './assets/images/trump/z01.webp');
    created.push(card);
    return card;
  }

  let linked: string[];

  function peer(userId: string, name: string, role: PeerRole = PeerRole.Player): PeerCursor {
    const cursor = new PeerCursor();
    cursor.userId = userId;
    cursor.peerId = `peer-${userId}`;
    linked.push(cursor.peerId);
    cursor.name = name;
    cursor.role = role;
    cursor.initialize();
    created.push(cursor);
    return cursor;
  }

  beforeEach(() => {
    // Whoever ran before may have left a cursor behind, and a stray one counts as
    // another player at the table.
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) {
      ObjectStore.instance.delete(cursor, false);
    }
    ObjectStore.instance.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.userId = 'me';
    PeerCursor.myCursor.name = 'わたし';
    PeerCursor.myCursor.role = PeerRole.Player;
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    linked = [];
    vi.spyOn(Network, 'peerIds', 'get').mockImplementation(() => [...linked]);
    service = TestBed.inject(CardGameService);
    sendSystemNotice = vi
      .spyOn(TestBed.inject(ChatMessageService), 'sendSystemNotice')
      .mockReturnValue(null as unknown as ChatMessage) as unknown as ReturnType<typeof vi.fn>;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of created.splice(0)) object.destroy();
    for (const cursor of ObjectStore.instance.getObjects<PeerCursor>(PeerCursor)) {
      if (cursor !== PeerCursor.myCursor) ObjectStore.instance.delete(cursor, false);
    }
  });

  describe('dealAll()', () => {
    it('deals out to everyone and hands out exactly one joker', () => {
      const other = peer('other', 'あいて');
      const stack = CardStack.create('山札');
      created.push(stack);
      for (const code of ['s01', 's02', 'h01', 'h02', 'x01', 'x02']) stack.putOnBottom(trumpCard(code));

      const result = service.dealAll(stack);

      expect(result).toEqual({ dealt: 5, participants: 2 });
      expect(service.handCardsOf('me').length + service.handCardsOf(other.userId).length).toBe(5);
      expect(stack.cards).toHaveLength(1);
      expect(sendSystemNotice).toHaveBeenCalledOnce();
    });

    it('gives no two cards in a hand the same place', () => {
      const stack = CardStack.create('山札');
      created.push(stack);
      for (const code of ['s01', 's02', 's03']) stack.putOnBottom(trumpCard(code));

      service.dealAll(stack);

      const orders = service.handCardsOf('me').map((card) => card.handOrder);
      expect(new Set(orders).size).toBe(orders.length);
    });

    it('deals once to a seat that loaded the page again, and nothing to one gone', () => {
      const before = peer('again', 'さいど');
      const after = peer('again', 'さいど');
      const gone = peer('gone', 'たいしつ');
      linked.splice(linked.indexOf(gone.peerId), 1);
      expect(before.peerId).toBe(after.peerId);
      const stack = CardStack.create('山札');
      created.push(stack);
      for (const code of ['s01', 's02', 's03', 's04']) stack.putOnBottom(trumpCard(code));

      const result = service.dealAll(stack);

      expect(result.participants).toBe(2);
      expect(service.handCardsOf('again')).toHaveLength(2);
      expect(service.handCardsOf('gone')).toHaveLength(0);
    });

    it('deals nothing to an onlooker', () => {
      peer('guest', 'けんがく', PeerRole.Guest);
      const stack = CardStack.create('山札');
      created.push(stack);
      for (const code of ['s01', 's02']) stack.putOnBottom(trumpCard(code));

      const result = service.dealAll(stack);

      expect(result.participants).toBe(1);
      expect(service.handCardsOf('guest')).toHaveLength(0);
    });
  });

  describe('drawFromHand()', () => {
    it('moves a card from another hand into your own', () => {
      const card = trumpCard('s07');
      card.toHand('other');

      expect(service.drawFromHand(card, 'あいて')).toBe(true);

      expect(card.location.name).toBe(handLocationOf('me'));
      expect(service.handCardsOf('other')).toHaveLength(0);
      expect(sendSystemNotice).toHaveBeenCalledOnce();
    });

    it('moves nothing for a guest, who holds no cards', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      const card = trumpCard('s07');
      card.toHand('other');

      expect(service.drawFromHand(card, 'あいて')).toBe(false);

      expect(card.location.name).toBe(handLocationOf('other'));
      expect(sendSystemNotice).not.toHaveBeenCalled();
    });
  });

  describe('giveFromHand()', () => {
    it('passes a card face down into the hand of the one it is for, saying so without naming it', () => {
      const other = peer('other', 'あいて');
      const card = trumpCard('s07');
      card.toHand('me');

      expect(service.giveFromHand(card, other.userId)).toBe(true);

      expect(card.location.name).toBe(handLocationOf('other'));
      expect(card.isFront).toBe(false);
      expect(service.handCardsOf('me')).toHaveLength(0);
      expect(sendSystemNotice).toHaveBeenCalledOnce();
      expect(sendSystemNotice.mock.calls[0][0]).toBe('card');
      expect(String(sendSystemNotice.mock.calls[0][1])).not.toContain('カード');
    });

    it('gives nothing that has already left your hand', () => {
      peer('other', 'あいて');
      const card = trumpCard('s07');
      card.toHand('third');

      expect(service.giveFromHand(card, 'other')).toBe(false);

      expect(card.location.name).toBe(handLocationOf('third'));
      expect(sendSystemNotice).not.toHaveBeenCalled();
    });

    it('gives nothing to somebody who has left, or who only watches', () => {
      peer('watcher', 'みるだけ', PeerRole.Guest);
      const card = trumpCard('s07');
      card.toHand('me');

      expect(service.giveFromHand(card, 'gone')).toBe(false);
      expect(service.giveFromHand(card, 'watcher')).toBe(false);

      expect(card.location.name).toBe(handLocationOf('me'));
    });

    it('gives nothing to yourself', () => {
      const card = trumpCard('s07');
      card.toHand('me');

      expect(service.giveFromHand(card, 'me')).toBe(false);
      expect(sendSystemNotice).not.toHaveBeenCalled();
    });
  });

  describe('the hands of people who have left', () => {
    function spoke(userId: string, name: string, timestamp: number): void {
      const message = new ChatMessage();
      message.initialize();
      message.from = userId;
      message.to = '';
      message.tag = '';
      message.name = name;
      message.setAttribute('timestamp', String(timestamp));
      created.push(message);
    }

    function heldBy(userId: string, ...codes: string[]): Card[] {
      return codes.map((code, index) => {
        const card = trumpCard(code);
        card.toHand(userId, index);
        return card;
      });
    }

    it('finds a hand nobody in the room holds, under the name its holder last spoke under', () => {
      peer('other', 'あいて', PeerRole.Guest);
      heldBy('other', 's01');
      heldBy('me', 's02');
      heldBy('gone', 's03', 's04');
      spoke('gone', 'むかしの名前', 1000);
      spoke('gone', 'さいごの名前', 2000);

      expect(service.absentHands()).toEqual([{ userId: 'gone', name: 'さいごの名前', count: 2 }]);
    });

    it('counts as absent on a room server a hand held for one there only as a guest, who holds no cards', () => {
      vi.spyOn(Network, 'transport', 'get').mockReturnValue('server');
      peer('claimed', 'なりすまし', PeerRole.Guest);
      heldBy('claimed', 's01');

      expect(service.absentHands().map((hand) => hand.userId)).toEqual(['claimed']);
    });

    it('looks for the names again as lines are said, and not each time a card moves', () => {
      heldBy('gone', 's03');
      spoke('gone', 'まえの名前', 1000);
      expect(service.absentHands()[0].name).toBe('まえの名前');

      const scans = vi.spyOn(TestBed.inject(ObjectStore), 'getObjects');
      heldBy('gone', 's04');
      expect(service.absentHands()[0].count).toBe(2);
      expect(scans.mock.calls.filter((call) => (call as unknown[])[0] === ChatMessage)).toHaveLength(0);

      spoke('gone', 'あとの名前', 2000);
      expect(service.absentHands()[0].name).toBe('あとの名前');
    });

    it('names a holder who never spoke by the start of their user id', () => {
      heldBy('abcdef123456', 's01');

      expect(service.absentHands()[0].name).toBe('abcdef');
    });

    it('lets the game master hand one over face down, in the order it was held', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      peer('back', 'もどってきた人');
      const cards = heldBy('gone', 's01', 's02', 's03');

      expect(service.handOverAbsentHand('gone', 'back')).toBe(3);

      expect(service.handCardsOf('back')).toEqual(cards);
      expect(cards.every((card) => !card.isFront)).toBe(true);
      expect(service.absentHands()).toEqual([]);
      expect(sendSystemNotice).toHaveBeenCalledOnce();
    });

    it('lets nobody but the game master hand one over', () => {
      peer('back', 'もどってきた人');
      heldBy('gone', 's01');

      expect(service.handOverAbsentHand('gone', 'back')).toBe(0);
      expect(service.handCardsOf('gone')).toHaveLength(1);
    });

    it('hands nothing over once its holder is back, or to somebody who cannot hold it', () => {
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      peer('watcher', 'みるだけ', PeerRole.Guest);
      heldBy('gone', 's01');

      expect(service.handOverAbsentHand('gone', 'watcher')).toBe(0);
      peer('gone', 'もどった');
      peer('back', 'もどってきた人');
      expect(service.handOverAbsentHand('gone', 'back')).toBe(0);

      expect(service.handCardsOf('gone')).toHaveLength(1);
      expect(sendSystemNotice).not.toHaveBeenCalled();
    });
  });

  describe('whose front a seat reads', () => {
    function looseCard(state: CardState, owner = ''): Card {
      const card = Card.create('秘密', 'front.png', 'back.png');
      card.location.name = 'table';
      card.state = state;
      card.owner = owner;
      created.push(card);
      return card;
    }

    it('lets a player read a card showing them its face and no other, and the game master every one', () => {
      const faceUp = looseCard(CardState.FRONT);
      const faceDown = looseCard(CardState.BACK);
      const peekedByThem = looseCard(CardState.BACK, 'them');
      const stack = CardStack.create('山札');
      created.push(stack);
      const inDeck = looseCard(CardState.FRONT);
      stack.putOnBottom(inDeck);

      expect([faceUp, faceDown, peekedByThem, inDeck].map((card) => service.canReadFront(card))).toEqual([
        true,
        false,
        false,
        false,
      ]);
      PeerCursor.myCursor.role = PeerRole.GameMaster;
      expect([faceUp, faceDown, peekedByThem, inDeck].map((card) => service.canReadFront(card))).toEqual([
        true,
        true,
        true,
        true,
      ]);
    });

    it('opens the sheet of a card only where its disclosure and its front both let the seat', () => {
      const faceUp = looseCard(CardState.FRONT);
      const faceDown = looseCard(CardState.BACK);
      expect(service.canOpenSheet(faceUp)).toBe(true);
      expect(service.canOpenSheet(faceDown)).toBe(false);

      faceUp.disclosureMode = 'gm';
      expect(service.canOpenSheet(faceUp)).toBe(false);
    });
  });

  describe('a card another seat connected now peeks at', () => {
    function peekedByThem(): Card {
      const card = Card.create('秘密', 'front.png', 'back.png');
      card.location.name = 'table';
      card.state = CardState.BACK;
      card.owner = 'them';
      created.push(card);
      return card;
    }

    function themOnline(isOpen: boolean): void {
      const me = { userId: 'me', isOpen: true } as IPeerContext;
      const them = { userId: 'them', isOpen } as IPeerContext;
      setPeerContextProvider({ peerContext: me, peerContexts: [me, them], peerIds: [...linked], peerId: 'me' });
    }

    function aStack(): CardStack {
      const stack = CardStack.create('山札');
      created.push(stack);
      return stack;
    }

    const ways: [string, (card: Card) => unknown][] = [
      ['turning it face up', (card) => service.faceUp(card)],
      ['turning it face down', (card) => service.faceDown(card)],
      ['flipping it', (card) => service.flip(card)],
      ['peeking at it', (card) => service.peek(card)],
      ['taking it into the hand', (card) => service.takeToHand([card])],
      ['putting it on top of a stack', (card) => service.putIntoStack(aStack(), [card], 'top')],
      ['putting it at the bottom of a stack', (card) => service.putIntoStack(aStack(), [card], 'bottom')],
      [
        'gathering it into a new stack',
        (card) => {
          const stack = service.stackUp(card, [card]);
          if (stack) created.push(stack);
        },
      ],
    ];

    it.each(ways)('is left as it lies by %s, for a player and the game master alike', (_way, handle) => {
      themOnline(true);
      const cutIn = vi.spyOn(TestBed.inject(CardFlipCutInService), 'playFor');
      for (const role of [PeerRole.Player, PeerRole.GameMaster]) {
        PeerCursor.myCursor.role = role;
        const card = peekedByThem();

        handle(card);

        expect([card.state, card.owner, card.location.name]).toEqual([CardState.BACK, 'them', 'table']);
        expect(service.canHandle(card)).toBe(false);
      }
      expect(cutIn).not.toHaveBeenCalled();
    });

    it.each(ways)('is handled as any other by %s once that seat has gone', (_way, handle) => {
      themOnline(false);
      const card = peekedByThem();

      handle(card);

      expect([card.state, card.owner, card.location.name]).not.toEqual([CardState.BACK, 'them', 'table']);
    });

    it('takes into the hand only the cards of a handful nobody else holds', () => {
      themOnline(true);
      const theirs = peekedByThem();
      const free = Card.create('自由', 'front.png', 'back.png');
      free.location.name = 'table';
      created.push(free);

      expect(service.takeToHand([theirs, free])).toEqual([free]);
      expect(free.isInMyHand).toBe(true);
      expect(theirs.location.name).toBe('table');
    });

    it('puts into a stack only the cards of a handful nobody else holds, and gathers none round a card another holds', () => {
      themOnline(true);
      const theirs = peekedByThem();
      const free = Card.create('自由', 'front.png', 'back.png');
      free.location.name = 'table';
      created.push(free);
      const stack = aStack();

      expect(service.putIntoStack(stack, [theirs, free], 'top')).toEqual([free]);
      expect(stack.cards).toEqual([free]);
      expect(service.stackUp(theirs, [theirs])).toBeNull();
      expect(theirs.location.name).toBe('table');
    });

    it('handles nothing for a guest', () => {
      PeerCursor.myCursor.role = PeerRole.Guest;
      const card = Card.create('自由', 'front.png', 'back.png');
      card.location.name = 'table';
      created.push(card);

      expect(service.faceDown(card)).toBe(false);
      expect(service.takeToHand([card])).toEqual([]);
      expect(card.isFront).toBe(true);
    });
  });

  describe('drawing, breaking up and splitting a stack', () => {
    function deckOf(count: number): CardStack {
      const stack = CardStack.create('山札');
      stack.location.name = 'table';
      stack.location.x = 100;
      stack.location.y = 200;
      created.push(stack);
      for (let i = 0; i < count; i++) {
        const card = Card.create(`札${i}`, 'front.png', 'back.png');
        created.push(card);
        stack.putOnBottom(card);
      }
      return stack;
    }

    it('draws as many as it is asked for, staggered beside the stack, and what is left where it asks for more', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const stack = deckOf(3);

      const drawn = service.drawCards(stack, 2);
      expect(drawn.map((card) => [card.location.name, card.location.x, card.location.y])).toEqual([
        ['table', 200, 225],
        ['table', 218, 233],
      ]);
      expect(service.drawCards(stack, 5)).toHaveLength(1);
      expect(stack.cards).toHaveLength(0);
      expect(service.drawCard(stack)).toBeNull();
    });

    it('draws a card picked out of the stack to where one drawn off the top lands', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const stack = deckOf(3);
      stack.posZ = 40;
      const picked = stack.cards[1];

      expect(service.drawCard(stack, 0, picked)).toBe(picked);
      expect([picked.location.name, picked.location.x, picked.location.y, picked.posZ]).toEqual([
        'table',
        200,
        225,
        40,
      ]);
      expect(stack.cards).not.toContain(picked);
    });

    it('draws the top card into this seat’s hand, and none while it has no user id', () => {
      const stack = deckOf(2);
      const top = stack.topCard!;

      expect(service.drawToHand(stack)).toBe(top);
      expect(top.isInMyHand).toBe(true);

      PeerCursor.myCursor.userId = '';
      vi.spyOn(Network, 'peerContext', 'get').mockReturnValue({ userId: '' } as IPeerContext);
      expect(service.drawToHand(stack)).toBeNull();
      expect(stack.cards).toHaveLength(1);
    });

    it('scatters a stack broken up where it lay and takes the stack away', () => {
      const stack = deckOf(3);
      const cards = [...stack.cards];

      const loose = service.breakUp(stack);

      expect(loose).toEqual([...cards].reverse());
      expect(loose.every((card) => card.isLoose && card.location.name === 'table')).toBe(true);
      expect(ObjectStore.instance.get(stack.identifier)).toBeFalsy();
    });

    it('splits a stack into a pile for each participant, each counted once, and none for a seat alone', () => {
      const stack = deckOf(4);
      expect(service.splitSeats()).toBe(1);
      expect(service.split(stack)).toEqual([]);
      expect(stack.cards).toHaveLength(4);

      peer('again', 'さいど');
      const secondTab = new PeerCursor();
      secondTab.userId = 'again';
      secondTab.peerId = 'peer-again-2';
      secondTab.role = PeerRole.Player;
      secondTab.initialize();
      created.push(secondTab);
      linked.push(secondTab.peerId);
      peer('guest', 'けんがく', PeerRole.Guest);
      expect(service.splitSeats()).toBe(2);
      const piles = service.split(stack);
      created.push(...piles);

      expect(piles.map((pile) => pile.cards.length)).toEqual([2, 2]);
      expect(ObjectStore.instance.get(stack.identifier)).toBeFalsy();
    });

    it('puts the cards in the new piles before taking away the stack, which takes all it still holds', () => {
      peer('other', 'あいて');
      const internals = Network.instance as unknown as { connection: unknown; sendQueue(): void };
      const send = vi.fn();
      const stack = deckOf(4);
      const cards = [...stack.cards];
      internals.connection = { send };
      try {
        for (let i = 0; i < 5; i++) internals.sendQueue();
        send.mockClear();

        created.push(...service.split(stack));
        for (let i = 0; i < 5; i++) internals.sendQueue();

        const events = send.mock.calls.flatMap(
          (call) => call[0] as { eventName: string; data: { identifier?: string } }[]
        );
        const firstDelete = events.findIndex((event) => event.eventName === 'DELETE_GAME_OBJECT');
        const cardMoves = events.flatMap((event, index) =>
          cards.some((card) => card.identifier === event.data.identifier) ? [index] : []
        );
        expect(firstDelete).toBeGreaterThan(-1);
        expect(firstDelete).toBeGreaterThan(Math.max(...cardMoves));
      } finally {
        internals.connection = null;
      }
    });
  });

  describe('discardPairs()', () => {
    it('lays a matching pair face up on the discard pile', () => {
      const spade = trumpCard('s07');
      const heart = trumpCard('h07');
      const odd = trumpCard('c03');
      for (const card of [spade, heart, odd]) card.toHand('me');

      const pairs = service.discardPairs(service.handCardsOf('me'));

      expect(pairs).toHaveLength(1);
      const discard = ObjectStore.instance.getObjects<CardStack>(CardStack).find((stack) => stack.name === '捨て札');
      expect(discard?.cards).toHaveLength(2);
      expect(spade.isFront).toBe(true);
      expect(service.handCardsOf('me')).toEqual([odd]);
      if (discard) created.push(discard);
    });

    it('does nothing without a pair', () => {
      const card = trumpCard('s07');
      card.toHand('me');

      expect(service.discardPairs(service.handCardsOf('me'))).toEqual([]);
      expect(sendSystemNotice).not.toHaveBeenCalled();
    });
  });
});
