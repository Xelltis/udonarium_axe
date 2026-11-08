import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { HudAnchor } from '@axe/application/tabletop/hud-frame.service';
import { PieceMotionsService } from '@axe/application/tabletop/piece-motions.service';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { Network } from '@axe/core/network/network';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { markLoadedWithheld } from '@axe/domain/peer/withheld-table';
import { CardGameService } from '@axe/features/card/card-game.service';
import { CardStackComponent } from '@axe/features/card/card-stack/card-stack.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';

describe('CardStackComponent', () => {
  let component: CardStackComponent;
  let fixture: ComponentFixture<CardStackComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CardStackComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CardStackComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('dealing the whole stack out', () => {
    const dealOut = (cardStack: CardStack) => {
      fixture.componentRef.setInput('cardStack', cardStack);
      return (component as unknown as { dealAll(): Promise<void> }).dealAll();
    };

    afterEach(() => vi.restoreAllMocks());

    it('asks first when some cards are face down to this seat on a room server, and deals nothing if declined', async () => {
      vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      const deal = vi.spyOn(TestBed.inject(CardGameService), 'dealAll');
      const deck = CardStack.create('山札');
      const card = Card.create('ジョーカー', 'front.png', 'back.png');
      card.imageDataElement!.removeChild(card.imageDataElement!.getFirstElementByName('front')!);
      deck.putOnBottom(card);

      await dealOut(deck);

      expect(ask).toHaveBeenCalledTimes(1);
      expect(deal).not.toHaveBeenCalled();
      deck.destroy();
    });

    it('points a player to the GM, who holds every face, but not the GM, nor anyone off the room server', async () => {
      const t = TestBed.inject(TRANSLATE_FN);
      const authority = vi.spyOn(Network, 'authorityPeerId', 'get').mockReturnValue('@authority');
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(false);
      const gameMaster = vi.spyOn(PeerCursor, 'isMyselfGameMaster', 'get').mockReturnValue(false);
      const deck = CardStack.create('山札');
      const card = Card.create('ジョーカー', 'front.png', 'back.png');
      card.imageDataElement!.removeChild(card.imageDataElement!.getFirstElementByName('front')!);
      deck.putOnBottom(card);
      const askGm = t('feature.cardStack.message.dealWithheldAskGm');

      await dealOut(deck);
      gameMaster.mockReturnValue(true);
      await dealOut(deck);
      gameMaster.mockReturnValue(false);
      authority.mockReturnValue(null);
      markLoadedWithheld(true, false);
      try {
        await dealOut(deck);
      } finally {
        markLoadedWithheld(false, false);
      }

      expect(ask.mock.calls.map(([question]) => String(question).includes(askGm))).toEqual([true, false, false]);
      deck.destroy();
    });

    it('deals without asking when every face is here', async () => {
      const ask = vi.spyOn(TestBed.inject(ConfirmService), 'ask');
      const deal = vi.spyOn(TestBed.inject(CardGameService), 'dealAll').mockReturnValue({ dealt: 1, participants: 1 });
      const deck = CardStack.create('山札');
      deck.putOnBottom(Card.create('A', 'front.png', 'back.png'));

      await dealOut(deck);

      expect(ask).not.toHaveBeenCalled();
      expect(deal).toHaveBeenCalledTimes(1);
      deck.destroy();
    });
  });

  it('brings the stack to the top on a press, for a seat that may change the table alone', () => {
    const cardStack = CardStack.create('山札');
    fixture.componentRef.setInput('cardStack', cardStack);
    const canEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    const topmost = vi.spyOn(cardStack, 'toTopmost');

    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).not.toHaveBeenCalled();

    canEdit.mockReturnValue(true);
    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).toHaveBeenCalledTimes(1);
    cardStack.destroy();
  });

  it('splits a deck, putting its cards in the new piles before taking away the deck, which takes all it still holds', () => {
    const internals = Network.instance as unknown as { connection: unknown; sendQueue(): void };
    const send = vi.fn();
    const deck = CardStack.create('山札');
    const cards = [0, 1, 2, 3].map((i) => Card.create(`札${i}`, 'front.png', 'back.png'));
    for (const card of cards) deck.putOnBottom(card);
    const before = new Set(ObjectStore.instance.getObjects(CardStack));
    fixture.componentRef.setInput('cardStack', deck);
    internals.connection = { send };
    try {
      for (let i = 0; i < 5; i++) internals.sendQueue();
      send.mockClear();

      (component as unknown as { splitStack(split: number): void }).splitStack(2);
      for (let i = 0; i < 5; i++) internals.sendQueue();

      const events = send.mock.calls.flatMap(
        (call) => call[0] as { eventName: string; data: { identifier?: string } }[]
      );
      const firstDelete = events.findIndex((event) => event.eventName === 'DELETE_GAME_OBJECT');
      const cardMoves = events.flatMap((event, index) =>
        cards.some((card) => card.identifier === event.data.identifier) ? [index] : []
      );
      const lastCardMove = Math.max(...cardMoves);
      expect(firstDelete).toBeGreaterThan(-1);
      expect(firstDelete).toBeGreaterThan(lastCardMove);
    } finally {
      internals.connection = null;
      for (const pile of ObjectStore.instance.getObjects(CardStack)) if (!before.has(pile)) pile.destroy();
    }
  });

  describe('signal-driven CD', () => {
    it('reads the name through the network version', () => {
      const cardStack = CardStack.create('テストスタック');
      fixture.componentRef.setInput('cardStack', cardStack);
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const original = objectChangeService.networkVersion;
      const spy = vi.fn(() => original());
      Object.defineProperty(objectChangeService, 'networkVersion', { value: spy, configurable: true });
      void component.name();
      expect(spy).toHaveBeenCalled();
    });

    it('names who is looking through the stack, without it being moved', async () => {
      // The stack is somebody else's, so nothing else drawn on it moves with the claim and the
      // label is the only answer to the question. Nothing is checked by hand either: it has to
      // follow because the signals said so.
      const holder = new PeerCursor();
      holder.userId = 'holder';
      holder.name = '持ち主';
      holder.initialize();
      const cardStack = CardStack.create('テストスタック');
      fixture.componentRef.setInput('cardStack', cardStack);
      fixture.detectChanges();
      const label = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(label()).not.toContain('持ち主');

      cardStack.owner = holder.userId;
      TestBed.inject(ObjectChangeService).notifyChanged(cardStack.identifier);
      await fixture.whenStable();

      expect(label()).toContain('持ち主');

      cardStack.owner = '';
      TestBed.inject(ObjectChangeService).notifyChanged(cardStack.identifier);
      await fixture.whenStable();

      expect(label()).not.toContain('持ち主');
      holder.destroy();
      cardStack.destroy();
    });

    it('reads who is looking through it from the signals rather than off the stack', () => {
      const holder = new PeerCursor();
      holder.userId = 'holder';
      holder.name = '持ち主';
      holder.initialize();
      const cardStack = CardStack.create('テストスタック');
      cardStack.owner = holder.userId;
      fixture.componentRef.setInput('cardStack', cardStack);
      const objectChange = TestBed.inject(ObjectChangeService);
      const versionOf = objectChange.versionOf.bind(objectChange);
      const read: string[] = [];
      Object.defineProperty(objectChange, 'versionOf', {
        value: (identifier: string) => {
          read.push(identifier);
          return versionOf(identifier);
        },
        configurable: true,
      });
      const readsTheStack = (value: () => unknown): boolean => {
        read.length = 0;
        value();
        return read.includes(cardStack.identifier);
      };

      expect(readsTheStack(() => component.hasOwner())).toBe(true);
      expect(readsTheStack(() => component.ownerName())).toBe(true);
      expect(read).toContain(holder.identifier);

      holder.destroy();
      cardStack.destroy();
    });

    it('marks a stack as locked, without it being moved', async () => {
      // The lock mark is the only thing on a stack that moves when it is locked, so it is the
      // whole answer to the question. Nothing is checked by hand: it has to follow because the
      // signals said so.
      const cardStack = CardStack.create('テストスタック');
      fixture.componentRef.setInput('cardStack', cardStack);
      fixture.detectChanges();
      const locks = () =>
        [...(fixture.nativeElement as HTMLElement).querySelectorAll('i')].filter((i) => i.textContent === 'lock')
          .length;
      expect(locks()).toBe(0);

      cardStack.isLock = true;
      TestBed.inject(ObjectChangeService).notifyChanged(cardStack.identifier);
      await fixture.whenStable();

      expect(locks()).toBe(1);

      cardStack.isLock = false;
      TestBed.inject(ObjectChangeService).notifyChanged(cardStack.identifier);
      await fixture.whenStable();

      expect(locks()).toBe(0);
      cardStack.destroy();
    });

    it('holds the hidden icon in a signal', () => {
      expect(typeof component.isIconHidden).toBe('function');
      expect(component.isIconHidden()).toBe(false);
    });

    it('asks for no change detector', () => {
      // No change detector is needed, since nothing is marked by hand.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((component as any).changeDetector).toBeUndefined();
    });
  });

  it('is pointed at by its plate laid on the stack, its handles at the corners of the plate, and not round it', () => {
    const cardStack = CardStack.create('テストスタック');
    fixture.componentRef.setInput('cardStack', cardStack);
    fixture.detectChanges();
    const placed = fixture.debugElement.queryAll(By.directive(HudPlaceDirective)).map((found) => ({
      element: found.nativeElement as HTMLElement,
      anchor: found.injector.get(HudPlaceDirective).anchor() as HudAnchor,
    }));

    const root = (fixture.nativeElement as HTMLElement).querySelector('[data-hud-box]')!;
    expect(root.classList).toContain('pointer-events-none');
    const plate = placed.find(({ element }) => element.matches('[data-part="plate"]'))!;
    expect(plate.anchor).toEqual({ owner: cardStack.identifier, part: 'plate', place: 'cover' });
    expect(plate.element.classList).toContain('pointer-events-auto');
    const handles = placed.filter(({ element }) => element.matches('.rotate-grab'));
    expect(handles.map(({ anchor }) => [anchor.part, anchor.corner])).toEqual([
      ['plate', 0],
      ['plate', 1],
      ['plate', 2],
      ['plate', 3],
    ]);
    cardStack.destroy();
  });

  describe('timer cleanup on destroy', () => {
    it('clears the double-tap timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { doubleClickTimer: ReturnType<typeof setTimeout> | null };
      priv.doubleClickTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('clears the icon timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { iconHiddenTimer: ReturnType<typeof setTimeout> | null };
      priv.iconHiddenTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('what the stack covers', () => {
    afterEach(() => vi.restoreAllMocks());

    function movable(): MovableDirective {
      return fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
    }

    it('moves as wide as its top card and as deep as the plate round its top card’s picture runs', () => {
      vi.spyOn(TestBed.inject(PictureSizeService), 'sizeOf').mockReturnValue({ width: 200, height: 300 });
      const deck = CardStack.create('山札');
      deck.putOnBottom(Card.create('A', 'front.png', 'back.png', 2));
      fixture.componentRef.setInput('cardStack', deck);
      fixture.detectChanges();
      TestBed.tick();

      try {
        expect(movable().footprintNow()).toEqual({ width: 100, height: 90 * 1.5 + 10 });
      } finally {
        deck.destroy();
      }
    });

    it('moves an empty stack as its bare plate', () => {
      const deck = CardStack.create('山札');
      fixture.componentRef.setInput('cardStack', deck);
      fixture.detectChanges();
      TestBed.tick();

      try {
        expect(movable().footprintNow()).toEqual({ width: 100, height: 100 });
      } finally {
        deck.destroy();
      }
    });
  });

  it('shuffles its top card on the canvas when the stack is shuffled, and not for another stack', () => {
    const play = vi.spyOn(TestBed.inject(PieceMotionsService), 'play');
    const deck = CardStack.create('山札');
    const other = CardStack.create('別の山札');
    fixture.componentRef.setInput('cardStack', deck);
    fixture.detectChanges();

    const shuffled = (identifier: string) =>
      (
        TestBed.inject(ObjectChangeService) as unknown as {
          _shuffleCardStack$: { emit(event: { identifier: string }): void };
        }
      )._shuffleCardStack$.emit({ identifier });

    try {
      shuffled(other.identifier);
      expect(play).not.toHaveBeenCalled();
      shuffled(deck.identifier);
      expect(play).toHaveBeenCalledWith(deck.identifier, 'shuffle', { parts: ['top'] });
    } finally {
      vi.restoreAllMocks();
      deck.destroy();
      other.destroy();
    }
  });

  describe('drawing several', () => {
    it('draws as many as it is asked for and staggers them', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const cardStack = CardStack.create('draw-stack');
      cardStack.location.name = 'table';
      cardStack.location.x = 100;
      cardStack.location.y = 200;
      cardStack.putOnBottom(Card.create('c1', '', '', 2));
      cardStack.putOnBottom(Card.create('c2', '', '', 2));
      cardStack.putOnBottom(Card.create('c3', '', '', 2));
      fixture.componentRef.setInput('cardStack', cardStack);

      try {
        const drawn = (component as unknown as { drawCards(count: number): Card[] }).drawCards(3);

        expect(drawn).toHaveLength(3);
        expect(cardStack.cards).toHaveLength(0);
        expect(drawn.map((card) => card.location.name)).toEqual(['table', 'table', 'table']);
        expect(drawn.map((card) => card.location.x)).toEqual([200, 218, 236]);
        expect(drawn.map((card) => card.location.y)).toEqual([225, 233, 241]);
      } finally {
        cardStack.destroy();
        vi.restoreAllMocks();
      }
    });

    it('draws what is left when it is asked for more', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      const cardStack = CardStack.create('draw-stack-limit');
      cardStack.putOnBottom(Card.create('c1', '', '', 2));
      cardStack.putOnBottom(Card.create('c2', '', '', 2));
      fixture.componentRef.setInput('cardStack', cardStack);

      try {
        const drawn = (component as unknown as { drawCards(count: number): Card[] }).drawCards(5);

        expect(drawn).toHaveLength(2);
        expect(cardStack.cards).toHaveLength(0);
      } finally {
        cardStack.destroy();
        vi.restoreAllMocks();
      }
    });
  });
});
