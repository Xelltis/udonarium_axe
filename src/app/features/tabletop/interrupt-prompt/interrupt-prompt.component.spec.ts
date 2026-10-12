import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RolePermissionService } from '@axe/application/permission/role-permission.service';
import { InterruptOffer, MoveInterruptService, WaitingMove } from '@axe/application/tabletop/move-interrupt.service';
import { InterruptPromptComponent } from '@axe/features/tabletop/interrupt-prompt/interrupt-prompt.component';
import { TableInterruptOverlayComponent } from '@axe/features/tabletop/interrupt-prompt/table-interrupt-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('the interrupt band and overlay', () => {
  const waiting = signal<WaitingMove | null>(null);
  const offer = signal<InterruptOffer | null>(null);
  const choice = computed(() =>
    offer()?.pieces.length
      ? {
          pieces: ['foe'],
          spans: [{ from: 20, to: 80 }],
          along: 20,
          point: { x: 20, y: 0 },
        }
      : null
  );
  const interrupts = {
    waiting: waiting.asReadonly(),
    offer: offer.asReadonly(),
    choice,
    togglePiece: vi.fn(),
    setAlong: vi.fn(),
    answer: vi.fn(),
    pass: vi.fn(),
    decideNow: vi.fn(),
    dropInterrupts: vi.fn(),
  };
  let isGameMaster = false;

  beforeEach(() => {
    waiting.set(null);
    offer.set(null);
    isGameMaster = false;
    Object.values(interrupts).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
    });
    TestBed.configureTestingModule({
      imports: [InterruptPromptComponent, TableInterruptOverlayComponent],
      providers: [
        ...TEST_PROVIDERS,
        { provide: MoveInterruptService, useValue: interrupts },
        {
          provide: RolePermissionService,
          useValue: {
            get isGameMaster() {
              return isGameMaster;
            },
          },
        },
      ],
    });
  });

  async function band(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(InterruptPromptComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows nothing while no move waits', async () => {
    expect((await band()).querySelector('[data-testid="interrupt-prompt"]')).toBeNull();
  });

  it('tells the mover how long it waits, and offers a game master the two rulings', async () => {
    waiting.set({ id: 'move', deadline: Date.now() + 9000, waitingFor: 1 });
    isGameMaster = true;
    const host = await band();

    expect(host.querySelector('[data-testid="interrupt-waiting"]')!.textContent).toContain('9');
    (host.querySelector('[data-testid="interrupt-drop"]') as HTMLButtonElement).click();
    expect(interrupts.dropInterrupts).toHaveBeenCalled();
  });

  it('lets the reader pick a piece, step in or let the move by', async () => {
    offer.set({
      id: 'move',
      moverName: '味方',
      path: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      pieces: [{ id: 'foe', name: '敵', spans: [{ from: 20, to: 80 }] }],
    });
    const host = await band();

    (host.querySelector('[data-testid="interrupt-piece"]') as HTMLButtonElement).click();
    (host.querySelector('[data-testid="interrupt-step"]') as HTMLButtonElement).click();
    (host.querySelector('[data-testid="interrupt-pass"]') as HTMLButtonElement).click();

    expect(interrupts.togglePiece).toHaveBeenCalledWith('foe');
    expect(interrupts.answer).toHaveBeenCalled();
    expect(interrupts.pass).toHaveBeenCalled();
    expect(host.querySelector('[data-testid="interrupt-decide-now"]')).toBeNull();
  });

  it('offers the mover its own pieces to step in with while it waits, as a game master moving both sides', async () => {
    waiting.set({ id: 'move', deadline: Date.now() + 9000, waitingFor: 1 });
    offer.set({
      id: 'move',
      moverName: '味方',
      path: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      pieces: [{ id: 'foe', name: '敵', spans: [{ from: 20, to: 80 }] }],
    });
    const host = await band();

    expect(host.querySelector('[data-testid="interrupt-waiting"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="interrupt-piece"]')!.textContent).toContain('敵');
  });

  it('lights the stretch the chosen pieces reach, and marks the point', async () => {
    offer.set({
      id: 'move',
      moverName: '味方',
      path: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      pieces: [{ id: 'foe', name: '敵', spans: [{ from: 20, to: 80 }] }],
    });
    const fixture = TestBed.createComponent(TableInterruptOverlayComponent);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('[data-testid="interrupt-lit"]')!.getAttribute('points')).toBe('20,0 80,0');
    expect(host.querySelector('[data-testid="interrupt-point"]')!.getAttribute('cx')).toBe('20');
  });
});
