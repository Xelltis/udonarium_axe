import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { InventoryRoundViewComponent } from '@axe/features/inventory/inventory-round-view/inventory-round-view.component';
import { DOCK_FACE } from '@axe/features/inventory/inventory-round-view/round-dock';
import { InventoryViewPreferenceService } from '@axe/features/inventory/inventory-view-preference.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A piece of a round, as the view reads one. */
function piece(identifier: string) {
  return { identifier, name: `name-${identifier}`, imageFile: { url: '' } };
}

const pieces = (count: number, prefix = 'p') => Array.from({ length: count }, (_, index) => piece(`${prefix}${index}`));

/** How tall the screen is in these tests. */
const SCREEN = 600;
const MOUSE: PointerEventInit = { pointerType: 'mouse' };
const TOUCH: PointerEventInit = { pointerType: 'touch' };

describe('InventoryRoundViewComponent', () => {
  const order = signal<ReturnType<typeof piece>[]>([]);
  const sides = signal<{ side: string; name: string; color: string; members: ReturnType<typeof piece>[] }[]>([]);
  const currentSide = signal('');
  const nextIdentifier = signal('');
  const given: string[] = [];
  const progress = signal({
    round: 1,
    phase: 'turns',
    currentIdentifier: '',
    acted: new Set<string>(),
    held: new Set<string>(),
    canUndo: false,
    buffDecay: false,
  });
  let canEdit = true;
  let innerHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    localStorage.removeItem('ui-inventory-round-across');
    localStorage.removeItem('ui-inventory-round-length');
    innerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: SCREEN });
    canEdit = true;
    TestBed.configureTestingModule({
      imports: [InventoryRoundViewComponent],
      providers: [
        ...TEST_PROVIDERS,
        {
          provide: InventoryRoundService,
          useValue: {
            order,
            progress,
            sides,
            companions: signal(new Map()),
            currentSide,
            nextIdentifier,
            mayHoldCurrent: signal(false),
            giveTurnTo: (identifier: string) => given.push(identifier),
          },
        },
      ],
    });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockImplementation(() => canEdit);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (innerHeight) Object.defineProperty(window, 'innerHeight', innerHeight);
    sides.set([]);
    currentSide.set('');
    nextIdentifier.set('');
    given.length = 0;
    localStorage.removeItem('ui-inventory-round-across');
    localStorage.removeItem('ui-inventory-round-length');
    for (const box of document.body.querySelectorAll('[data-testid="turn-peek"]')) box.remove();
  });

  function render(count: number, current = '', acted: string[] = []) {
    order.set(pieces(count));
    progress.update((value) => ({ ...value, currentIdentifier: current, acted: new Set(acted) }));
    const fixture = TestBed.createComponent(InventoryRoundViewComponent);
    settle(fixture);
    return view(fixture);
  }

  function settle(fixture: ComponentFixture<InventoryRoundViewComponent>): void {
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
  }

  function view(fixture: ComponentFixture<InventoryRoundViewComponent>) {
    const root = fixture.nativeElement as HTMLElement;
    const strip = () => root.querySelector<HTMLElement>('[data-testid="turn-pieces"]')!;
    const face = (identifier: string) => root.querySelector<HTMLElement>(`[data-turn-piece="${identifier}"]`)!;
    /** A point on the middle of the part of a face that shows, along the turn order laid down. */
    const on = (identifier: string) => parseFloat(face(identifier).style.top) + 2;
    const peek = () => document.body.querySelector<HTMLElement>('[data-testid="turn-peek"]')!;
    const press = (type: string, clientY: number, init: PointerEventInit = {}) => {
      strip().dispatchEvent(
        new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: 0, clientY, ...init })
      );
      fixture.detectChanges();
    };
    return { fixture, root, strip, face, on, peek, press };
  }

  it('names the presses that move the round on by what they do, not by their icons', () => {
    const { root } = render(3);
    const names = [...root.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'));

    expect(names).toEqual(expect.arrayContaining(['1つ前に戻す', '次へ', 'ラウンドを戻す', 'ラウンドを進める']));
    expect(names.some((name) => name?.includes('keyboard_arrow'))).toBe(false);
  });

  it('lays every piece of a round of a few apart at their full size', () => {
    const { root, face } = render(5, 'p1');

    expect(root.querySelectorAll('[data-turn-piece]')).toHaveLength(5);
    expect(face('p4').style.width).toBe(`${DOCK_FACE}px`);
    expect(parseFloat(face('p1').style.top)).toBe(DOCK_FACE + 10);
  });

  it('lays every piece of a round of many on it, standing no longer than the screen leaves room for', () => {
    nextIdentifier.set('p11');
    const { root, strip, face } = render(40, 'p10');

    expect(root.querySelectorAll('[data-turn-piece]')).toHaveLength(40);
    expect(parseFloat(strip().style.height)).toBeLessThanOrEqual(SCREEN - 12);
    expect(face('p10').style.width).toBe(`${DOCK_FACE}px`);
    expect(face('p11').hasAttribute('data-next')).toBe(true);
    expect(parseFloat(face('p0').style.width)).toBeLessThan(DOCK_FACE);
  });

  it('reads the room the screen leaves once the first pieces join a round it was shrunk to while empty', () => {
    const { fixture, strip } = render(0);
    expect(fixture.nativeElement.querySelector('[data-testid="turn-pieces"]')).toBeNull();

    order.set(pieces(40));
    settle(fixture);
    settle(fixture);

    expect(parseFloat(strip().style.height)).toBeLessThanOrEqual(SCREEN - 12);
  });

  it('hands the turn to the face a click lands on, wherever on the turn order it lies', () => {
    const { on, press } = render(40, 'p10');

    press('pointerdown', on('p37'), MOUSE);
    press('pointerup', on('p37'), MOUSE);

    expect(given).toEqual(['p37']);
  });

  it('hands the turn to the face a click is slid along to, and to none where it is drawn off', () => {
    const { on, press } = render(40, 'p10');

    press('pointerdown', on('p3'), MOUSE);
    press('pointermove', on('p20'), MOUSE);
    press('pointerup', on('p20'), MOUSE);
    expect(given).toEqual(['p20']);

    press('pointerdown', on('p3'), MOUSE);
    press('pointermove', on('p5'), { ...MOUSE, clientX: 300 });
    press('pointerup', on('p5'), { ...MOUSE, clientX: 300 });
    expect(given).toEqual(['p20']);
  });

  it('hands no turn to the piece whose turn it is already', () => {
    const { on, press } = render(20, 'p5');

    press('pointerdown', on('p5'), MOUSE);
    press('pointerup', on('p5'), MOUSE);

    expect(given).toEqual([]);
  });

  describe('on a touch screen', () => {
    const give = () => document.body.querySelector<HTMLButtonElement>('[data-testid="turn-peek-give"]');

    it('only draws out the face a first touch is lifted from, and hands it the turn from the press beside it', () => {
      const { fixture, on, press, peek } = render(40, 'p10');

      press('pointerdown', on('p3'), TOUCH);
      press('pointermove', on('p37'), TOUCH);
      press('pointerup', on('p37'), TOUCH);

      expect(given).toEqual([]);
      expect(peek().hidden).toBe(false);
      expect(peek().textContent).toContain('name-p37');
      give()!.click();
      fixture.detectChanges();

      expect(given).toEqual(['p37']);
      expect(peek().hidden).toBe(true);
    });

    it('hands the turn to a face touched again, and only draws out another touched instead', () => {
      const { on, press, peek } = render(40, 'p10');

      press('pointerdown', on('p20'), TOUCH);
      press('pointerup', on('p20'), TOUCH);
      press('pointerdown', on('p30'), TOUCH);
      press('pointerup', on('p30'), TOUCH);
      expect(given).toEqual([]);
      expect(peek().textContent).toContain('name-p30');

      press('pointerdown', on('p30'), TOUCH);
      press('pointerup', on('p30'), TOUCH);
      expect(given).toEqual(['p30']);
    });

    it('puts the face it drew out away at a touch elsewhere', () => {
      const { fixture, on, press, peek } = render(40, 'p10');

      press('pointerdown', on('p20'), TOUCH);
      press('pointerup', on('p20'), TOUCH);
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, ...TOUCH }));
      fixture.detectChanges();

      expect(peek().hidden).toBe(true);
      expect(give()).toBeNull();
    });
  });

  it('draws out the face a pointer is over beside it, with its name and how it stands', () => {
    const { on, press, peek } = render(20, 'p5', ['p0', 'p1']);

    expect(peek().hidden).toBe(true);
    press('pointermove', on('p1'), { pointerType: 'mouse' });

    expect(peek().hidden).toBe(false);
    expect(peek().textContent).toContain('name-p1');
    expect(peek().textContent).toContain('行動済み');
    expect(peek().parentElement).toBe(document.body);

    press('pointerleave', on('p1'), { pointerType: 'mouse' });
    expect(peek().hidden).toBe(true);
  });

  it('moves along the faces with the arrow keys, drawing out each, and hands the turn with Enter', () => {
    const { fixture, face, strip, peek } = render(20, 'p5');

    expect(face('p5').getAttribute('tabindex')).toBe('0');
    face('p5').focus();
    strip().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();

    expect(document.activeElement).toBe(face('p6'));
    expect(peek().textContent).toContain('name-p6');
    face('p6').click();
    expect(given).toEqual(['p6']);
  });

  it('lets a seat that is only watching see the faces drawn out, but hand no turn', () => {
    canEdit = false;
    const { on, press, peek } = render(20, 'p5');

    press('pointerdown', on('p9'), MOUSE);
    expect(peek().textContent).toContain('name-p9');
    press('pointerup', on('p9'), MOUSE);

    expect(given).toEqual([]);
  });

  it('draws the faces of those who have acted grey, and says how long the turn order runs to a screen reader', () => {
    const { root, face } = render(5, 'p2', ['p0']);

    expect(face('p0').querySelector('span')!.classList.contains('grayscale')).toBe(true);
    expect(face('p1').querySelector('span')!.classList.contains('grayscale')).toBe(false);
    const grip = root.querySelector<HTMLElement>('[data-testid="turn-length"]')!;
    expect(Number(grip.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
    expect(grip.getAttribute('aria-valuemin')).toBe('160');
    expect(grip.getAttribute('aria-label')).toContain('Home');
    expect(grip.classList.contains('touch-none')).toBe(true);
  });

  it('lays the turn order across once the reader turns it', () => {
    const { fixture, strip, face } = render(5, 'p1');

    TestBed.inject(InventoryViewPreferenceService).setRoundAcross(true);
    settle(fixture);

    expect(strip().getAttribute('data-across')).toBe('true');
    const icons = [...fixture.nativeElement.querySelectorAll('button i.material-icons')].map((icon) =>
      (icon as HTMLElement).textContent?.trim()
    );
    expect(icons).toEqual(expect.arrayContaining(['keyboard_arrow_left', 'keyboard_arrow_right']));
    expect(icons).not.toContain('keyboard_arrow_down');
    expect(parseFloat(face('p3').style.left)).toBeGreaterThan(parseFloat(face('p2').style.left));
    expect(strip().style.width).not.toBe('');
  });

  it('draws a face out under itself near the screen’s edge, held to the edge whole rather than squeezed', () => {
    const innerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 260 });
    try {
      const { fixture, strip, face, peek } = render(5, 'p1');
      TestBed.inject(InventoryViewPreferenceService).setRoundAcross(true);
      settle(fixture);
      const at = parseFloat(face('p4').style.left) + 2;

      strip().dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: at, clientY: 28 })
      );
      fixture.detectChanges();

      expect(peek().textContent).toContain('name-p4');
      expect(peek().style.left).toBe('252px');
      expect(peek().style.transform).toBe('translateX(-100%)');
      expect(peek().classList.contains('w-max')).toBe(true);
    } finally {
      if (innerWidth) Object.defineProperty(window, 'innerWidth', innerWidth);
    }
  });

  it('stands as long as its end is dragged to, and as long as there is room again on a double click', () => {
    const { fixture, root, strip } = render(40, 'p10');
    const end = root.querySelector<HTMLElement>('[data-testid="turn-length"]')!;
    const drag = (type: string, clientY: number) =>
      end.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 2, button: 0, clientY }));

    drag('pointerdown', 500);
    drag('pointermove', 350);
    drag('pointerup', 350);
    settle(fixture);

    expect(TestBed.inject(InventoryViewPreferenceService).roundLength().down).toBe(350);
    expect(parseFloat(strip().style.height)).toBeLessThanOrEqual(350);

    end.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    settle(fixture);
    expect(TestBed.inject(InventoryViewPreferenceService).roundLength().down).toBeNull();
    expect(parseFloat(strip().style.height)).toBeGreaterThan(350);
  });

  it('lays the pieces under the headings of their sides', () => {
    sides.set([
      { side: 'friends', name: '味方', color: '', members: pieces(3, 'f') },
      { side: 'foes', name: '敵', color: '', members: pieces(4, 'e') },
    ]);
    currentSide.set('foes');
    const { root } = render(0, 'e0');

    expect(root.textContent).toContain('味方');
    expect(root.textContent).toContain('敵');
    expect(root.querySelectorAll('[data-turn-piece]')).toHaveLength(7);
  });
});
