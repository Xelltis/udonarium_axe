import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { Card } from '@axe/domain/card/card';
import { CardStack } from '@axe/domain/card/card-stack';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CardStackComponent } from '@axe/features/card/card-stack/card-stack.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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

  describe('signal-driven CD', () => {
    it('holds the animation state in a signal', () => {
      expect(typeof component.animeState).toBe('function');
      expect(component.animeState()).toBe('inactive');
    });

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

  describe('how a deck looks in three dimensions', () => {
    function makeStackWithCards(count: number): CardStack {
      const stack = CardStack.create(`stack-${count}`);
      for (let i = 0; i < count; i++) stack.putOnBottom(Card.create(`c${i}`, '', '', 2));
      return stack;
    }

    function readThickness(): number {
      return (component as unknown as { stackThicknessPx(): number }).stackThicknessPx();
    }

    function readLayers(): readonly { z: number; bg: string }[] {
      return (component as unknown as { stackLayers(): readonly { z: number; bg: string }[] }).stackLayers();
    }

    it('gives a single card no thickness and no layers', () => {
      const stack0 = makeStackWithCards(0);
      fixture.componentRef.setInput('cardStack', stack0);
      try {
        expect(readThickness()).toBe(0);
        expect(readLayers()).toEqual([]);
      } finally {
        stack0.destroy();
      }

      const stack1 = makeStackWithCards(1);
      fixture.componentRef.setInput('cardStack', stack1);
      try {
        expect(readThickness()).toBe(0);
        expect(readLayers()).toEqual([]);
      } finally {
        stack1.destroy();
      }
    });

    it('thickens with the cards up to a limit', () => {
      const stack10 = makeStackWithCards(10);
      fixture.componentRef.setInput('cardStack', stack10);
      try {
        expect(readThickness()).toBeCloseTo(10);
      } finally {
        stack10.destroy();
      }

      const stack200 = makeStackWithCards(200);
      fixture.componentRef.setInput('cardStack', stack200);
      try {
        expect(readThickness()).toBe(60);
      } finally {
        stack200.destroy();
      }
    });

    it('puts a layer between each pair of cards, up to a limit', () => {
      const stack5 = makeStackWithCards(5);
      fixture.componentRef.setInput('cardStack', stack5);
      try {
        expect(readLayers()).toHaveLength(4);
      } finally {
        stack5.destroy();
      }

      const stack200 = makeStackWithCards(200);
      fixture.componentRef.setInput('cardStack', stack200);
      try {
        expect(readLayers()).toHaveLength(30);
      } finally {
        stack200.destroy();
      }
    });

    it('alternates two contrasting colours and spaces the layers evenly through the thickness', () => {
      const stack = makeStackWithCards(10);
      fixture.componentRef.setInput('cardStack', stack);
      try {
        const layers = readLayers();
        const thickness = readThickness();
        expect(layers[0].bg).toBe('#f5efe2');
        expect(layers[1].bg).toBe('#2a1f0d');
        expect(layers[0].z).toBe(0);
        expect(layers[layers.length - 1].z).toBeCloseTo(thickness * ((layers.length - 1) / layers.length));
      } finally {
        stack.destroy();
      }
    });

    it('leaves out both in the flat mode', () => {
      const stack = makeStackWithCards(20);
      fixture.componentRef.setInput('cardStack', stack);
      const tabletop = TestBed.inject(TabletopService);
      const original = tabletop.mode2d;
      Object.defineProperty(tabletop, 'mode2d', { value: () => true, configurable: true });
      try {
        expect(readThickness()).toBe(0);
        expect(readLayers()).toEqual([]);
      } finally {
        Object.defineProperty(tabletop, 'mode2d', { value: original, configurable: true });
        stack.destroy();
      }
    });
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
