import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { PictureSizeService } from '@axe/application/storage/picture-size.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { HudAnchor } from '@axe/application/tabletop/hud-frame.service';
import { ImageFile } from '@axe/core/storage/image-file';
import { ImageStorage } from '@axe/core/storage/image-storage';
import { Card, CardState } from '@axe/domain/card/card';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { CardComponent } from '@axe/features/card/card/card.component';
import { beMyself } from '@axe/testing/peer-context-stub';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { MovableDirective } from '@axe/ui/directives/movable.directive';
import { HudPlaceDirective } from '@axe/ui/tabletop/hud-place.directive';

describe('CardComponent', () => {
  let component: CardComponent;
  let given: { destroy(): void };
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
    // Given its piece at once, as a template gives it, so that no drawing of the page made before a
    // test gives its own reads the required input unset.
    given = Card.create('テストカード', 'front', 'back');
    fixture.componentRef.setInput('card', given);
  });

  afterEach(() => given.destroy());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('brings the card to the top on a press, for a seat that may change the table alone', () => {
    const card = Card.create('テストカード', 'front', 'back');
    fixture.componentRef.setInput('card', card);
    const canEdit = vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
    const topmost = vi.spyOn(card, 'toTopmost');

    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).not.toHaveBeenCalled();

    canEdit.mockReturnValue(true);
    component.onInputStart(new MouseEvent('mousedown'));
    expect(topmost).toHaveBeenCalledTimes(1);
    card.destroy();
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
  });

  it('moves as wide as its size and as deep as the picture the canvas draws it with runs', () => {
    vi.spyOn(TestBed.inject(PictureSizeService), 'sizeOf').mockReturnValue({ width: 200, height: 300 });
    const card = Card.create('テストカード', 'front', 'back');
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    TestBed.tick();

    const movable = fixture.debugElement.query(By.directive(MovableDirective)).injector.get(MovableDirective);
    const width = card.size * 50;
    expect(movable.footprintNow()).toEqual({ width, height: width * 1.5 });
    card.destroy();
  });

  it('is pointed at by its face laid on the card, its handles at the corners of the face, and not round it', () => {
    const card = Card.create('テストカード', 'front', 'back');
    fixture.componentRef.setInput('card', card);
    fixture.detectChanges();
    const placed = fixture.debugElement.queryAll(By.directive(HudPlaceDirective)).map((found) => ({
      element: found.nativeElement as HTMLElement,
      anchor: found.injector.get(HudPlaceDirective).anchor() as HudAnchor,
    }));

    const root = (fixture.nativeElement as HTMLElement).querySelector('[data-hud-box]')!;
    expect(root.classList).toContain('pointer-events-none');
    const face = placed.find(({ element }) => element.matches('[data-part="face"]'))!;
    expect(face.anchor).toEqual({ owner: card.identifier, part: 'face', place: 'cover' });
    expect(face.element.classList).toContain('pointer-events-auto');
    const handles = placed.filter(({ element }) => element.matches('.rotate-grab'));
    expect(handles.map(({ anchor }) => [anchor.part, anchor.corner])).toEqual([
      ['face', 0],
      ['face', 1],
      ['face', 2],
      ['face', 3],
    ]);
    card.destroy();
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
