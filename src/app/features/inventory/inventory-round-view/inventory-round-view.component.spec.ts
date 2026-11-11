import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import { InventoryRoundViewComponent } from '@axe/features/inventory/inventory-round-view/inventory-round-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A piece of a round, as the view reads one. */
function piece(identifier: string) {
  return { identifier, name: identifier, imageFile: { url: '' } };
}

describe('InventoryRoundViewComponent', () => {
  const order = signal<ReturnType<typeof piece>[]>([]);
  const sides = signal<
    {
      side: string;
      name: string;
      color: string;
      members: ReturnType<typeof piece>[];
    }[]
  >([]);
  const currentSide = signal('');
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

  beforeEach(() => {
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
            mayHoldCurrent: signal(false),
            giveTurnTo: (identifier: string) => given.push(identifier),
          },
        },
      ],
    });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sides.set([]);
    currentSide.set('');
    given.length = 0;
  });

  const pieces = (count: number, prefix = 'p') =>
    Array.from({ length: count }, (_, index) => piece(`${prefix}${index}`));

  function render(count: number, current = '', acted: string[] = []) {
    order.set(pieces(count));
    progress.update((value) => ({
      ...value,
      currentIdentifier: current,
      acted: new Set(acted),
    }));
    const fixture = TestBed.createComponent(InventoryRoundViewComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const laid = () =>
      [...root.querySelectorAll('[data-turn-piece]')].map((one) => one.getAttribute('data-turn-piece'));
    const gathered = (what: string) =>
      root.querySelector<HTMLButtonElement>(`[data-testid="turn-gathered"][data-gathered="${what}"]`);
    return { fixture, root, laid, gathered };
  }

  it('lays every piece of a round of a few at full size', () => {
    const { root, laid } = render(8, 'p2', ['p0', 'p1']);

    expect(laid()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(root.querySelector('[data-testid="turn-gathered"]')).toBeNull();
    expect(root.querySelectorAll('[data-turn-piece] .size-12')).toHaveLength(8);
  });

  it('gathers the pieces done and those far off of a round of many, laying the one up and the next few', () => {
    const acted = pieces(8).map((one) => one.identifier);
    const { root, laid, gathered } = render(40, 'p8', acted);

    expect(laid()).toEqual(['p8', 'p9', 'p10', 'p11', 'p12']);
    expect(gathered('acted')!.getAttribute('aria-label')).toContain('済み 8');
    expect(gathered('acted')!.textContent!.trim()).toMatch(/8$/);
    expect(gathered('later')!.getAttribute('aria-label')).toContain('あと 27');
    expect(gathered('later')!.textContent).toContain('+27');
    expect(root.querySelector('[data-turn-piece="p8"] .size-12')).not.toBeNull();
    expect(root.querySelector('[data-turn-piece="p9"] .size-10')).not.toBeNull();
  });

  it('opens a gathered row in place to hand one of its pieces the turn, and gathers it up again', () => {
    const { fixture, root, laid, gathered } = render(12, 'p0');

    gathered('later')!.click();
    fixture.detectChanges();
    expect(laid()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11']);
    root.querySelector<HTMLButtonElement>('[data-turn-piece="p10"]')!.click();
    expect(given).toEqual(['p10']);

    root.querySelector<HTMLButtonElement>('[data-testid="turn-fold"]')!.click();
    fixture.detectChanges();
    expect(laid()).toEqual(['p0', 'p1', 'p2', 'p3', 'p4']);
  });

  it('gathers every side that is not up into one row, laying the side that is up', () => {
    sides.set([
      { side: 'friends', name: '味方', color: '', members: pieces(4, 'f') },
      { side: 'foes', name: '敵', color: '', members: pieces(10, 'e') },
    ]);
    currentSide.set('foes');
    order.set([...pieces(4, 'f'), ...pieces(10, 'e')]);
    progress.update((value) => ({
      ...value,
      currentIdentifier: 'e0',
      acted: new Set(['f0', 'f1', 'f2', 'f3']),
    }));
    const fixture = TestBed.createComponent(InventoryRoundViewComponent);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('[data-gathered="side"]')!.getAttribute('aria-label')).toContain('4体');
    expect([...root.querySelectorAll('[data-turn-piece]')].map((one) => one.getAttribute('data-turn-piece'))).toEqual([
      'e0',
      'e1',
      'e2',
      'e3',
      'e4',
    ]);
  });

  it('stands no higher than the screen leaves room for, scrolling within', () => {
    const list = render(30).root.querySelector<HTMLElement>('[data-testid="turn-pieces"]')!;

    expect(list.classList).toContain('overflow-y-auto');
    expect([...list.classList].some((name) => name.startsWith('max-h-'))).toBe(true);
  });

  it('brings the piece whose turn it is into view', () => {
    const scrolled: string[] = [];
    vi.spyOn(HTMLElement.prototype, 'scrollIntoView').mockImplementation(function (this: HTMLElement) {
      scrolled.push(this.getAttribute('data-turn-piece') ?? '');
    });

    render(30, 'p25');
    TestBed.tick();

    expect(scrolled).toContain('p25');
  });

  it('names the presses that move the round on by what they do, not by their icons', () => {
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(true);
    const fixture = TestBed.createComponent(InventoryRoundViewComponent);
    fixture.detectChanges();
    const names = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].map((button) =>
      button.getAttribute('aria-label')
    );

    expect(names).toEqual(expect.arrayContaining(['1つ前に戻す', '次へ', 'ラウンドを戻す', 'ラウンドを進める']));
    expect(names.some((name) => name?.includes('keyboard_arrow'))).toBe(false);
  });
});
