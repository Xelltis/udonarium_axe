import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Card, CardState } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CardComponent } from '@axe/features/card/card/card.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CardComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('signal-driven CD', () => {
    it('reads the name through the network version', () => {
      const card = Card.create('テストカード', 'front', 'back');
      fixture.componentRef.setInput('card', card);
      const objectChangeService = TestBed.inject(ObjectChangeService);
      const original = objectChangeService.networkVersion;
      const spy = vi.fn(() => original());
      Object.defineProperty(objectChangeService, 'networkVersion', { value: spy, configurable: true });
      void component.name();
      expect(spy).toHaveBeenCalled();
    });

    it('shows a picture that arrived after the card did, without the card being moved', () => {
      // A picture comes in two steps: the name of it with the card, the bytes when the room
      // has passed them along. Read off the card rather than through the signals, neither step
      // would move the view, and the card would stay blank for everybody else until it was dragged.
      // The name of the picture is already on the card, as it is for everybody the moment the
      // card reaches them. Only the bytes are still on their way, so nothing about the card
      // itself changes when they land - and that alone has to move the view.
      const card = Card.create('テストカード', 'picture-front', 'picture-back');
      fixture.componentRef.setInput('card', card);
      const objectChange = TestBed.inject(ObjectChangeService);
      const before = component.displayedImageUrl();

      ImageStorage.instance.add(
        ImageFile.create({
          identifier: 'picture-front',
          name: 'test-front',
          type: 'image/png',
          blob: null,
          url: './assets/images/test-front.png',
          thumbnail: { type: '', blob: null, url: '' },
        })
      );
      objectChange.fileVersion.update((version) => version + 1);

      expect(component.displayedImageUrl()).not.toBe(before);
      expect(component.displayedImageUrl()).toContain('test-front');
    });

    it('names the owner the moment a card is claimed, without it being moved', async () => {
      // The card is somebody else's, so nothing else drawn on it moves with the claim and the
      // label is the only answer to the question. Nothing is checked by hand either: it has to
      // follow because the signals said so.
      beMyself('onlooker');
      const holder = new PeerCursor();
      holder.userId = 'holder';
      holder.name = '持ち主';
      holder.initialize();
      const card = Card.create('テストカード', 'front', 'back');
      card.state = CardState.BACK;
      fixture.componentRef.setInput('card', card);
      fixture.detectChanges();
      const label = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(label()).not.toContain('持ち主');

      card.owner = holder.userId;
      TestBed.inject(ObjectChangeService).notifyChanged(card.identifier);
      await fixture.whenStable();

      expect(label()).toContain('持ち主');

      card.owner = '';
      TestBed.inject(ObjectChangeService).notifyChanged(card.identifier);
      await fixture.whenStable();

      expect(label()).not.toContain('持ち主');
      holder.destroy();
    });

    it('reads whose the card is through the signals rather than off the card', () => {
      const holder = new PeerCursor();
      holder.userId = 'holder';
      holder.name = '持ち主';
      holder.initialize();
      const card = Card.create('テストカード', 'front', 'back');
      card.owner = holder.userId;
      fixture.componentRef.setInput('card', card);
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
      const readsTheCard = (value: () => unknown): boolean => {
        read.length = 0;
        value();
        return read.includes(card.identifier);
      };

      expect(readsTheCard(() => component.hasOwner())).toBe(true);
      expect(readsTheCard(() => component.ownerName())).toBe(true);
      expect(read).toContain(holder.identifier);

      holder.destroy();
    });

    it('holds the hidden icon in a signal', () => {
      expect(typeof component.isIconHidden).toBe('function');
      expect(component.isIconHidden()).toBe(false);
    });

    it('aligns the private text plane to portrait front pixels inside a taller back image', () => {
      const me = beMyself();
      const card = Card.create('peek layout', 'front', 'back');
      card.state = CardState.BACK;
      card.owner = me.userId;
      fixture.componentRef.setInput('card', card);
      component.onImageLoad({ target: { naturalWidth: 100, naturalHeight: 150 } } as unknown as Event);
      component.onPeekImageLoad({ target: { naturalWidth: 100, naturalHeight: 120 } } as unknown as Event);

      expect(component.peekFaceRect()).toEqual({ left: 0, top: 15, width: 100, height: 120 });

      fixture.detectChanges();
      const peekFace = fixture.nativeElement.querySelector('.card-peek-face') as HTMLElement;
      expect(peekFace.querySelector('card-face-text')).toBeTruthy();
      expect(peekFace.style.transform).toBe('scale(0.9)');
    });

    it('accounts for horizontal letterboxing when the private front is taller than the back', () => {
      const card = Card.create('peek layout', 'front', 'back');
      fixture.componentRef.setInput('card', card);
      component.onImageLoad({ target: { naturalWidth: 100, naturalHeight: 100 } } as unknown as Event);
      component.onPeekImageLoad({ target: { naturalWidth: 100, naturalHeight: 200 } } as unknown as Event);

      expect(component.peekFaceRect()).toEqual({ left: 25, top: 0, width: 50, height: 100 });
    });

    it('keeps equal-aspect private images centered regardless of source resolution', () => {
      const card = Card.create('peek layout', 'front', 'back');
      fixture.componentRef.setInput('card', card);
      component.onImageLoad({ target: { naturalWidth: 400, naturalHeight: 600 } } as unknown as Event);

      component.onPeekImageLoad({ target: { naturalWidth: 200, naturalHeight: 300 } } as unknown as Event);
      const blankLayout = component.peekImageLayout();
      expect(component.peekSupersample()).toBe(2);
      expect(blankLayout).toEqual({ left: -50, top: -75, width: 200, height: 300 });

      component.onPeekImageLoad({ target: { naturalWidth: 400, naturalHeight: 600 } } as unknown as Event);
      const trumpLayout = component.peekImageLayout();
      expect(component.peekSupersample()).toBe(4);
      expect(trumpLayout).toEqual({ left: -150, top: -225, width: 400, height: 600 });

      expect(blankLayout.left + blankLayout.width / 2).toBe(50);
      expect(blankLayout.top + blankLayout.height / 2).toBe(75);
      expect(trumpLayout.left + trumpLayout.width / 2).toBe(50);
      expect(trumpLayout.top + trumpLayout.height / 2).toBe(75);

      const visualBounds = (layout: typeof blankLayout, factor: number) => {
        const width = (layout.width * 0.9) / factor;
        const height = (layout.height * 0.9) / factor;
        const centerX = layout.left + layout.width / 2;
        const centerY = layout.top + layout.height / 2;
        return { left: centerX - width / 2, top: centerY - height / 2, width, height };
      };
      expect(visualBounds(blankLayout, 2)).toEqual({ left: 5, top: 7.5, width: 90, height: 135 });
      expect(visualBounds(trumpLayout, 4)).toEqual({ left: 5, top: 7.5, width: 90, height: 135 });
    });
  });

  describe('timer cleanup on destroy', () => {
    it('clears the double-tap timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { doubleClickTimer: ReturnType<typeof setTimeout> };
      priv.doubleClickTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('clears the icon timer', () => {
      const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
      const priv = component as unknown as { iconHiddenTimer: ReturnType<typeof setTimeout> };
      priv.iconHiddenTimer = setTimeout(() => {}, 999_999);

      fixture.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
});
