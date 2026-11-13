import {
  ADOPT_TOUCH_EVENT,
  type AdoptedTouch,
  TableTouchGesture,
  TableTouchGestureEvent,
} from '@axe/features/tabletop/game-table/table-touch-gesture';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableTouchGesture', () => {
  let table: HTMLElement;
  let gesture: TableTouchGesture;
  let moves: TableTouchGestureEvent[];

  beforeEach(() => {
    table = document.createElement('div');
    document.body.append(table);
    gesture = new TableTouchGesture(table);
    moves = [];
    gesture.ontransform = (_x, _y, _z, _rx, _ry, _rz, event) => moves.push(event);
  });

  afterEach(() => {
    gesture.destroy();
    table.remove();
  });

  const finger = (type: string, pointerId: number, x: number, y = 100) =>
    table.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerId, pointerType: 'touch', clientX: x, clientY: y })
    );

  it('takes in a finger handed over where it stands, so a second one coming down pinches with it', () => {
    const detail: AdoptedTouch = { pointerId: 1, clientX: 100, clientY: 100 };
    table.dispatchEvent(new CustomEvent(ADOPT_TOUCH_EVENT, { bubbles: true, detail }));
    finger('pointerdown', 2, 200);

    finger('pointermove', 2, 300);

    expect(moves).toContain(TableTouchGestureEvent.PINCH);
  });

  it('makes no tap of a finger handed over and lifted where it stood', () => {
    const tap = vi.fn();
    gesture.ontap = tap;
    const detail: AdoptedTouch = { pointerId: 1, clientX: 100, clientY: 100 };
    table.dispatchEvent(new CustomEvent(ADOPT_TOUCH_EVENT, { bubbles: true, detail }));

    finger('pointerup', 1, 100);

    expect(tap).not.toHaveBeenCalled();
  });
});
