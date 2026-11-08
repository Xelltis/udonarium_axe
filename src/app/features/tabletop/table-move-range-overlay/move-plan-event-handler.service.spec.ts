import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MovePlan } from '@axe/application/tabletop/move-plan.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { MovePlanEventHandlerService } from '@axe/features/tabletop/table-move-range-overlay/move-plan-event-handler.service';

describe('MovePlanEventHandlerService', () => {
  const held = signal<MovePlan | null>(null);
  const opened = signal(0);
  const movePlan = {
    plan: held.asReadonly(),
    isPlanning: computed(() => held() !== null),
    openings: opened.asReadonly(),
    lookAt: vi.fn(),
    hasWay: vi.fn<() => boolean>(() => true),
    pointsAtNowhere: vi.fn<() => boolean>(() => false),
    settle: vi.fn(),
    run: vi.fn(),
    cancel: vi.fn(),
    toggleJump: vi.fn(),
  };
  const tablePick = {
    landingAt: vi.fn(() => ({ x: 120, y: 340, z: 0 })),
    faceAt: vi.fn<() => string | null>(() => 'floor'),
  };
  /** The layer of the page the table is drawn in, which a press has to be in to be on the table. */
  let layer: HTMLElement;

  function openAMove(piece = 'piece'): void {
    opened.update((count) => count + 1);
    held.set({ characterIdentifier: piece } as MovePlan);
    TestBed.tick();
  }

  /** A press of the reader's own, after the one that opened the move has finished. */
  function pressTheTable(): void {
    layer.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  /** The press that opened the move, finishing over the piece. */
  function finishTheOpeningPress(): void {
    layer.dispatchEvent(new Event('pointerup', { bubbles: true }));
    clickTheTable();
  }

  function clickTheTable(modifiers: MouseEventInit = {}): void {
    layer.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...modifiers }));
  }

  beforeEach(() => {
    layer = document.createElement('div');
    layer.id = 'app-table-layer';
    document.body.appendChild(layer);
    tablePick.faceAt.mockReturnValue('floor');
    held.set(null);
    opened.set(0);
    for (const spy of [movePlan.lookAt, movePlan.settle, movePlan.run, movePlan.cancel]) spy.mockClear();
    movePlan.hasWay.mockReturnValue(true);
    movePlan.pointsAtNowhere.mockReturnValue(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: MovePlannerService, useValue: movePlan },
        { provide: TablePickService, useValue: tablePick },
      ],
    });
    TestBed.inject(MovePlanEventHandlerService);
    TestBed.tick();
  });

  afterEach(() => layer.remove());

  it('listens for nothing until a move is being worked out', () => {
    layer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });

  it('draws the way to wherever the pointer is over the table', () => {
    openAMove();

    layer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).toHaveBeenCalledWith(120, 340);
  });

  it('passes over the press that opened the move as it finishes', () => {
    openAMove();

    finishTheOpeningPress();

    expect(movePlan.run).not.toHaveBeenCalled();
    expect(movePlan.cancel).not.toHaveBeenCalled();
  });

  it('passes over the press that opens a second move while the first is still open', () => {
    openAMove();
    // The press that takes up another piece, which opens a move of its own and then finishes.
    pressTheTable();
    openAMove('another piece');

    clickTheTable();

    expect(movePlan.cancel).not.toHaveBeenCalled();
    expect(movePlan.run).not.toHaveBeenCalled();
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
    movePlan.hasWay.mockReturnValue(false);

    clickTheTable();

    expect(movePlan.cancel).toHaveBeenCalled();
    expect(movePlan.run).not.toHaveBeenCalled();
  });

  it('neither walks nor puts the move away on a tap on a square with nowhere to stand', () => {
    openAMove();
    pressTheTable();
    movePlan.hasWay.mockReturnValue(false);
    movePlan.pointsAtNowhere.mockReturnValue(true);

    clickTheTable();

    expect(movePlan.cancel).not.toHaveBeenCalled();
    expect(movePlan.run).not.toHaveBeenCalled();
  });

  it('settles a leg on a press held down, and keeps the menu shut', () => {
    openAMove();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    layer.dispatchEvent(event);

    expect(movePlan.settle).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the menu alone once the move is over', () => {
    openAMove();
    held.set(null);
    TestBed.tick();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    layer.dispatchEvent(event);

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

  it('turns the move over to jumping on space, and keeps the room from scrolling', () => {
    openAMove();
    const event = new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true });

    document.dispatchEvent(event);

    expect(movePlan.toggleJump).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves space alone while somebody is typing', () => {
    openAMove();
    movePlan.toggleJump.mockClear();
    const field = document.createElement('input');
    document.body.appendChild(field);
    field.focus();

    field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }));

    expect(movePlan.toggleJump).not.toHaveBeenCalled();
    field.remove();
  });

  it('lets go of the table once the move is over', () => {
    openAMove();
    pressTheTable();
    held.set(null);
    TestBed.tick();

    clickTheTable();
    layer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.run).not.toHaveBeenCalled();
    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });

  it('takes no notice of the pointer where the line of sight through it lands on no face of the table', () => {
    openAMove();
    tablePick.faceAt.mockReturnValue(null);

    layer.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });

  it('takes no notice of the pointer outside the table’s layer', () => {
    openAMove();

    document.body.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));

    expect(movePlan.lookAt).not.toHaveBeenCalled();
  });
});
