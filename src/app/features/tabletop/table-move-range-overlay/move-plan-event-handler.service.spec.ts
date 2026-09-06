import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { MovePlan, MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MovePlanEventHandlerService } from '@axe/features/tabletop/table-move-range-overlay/move-plan-event-handler.service';

describe('MovePlanEventHandlerService', () => {
  const held = signal<MovePlan | null>(null);
  const movePlan = {
    plan: held.asReadonly(),
    isPlanning: computed(() => held() !== null),
    lookAt: vi.fn(),
    wholeWay: vi.fn<() => number[]>(() => [1, 2]),
    settle: vi.fn(),
    run: vi.fn(),
    cancel: vi.fn(),
  };
  const coordinate = {
    tabletopOriginElement: document.body,
    calcTabletopLocalCoordinate: vi.fn(() => ({ x: 120, y: 340, z: 0 })),
  };

  function openAMove(): void {
    held.set({ characterIdentifier: 'piece' } as MovePlan);
    TestBed.tick();
  }

  /** A press of the reader's own, after the one that opened the move has finished. */
  function pressTheTable(): void {
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  /** The press that opened the move, finishing over the piece. */
  function finishTheOpeningPress(): void {
    document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    clickTheTable();
  }

  function clickTheTable(modifiers: MouseEventInit = {}): void {
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }));
  }

  beforeEach(() => {
    held.set(null);
    for (const spy of [movePlan.lookAt, movePlan.settle, movePlan.run, movePlan.cancel]) spy.mockClear();
    movePlan.wholeWay.mockReturnValue([1, 2]);
    TestBed.configureTestingModule({
      providers: [
        { provide: MovePlanService, useValue: movePlan },
        { provide: CoordinateService, useValue: coordinate },
      ],
    });
    TestBed.inject(MovePlanEventHandlerService);
    TestBed.tick();
  });

  it('listens for nothing until a move is being worked out', () => {
    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });

  it('draws the way to wherever the pointer is over the table', () => {
    openAMove();

    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).toHaveBeenCalledWith(120, 340);
  });

  it('passes over the press that opened the move as it finishes', () => {
    openAMove();

    finishTheOpeningPress();

    expect(movePlan.run).not.toHaveBeenCalled();
    expect(movePlan.cancel).not.toHaveBeenCalled();
  });

  it('walks the way on a click of its own', () => {
    openAMove();
    pressTheTable();

    clickTheTable();

    expect(movePlan.run).toHaveBeenCalled();
    expect(movePlan.settle).not.toHaveBeenCalled();
  });

  it('settles a leg where the click is still holding shift', () => {
    openAMove();
    pressTheTable();

    clickTheTable({ shiftKey: true });

    expect(movePlan.settle).toHaveBeenCalled();
    expect(movePlan.run).not.toHaveBeenCalled();
  });

  it('puts the move away on a tap that would walk it nowhere', () => {
    openAMove();
    pressTheTable();
    movePlan.wholeWay.mockReturnValue([1]);

    clickTheTable();

    expect(movePlan.cancel).toHaveBeenCalled();
    expect(movePlan.run).not.toHaveBeenCalled();
  });

  it('settles a leg on a press held down, and keeps the menu shut', () => {
    openAMove();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    document.body.dispatchEvent(event);

    expect(movePlan.settle).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the menu alone once the move is over', () => {
    openAMove();
    held.set(null);
    TestBed.tick();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    document.body.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('calls the move off on escape', () => {
    openAMove();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(movePlan.cancel).toHaveBeenCalled();
  });

  it('walks the way on enter', () => {
    openAMove();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(movePlan.run).toHaveBeenCalled();
  });

  it('lets go of the table once the move is over', () => {
    openAMove();
    pressTheTable();
    held.set(null);
    TestBed.tick();

    clickTheTable();
    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.run).not.toHaveBeenCalled();
    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });
});
