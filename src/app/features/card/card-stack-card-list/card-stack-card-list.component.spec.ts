import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalService } from '@axe/application/ui/modal.service';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { CardStackCardListComponent } from '@axe/features/card/card-stack-card-list/card-stack-card-list.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardStackCardListComponent', () => {
  let component: CardStackCardListComponent;
  let fixture: ComponentFixture<CardStackCardListComponent>;
  let stack: CardStack;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CardStackCardListComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    stack = CardStack.create('テスト山札');
    stack.putOnBottom(Card.create('A', './assets/images/trump/s01.webp', './assets/images/trump/z02.webp'));
    stack.putOnBottom(Card.create('B', './assets/images/trump/h13.webp', './assets/images/trump/z02.webp'));

    fixture = TestBed.createComponent(CardStackCardListComponent);
    fixture.componentRef.setInput('cardStack', stack);
    component = fixture.componentInstance;
  });

  it('should be created and render the card rows', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
    expect(component.cards().length).toBe(2);
  });

  it('draws the text over a card front in the deck detail', () => {
    stack.cards[0].faceText = '山札内の文章';

    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('card-face-preview')).toBeTruthy();
  });

  it('returns the name of the card', () => {
    expect(component.cardName(stack.cards[0])).toBe('A');
  });

  it('puts what was typed onto it', () => {
    const event = { target: { value: 'ハートのエース' } } as unknown as Event;
    component.setCardName(stack.cards[0], event);
    expect(stack.cards[0].name).toBe('ハートのエース');
  });

  it('turns a playing-card code into something readable', () => {
    expect(component.cardImageHint(stack.cards[0])).toBe('♠1');
    expect(component.cardImageHint(stack.cards[1])).toBe('♥King');
  });

  it('falls back to the file name for anything else', () => {
    stack.putOnBottom(Card.create('custom', './assets/images/custom/dragon.png', ''));
    const customCard = stack.cards[stack.cards.length - 1];
    expect(component.cardImageHint(customCard)).toBe('dragon');
  });

  it('does not fall over without a front image', () => {
    const naked = Card.create('c', '', '');
    expect(() => component.cardImageHint(naked)).not.toThrow();
  });

  it('takes the card out of the deck', () => {
    const target = stack.cards[0];
    component.drawCard(target);
    expect(stack.cards.includes(target)).toBe(false);
  });

  describe('drag & drop reorder (pointer events)', () => {
    let ownElementsFromPoint: PropertyDescriptor | undefined;

    beforeEach(() => {
      ownElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
    });

    // The page outlives this file: a stand-in left on it answers every spec that runs after this
    // one in the same worker.
    afterEach(() => {
      if (ownElementsFromPoint) Object.defineProperty(document, 'elementsFromPoint', ownElementsFromPoint);
      else delete (document as { elementsFromPoint?: unknown }).elementsFromPoint;
    });

    const captureTarget = (): Element =>
      ({
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      }) as unknown as Element;

    const startDrag = (card: Card, pointerId = 1): Element => {
      const target = captureTarget();
      component.onPointerDown(
        {
          pointerType: 'mouse',
          button: 0,
          pointerId,
          preventDefault: vi.fn(),
          currentTarget: target,
        } as unknown as PointerEvent,
        card
      );
      return target;
    };

    const hoverOver = (overCard: Card, where: 'top' | 'bottom', pointerId = 1): void => {
      const rect = { top: 100, bottom: 200, height: 100, left: 0, right: 200, width: 200, x: 0, y: 100 } as DOMRect;
      const clientY = where === 'top' ? rect.top + 10 : rect.top + rect.height - 10;
      const row = document.createElement('div');
      row.setAttribute('data-card-id', overCard.identifier);
      vi.spyOn(row, 'getBoundingClientRect').mockReturnValue(rect);
      (document as Document & { elementsFromPoint: (x: number, y: number) => Element[] }).elementsFromPoint = () => [
        row,
      ];
      component.onPointerMove({ pointerType: 'mouse', pointerId, clientX: 50, clientY } as unknown as PointerEvent);
    };

    const release = (target: Element, pointerId = 1): void => {
      component.onPointerUp({ pointerType: 'mouse', pointerId, currentTarget: target } as unknown as PointerEvent);
    };

    it('starts no drag from the right button', () => {
      const target = captureTarget();
      component.onPointerDown(
        {
          pointerType: 'mouse',
          button: 2,
          pointerId: 1,
          preventDefault: vi.fn(),
          currentTarget: target,
        } as unknown as PointerEvent,
        stack.cards[0]
      );
      expect(component.cardDrag.held()).toBeNull();
    });

    it('takes hold of the card and captures the pointer', () => {
      const target = startDrag(stack.cards[0]);
      expect(component.cardDrag.held()).toBe(stack.cards[0].identifier);
      expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    });

    it('marks the side the card would land on and no other', () => {
      const [a, b] = stack.cards;
      component.cardDrag.begin(a.identifier);

      component.cardDrag.hoverHalf(b.identifier, { top: 0, height: 40 }, 10);
      expect(component.isDropBefore(b)).toBe(true);
      expect(component.isDropAfter(b)).toBe(false);

      component.cardDrag.hoverHalf(b.identifier, { top: 0, height: 40 }, 30);
      expect(component.isDropBefore(b)).toBe(false);
      expect(component.isDropAfter(b)).toBe(true);
    });

    it('puts a card dropped on the top half in front of the target', () => {
      const [first, second] = stack.cards;
      const target = startDrag(second);
      hoverOver(first, 'top');
      release(target);
      expect(stack.cards[0]).toBe(second);
      expect(stack.cards[1]).toBe(first);
    });

    it('puts one dropped on the bottom half behind it', () => {
      stack.putOnBottom(Card.create('C', '', ''));
      const [first, , third] = stack.cards;
      const target = startDrag(first);
      hoverOver(third, 'bottom');
      release(target);
      expect(stack.cards[stack.cards.length - 1]).toBe(first);
    });

    it('changes nothing when a card is dropped onto itself', () => {
      const original = stack.cards.map((c) => c.identifier);
      const card = stack.cards[0];
      const target = startDrag(card);
      hoverOver(card, 'top');
      release(target);
      expect(stack.cards.map((c) => c.identifier)).toEqual(original);
    });

    it('lets go on a cancelled pointer', () => {
      const target = startDrag(stack.cards[0]);
      component.cardDrag.hoverHalf('x', { top: 0, height: 40 }, 30);
      component.onPointerCancel({
        pointerType: 'mouse',
        pointerId: 1,
        currentTarget: target,
      } as unknown as PointerEvent);
      expect(component.cardDrag.held()).toBeNull();
      expect(component.cardDrag.over()).toBeNull();
      expect(component.isDropAfter({ identifier: 'x' } as Card)).toBe(false);
    });
  });

  describe('setImage', () => {
    it('puts the chosen picture on the front', async () => {
      const modal = TestBed.inject(ModalService);
      vi.spyOn(modal, 'open').mockResolvedValue('img-front-123');
      const card = stack.cards[0];
      component.setImage(card, 'front');
      await Promise.resolve();
      const el = card.imageDataElement?.getFirstElementByName('front');
      expect(el?.value).toBe('img-front-123');
    });

    it('puts it on the back', async () => {
      const modal = TestBed.inject(ModalService);
      vi.spyOn(modal, 'open').mockResolvedValue('img-back-456');
      const card = stack.cards[0];
      component.setImage(card, 'back');
      await Promise.resolve();
      const el = card.imageDataElement?.getFirstElementByName('back');
      expect(el?.value).toBe('img-back-456');
    });

    it('changes nothing when the chooser is dismissed', async () => {
      const modal = TestBed.inject(ModalService);
      vi.spyOn(modal, 'open').mockResolvedValue(null as unknown as string);
      const card = stack.cards[0];
      const before = card.imageDataElement?.getFirstElementByName('front')?.value;
      component.setImage(card, 'front');
      await Promise.resolve();
      expect(card.imageDataElement?.getFirstElementByName('front')?.value).toBe(before);
    });
  });
});
