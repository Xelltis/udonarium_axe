import type { TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';

/** The screen of pieces laid over the canvas. */
const HUD = '[data-testid="table-hud"]';

/** What on the screen over the canvas is pressed for itself, wherever it lies. */
const CONTROLS = 'button, a, input, select, textarea, [contenteditable], .rotate-grab';

/**
 * The presses a block drawn on the canvas is handed, as the page would have handed them to it: a
 * click among them, as a door is opened and a switch pressed by one, and the pointer going down
 * before it, which tells a click from the end of a turn of the table.
 */
const HANDED_ON = ['pointerdown', 'mousedown', 'touchstart', 'click', 'contextmenu', 'dblclick'] as const;

/** What handing presses on needs of the table. */
export interface CanvasPressRoutes {
  /** The identifier of what a point of the page lands on first, or null. */
  pickAt(pageX: number, pageY: number): string | null;
  /** What the table knows of a piece: the element it listens for presses on, or how to open its menu. */
  entryOf(identifier: string): TabletopOverlapRegistryEntry | undefined;
  /**
   * Whether a press is aimed at the element it is sent to rather than at a point, as one a script
   * sends is: where not given, any press not made by the user.
   */
  aimedAtTarget?(event: Event): boolean;
}

/**
 * Hands a press on a block drawn on the canvas to that block, until the function answered is called.
 *
 * A block drawn on the canvas still has its element, hidden, which is where its drag, its menu and
 * the rest listen. A press there lands on the table itself, so it is caught on the way down,
 * picked against what the canvas draws, and handed to the block it lands on as the same press. A
 * block drawn together with others has no element and is handed only its right click, as its menu.
 * A press on something the page still draws itself, a piece or a white board, is its own.
 *
 * A press the block cancels is cancelled on its way down too, so the presses are listened for as
 * ones that may be.
 *
 * A piece laid over the canvas is a box on the screen round where it is drawn, and its box and the
 * boxes of its parts take in more than the piece: a press on one is picked too, and handed to what
 * it lands on, or to the table where it lands on nothing. A press on a label of the piece that lands
 * on something else drawn, as a name hanging over the piece behind, is handed to that; one that lands
 * on nothing is the piece's own, as is a press on a control of it and one a script sends to it, which
 * is aimed at it rather than at a point.
 */
export function handCanvasPressesOn(root: HTMLElement, routes: CanvasPressRoutes): () => void {
  const handed = new WeakSet<Event>();
  let pressedAt: { x: number; y: number } | null = null;
  const handOn = (event: Event) => {
    if (handed.has(event)) return;
    if (event.type === 'pointerdown') pressedAt = pointOf(event as MouseEvent);
    const target = event.target instanceof Element ? event.target : null;
    const aimed = routes.aimedAtTarget ? routes.aimedAtTarget(event) : !event.isTrusted;
    const onScreen = !aimed && target?.closest(HUD) ? target : null;
    const boxed = onScreen?.matches('[data-part], [data-hud-box]') ? onScreen : null;
    const label = !boxed && onScreen && !onScreen.closest(CONTROLS) ? onScreen : null;
    if (!boxed && !label && target?.closest('[data-object-id], white-board')) return;
    const point = samePress(pointOf(event as MouseEvent | TouchEvent), event.type, pressedAt);
    if (!point) return;
    const picked = routes.pickAt(point.x, point.y);
    const own = (boxed ?? label)?.closest('[data-object-id]')?.getAttribute('data-object-id');
    if ((boxed || label) && picked === own) return;
    if (label && !picked) return;
    const entry = picked ? routes.entryOf(picked) : undefined;
    if (!entry) {
      if (boxed) handTo(event, root);
      return;
    }
    if (!entry.element) {
      if (event.type !== 'contextmenu' || !entry.openMenu) return;
      event.stopPropagation();
      event.preventDefault();
      entry.openMenu();
      return;
    }
    handTo(event, entry.element);
  };
  const handTo = (event: Event, element: Element) => {
    event.stopPropagation();
    const copy = copyOf(event as MouseEvent | TouchEvent);
    handed.add(copy);
    if (!element.dispatchEvent(copy)) event.preventDefault();
  };
  for (const type of HANDED_ON) root.addEventListener(type, handOn, { capture: true, passive: false });
  return () => {
    for (const type of HANDED_ON) root.removeEventListener(type, handOn, { capture: true });
  };
}

/**
 * The point a press is picked at: the point the pointer went down at, for the mouse press the browser
 * sends after it, which it rounds to whole pixels, so that both are handed to the same thing even at
 * the edge of a piece.
 */
function samePress(
  point: { x: number; y: number } | null,
  type: string,
  pointerDown: { x: number; y: number } | null
): { x: number; y: number } | null {
  if (!point || type !== 'mousedown' || !pointerDown) return point;
  return Math.abs(point.x - pointerDown.x) < 1 && Math.abs(point.y - pointerDown.y) < 1 ? pointerDown : point;
}

function pointOf(event: MouseEvent | TouchEvent): { x: number; y: number } | null {
  if ('touches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { x: touch.pageX, y: touch.pageY } : null;
  }
  return { x: event.pageX, y: event.pageY };
}

/** The same press, to be dispatched afresh on another element. */
function copyOf(event: MouseEvent | TouchEvent): Event {
  if ('touches' in event && typeof TouchEvent === 'function') {
    return new TouchEvent(event.type, {
      bubbles: true,
      cancelable: true,
      touches: [...event.touches],
      targetTouches: [...event.targetTouches],
      changedTouches: [...event.changedTouches],
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    });
  }
  const mouse = event as MouseEvent;
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: mouse.clientX,
    clientY: mouse.clientY,
    screenX: mouse.screenX,
    screenY: mouse.screenY,
    button: mouse.button,
    buttons: mouse.buttons,
    detail: mouse.detail,
    altKey: mouse.altKey,
    ctrlKey: mouse.ctrlKey,
    metaKey: mouse.metaKey,
    shiftKey: mouse.shiftKey,
  };
  if (typeof PointerEvent === 'function' && event instanceof PointerEvent) {
    return new PointerEvent(event.type, {
      ...init,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
    });
  }
  return new MouseEvent(mouse.type, init);
}
