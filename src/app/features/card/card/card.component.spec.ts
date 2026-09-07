import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { Card, CardState } from '@axe/domain/card/card';
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
