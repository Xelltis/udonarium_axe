import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InventoryRoundService } from '@axe/features/inventory/inventory-round.service';
import {
  InventoryRoundViewComponent,
  turnPieceDensity,
} from '@axe/features/inventory/inventory-round-view/inventory-round-view.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** A piece of a round, as the view reads one. */
function piece(identifier: string) {
  return { identifier, name: identifier, imageFile: { url: '' } };
}

describe('InventoryRoundViewComponent', () => {
  const order = signal<ReturnType<typeof piece>[]>([]);
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
            sides: signal([]),
            companions: signal(new Map()),
            currentSide: signal(''),
            mayHoldCurrent: signal(false),
            giveTurnTo: () => undefined,
          },
        },
      ],
    });
    vi.spyOn(TestBed.inject(RolePermissionService), 'canEditTabletop').mockReturnValue(false);
  });

  afterEach(() => vi.restoreAllMocks());

  function render(count: number, current = ''): HTMLElement {
    order.set(Array.from({ length: count }, (_, index) => piece(`p${index}`)));
    progress.update((value) => ({ ...value, currentIdentifier: current }));
    const fixture = TestBed.createComponent(InventoryRoundViewComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('lays a few pieces one to a row, and more smaller and two or three to a row', () => {
    expect(turnPieceDensity(6)).toBe('roomy');
    expect(turnPieceDensity(7)).toBe('pair');
    expect(turnPieceDensity(16)).toBe('pair');
    expect(turnPieceDensity(17)).toBe('trio');

    expect(render(4).querySelector('[data-testid="turn-pieces"]')!.getAttribute('data-density')).toBe('roomy');
    const many = render(20);
    expect(many.querySelector('[data-testid="turn-pieces"]')!.getAttribute('data-density')).toBe('trio');
    expect(many.querySelector('[data-testid="turn-pieces"] .grid-cols-3')).not.toBeNull();
    expect(many.querySelectorAll('[data-turn-piece]')).toHaveLength(20);
  });

  it('stands no higher than the screen leaves room for, scrolling within', () => {
    const list = render(30).querySelector<HTMLElement>('[data-testid="turn-pieces"]')!;

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
