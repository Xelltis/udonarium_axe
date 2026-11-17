import { handRulerPressesOn, RulerHands } from '@axe/features/tabletop/ruler/ruler-input';

/** A ruler that says what was asked of it. */
function hands(inHand = true): RulerHands & { calls: string[]; drawingNow: boolean } {
  const ruler = {
    calls: [] as string[],
    drawingNow: false,
    inHand: () => inHand,
    drawing: () => ruler.drawingNow,
    startAt: (x: number, y: number, free: boolean) => {
      ruler.calls.push(`start ${x},${y}${free ? ' free' : ''}`);
      ruler.drawingNow = true;
    },
    reachTo: (x: number, y: number) => ruler.calls.push(`reach ${x},${y}`),
    letGo: () => {
      ruler.calls.push('letGo');
      ruler.drawingNow = false;
    },
    liftEnd: (steps: number) => ruler.calls.push(`lift ${steps}`),
    putAway: () => ruler.calls.push('putAway'),
  };
  return ruler;
}

function pointer(type: string, x: number, y: number, more: PointerEventInit = {}): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    pointerId: 1,
    ...more,
  });
  Object.defineProperties(event, { pageX: { value: x }, pageY: { value: y } });
  return event;
}

describe('handRulerPressesOn', () => {
  let root: HTMLElement;
  let piece: HTMLElement;
  let stop: () => void;

  beforeEach(() => {
    root = document.createElement('div');
    piece = document.createElement('div');
    root.appendChild(piece);
    document.body.appendChild(root);
    root.setPointerCapture = () => undefined;
    root.hasPointerCapture = () => true;
    root.releasePointerCapture = () => undefined;
  });

  afterEach(() => {
    stop?.();
    root.remove();
  });

  it('lays the ruler from a press to where it is let go, and keeps the press from the pieces', () => {
    const ruler = hands();
    stop = handRulerPressesOn(root, ruler);
    const pressed = vi.fn();
    piece.addEventListener('pointerdown', pressed);
    piece.addEventListener('mousedown', pressed);

    piece.dispatchEvent(pointer('pointerdown', 10, 20));
    piece.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    piece.dispatchEvent(pointer('pointermove', 30, 40));
    piece.dispatchEvent(pointer('pointerup', 50, 60, { altKey: true }));

    expect(pressed).not.toHaveBeenCalled();
    expect(ruler.calls).toEqual(['start 10,20', 'reach 30,40', 'reach 50,60', 'letGo']);
  });

  it('lays the ruler freely with Alt held, and lifts the far end with the wheel while drawing it out', () => {
    const ruler = hands();
    stop = handRulerPressesOn(root, ruler);

    piece.dispatchEvent(pointer('pointerdown', 10, 20, { altKey: true }));
    piece.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 }));
    piece.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 }));

    expect(ruler.calls).toEqual(['start 10,20 free', 'lift 1', 'lift -1']);
  });

  it('lays a ruler drawn out from a piece at the next press', () => {
    const ruler = hands();
    ruler.drawingNow = true;
    stop = handRulerPressesOn(root, ruler);

    piece.dispatchEvent(pointer('pointermove', 30, 40, { buttons: 0 }));
    piece.dispatchEvent(pointer('pointerdown', 30, 40));

    expect(ruler.calls).toEqual(['reach 30,40', 'letGo']);
  });

  it('leaves the presses and the wheel alone while the ruler is put away', () => {
    const ruler = hands(false);
    stop = handRulerPressesOn(root, ruler);
    const pressed = vi.fn();
    piece.addEventListener('pointerdown', pressed);

    piece.dispatchEvent(pointer('pointerdown', 10, 20));
    const wheel = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -100 });
    piece.dispatchEvent(wheel);

    expect(pressed).toHaveBeenCalled();
    expect(wheel.defaultPrevented).toBe(false);
    expect(ruler.calls).toEqual([]);
  });

  it('lets a control over the table be pressed, and puts the ruler away on Escape', () => {
    const ruler = hands();
    stop = handRulerPressesOn(root, ruler);
    const button = document.createElement('button');
    root.appendChild(button);
    const clicked = vi.fn();
    button.addEventListener('click', clicked);

    button.dispatchEvent(pointer('pointerdown', 1, 1));
    button.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(clicked).toHaveBeenCalled();
    expect(ruler.calls).toEqual(['putAway']);
  });
});
