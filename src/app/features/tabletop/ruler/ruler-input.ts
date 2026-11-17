/** What laying a ruler with the pointer needs of the ruler. */
export interface RulerHands {
  inHand(): boolean;
  drawing(): boolean;
  startAt(pageX: number, pageY: number, free: boolean): void;
  reachTo(pageX: number, pageY: number, free: boolean): void;
  letGo(): void;
  liftEnd(steps: number): void;
  putAway(): void;
}

/** What on the screen over the table is pressed for itself even with the ruler in hand. */
const CONTROLS = 'button, a, input, select, textarea, [contenteditable], [data-hud-control]';

/** The presses the ruler takes for itself while it is in hand, so that nothing on the table is picked up by them. */
const SWALLOWED = ['mousedown', 'touchstart', 'click', 'dblclick'] as const;

/**
 * Lays the ruler with the pointer on the table while it is in hand, until the function answered is
 * called.
 *
 * A press on the table starts drawing the ruler out from where it lands, the pointer drawn about
 * carries its far end, and letting go leaves it laid. A ruler drawn out from a piece, its far end
 * following the pointer with nothing pressed, is laid by the next press. Alt lays an end freely, off
 * the middle of the squares, and the wheel lifts and lowers the far end while it is drawn out. Escape
 * puts the ruler away. Nothing pressed on the table while the ruler is in hand reaches the pieces, so
 * none is picked up or moved by laying it; the controls over the table are pressed as ever.
 */
export function handRulerPressesOn(root: HTMLElement, ruler: RulerHands): () => void {
  const isControl = (event: Event) => event.target instanceof Element && event.target.closest(CONTROLS) !== null;
  const swallow = (event: Event) => {
    event.stopPropagation();
    if (event.cancelable) event.preventDefault();
  };

  const onDown = (event: PointerEvent) => {
    if (!ruler.inHand() || isControl(event)) return;
    if (event.button !== 0) return;
    swallow(event);
    if (ruler.drawing()) {
      ruler.letGo();
      return;
    }
    root.setPointerCapture?.(event.pointerId);
    ruler.startAt(event.pageX, event.pageY, event.altKey);
  };
  const onMove = (event: PointerEvent) => {
    if (!ruler.inHand() || !ruler.drawing()) return;
    swallow(event);
    ruler.reachTo(event.pageX, event.pageY, event.altKey);
  };
  const onUp = (event: PointerEvent) => {
    if (!ruler.inHand() || !ruler.drawing() || isControl(event)) return;
    if (!root.hasPointerCapture?.(event.pointerId)) return;
    swallow(event);
    root.releasePointerCapture?.(event.pointerId);
    ruler.reachTo(event.pageX, event.pageY, event.altKey);
    ruler.letGo();
  };
  const onWheel = (event: WheelEvent) => {
    if (!ruler.inHand() || !ruler.drawing() || event.deltaY === 0) return;
    swallow(event);
    ruler.liftEnd(event.deltaY < 0 ? 1 : -1);
  };
  const onSwallowed = (event: Event) => {
    if (ruler.inHand() && !isControl(event)) swallow(event);
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !ruler.inHand()) return;
    event.preventDefault();
    ruler.putAway();
  };

  root.addEventListener('pointerdown', onDown, { capture: true });
  root.addEventListener('pointermove', onMove, { capture: true });
  root.addEventListener('pointerup', onUp, { capture: true });
  root.addEventListener('wheel', onWheel, { capture: true, passive: false });
  for (const type of SWALLOWED) root.addEventListener(type, onSwallowed, { capture: true, passive: false });
  const document = root.ownerDocument;
  document.addEventListener('keydown', onKey);
  return () => {
    root.removeEventListener('pointerdown', onDown, { capture: true });
    root.removeEventListener('pointermove', onMove, { capture: true });
    root.removeEventListener('pointerup', onUp, { capture: true });
    root.removeEventListener('wheel', onWheel, { capture: true });
    for (const type of SWALLOWED) root.removeEventListener(type, onSwallowed, { capture: true });
    document.removeEventListener('keydown', onKey);
  };
}
