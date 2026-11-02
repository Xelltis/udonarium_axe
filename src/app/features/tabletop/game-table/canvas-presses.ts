import type { TabletopOverlapRegistryEntry } from '@axe/application/ui/tabletop-overlap.service';

/** The screen of pieces laid over the canvas. */
const HUD = '[data-testid="table-hud"]';

/** The presses a block drawn on the canvas is handed, as the page would have handed them to it. */
const HANDED_ON = ['mousedown', 'touchstart', 'contextmenu', 'dblclick'] as const;

/** What handing presses on needs of the table. */
export interface CanvasPressRoutes {
  /** Whether the table is drawn on a canvas, which is the only time presses are handed on. */
  drawsOnCanvas(): boolean;
  /** The identifier of what a point of the page lands on first, or null. */
  pickAt(pageX: number, pageY: number): string | null;
  /** What the table knows of a piece: the element it listens for presses on, or how to open its menu. */
  entryOf(identifier: string): TabletopOverlapRegistryEntry | undefined;
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
 * A piece laid over the canvas is a box on the screen round where it is drawn, and its box and the
 * boxes of its parts take in more than the piece: a press on one is picked too, and handed to what
 * it lands on, or to the table where it lands on nothing. A press on a label of the piece is its own.
 */
export function handCanvasPressesOn(root: HTMLElement, routes: CanvasPressRoutes): () => void {
  const handed = new WeakSet<Event>();
  const handOn = (event: Event) => {
    if (handed.has(event) || !routes.drawsOnCanvas()) return;
    const target = event.target instanceof Element ? event.target : null;
    const boxed = target?.matches(`${HUD} [data-part], ${HUD} [data-hud-box]`) ? target : null;
    if (!boxed && target?.closest('[data-object-id], white-board')) return;
    const point = pointOf(event as MouseEvent | TouchEvent);
    if (!point) return;
    const picked = routes.pickAt(point.x, point.y);
    if (boxed && picked === boxed.closest('[data-object-id]')?.getAttribute('data-object-id')) return;
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
  for (const type of HANDED_ON) root.addEventListener(type, handOn, { capture: true });
  return () => {
    for (const type of HANDED_ON) root.removeEventListener(type, handOn, { capture: true });
  };
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
  return new MouseEvent(mouse.type, {
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
  });
}
