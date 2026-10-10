import { edgeScrollStep } from '@axe/ui/dragging/edge-scroll';
import { type DropSide } from '@axe/ui/dragging/row-reorder';

/** A row a held drag may land beside: its element's identifier and where it is drawn. */
export interface DropRow {
  id: string;
  top: number;
  height: number;
}

/** How far a finger has to travel before a press on the handle becomes a drag. */
export const TOUCH_DRAG_SLOP_PX = 6;

/**
 * The row a drag held at `y` lands beside, and on which side: below a row past its middle, above
 * it before. Above the first row lands before it, and below the last after it. Null with no rows,
 * or where it would land back on the row being dragged.
 */
export function pickDropRow(
  rows: readonly DropRow[],
  draggedId: string,
  y: number
): { id: string; side: DropSide } | null {
  if (rows.length === 0) return null;
  let picked: { id: string; side: DropSide } | null = null;
  for (const row of rows) {
    if (y < row.top + row.height / 2) {
      picked = { id: row.id, side: 'before' };
      break;
    }
    picked = { id: row.id, side: 'after' };
  }
  if (!picked || picked.id === draggedId) return null;
  const index = rows.findIndex((row) => row.id === picked!.id);
  const draggedIndex = rows.findIndex((row) => row.id === draggedId);
  // Just above the row below, or just below the row above, is where it already is.
  if (picked.side === 'before' && index === draggedIndex + 1) return null;
  if (picked.side === 'after' && index === draggedIndex - 1) return null;
  return picked;
}

const DRAGGING_CLASS = 'elm-touch-dragging';
const DROP_CLASSES: Record<DropSide, string> = {
  before: 'elm-touch-drop-before',
  after: 'elm-touch-drop-after',
};

/**
 * A row of a sheet carried by a finger on its handle, among the rows beside it.
 *
 * The browser's own drag and drop does not start from a touch, so the finger is followed by hand:
 * past a few pixels the row dims and a line marks where it would land, the sheet scrolls while the
 * finger is held near its top or bottom, and letting go hands the landing place over.
 */
export class DataElementTouchDrag {
  private started = false;
  private target: { id: string; side: DropSide } | null = null;
  private lastY: number;
  private frame = 0;
  private readonly scroller: HTMLElement | null;
  private readonly abort = new AbortController();

  constructor(
    private readonly draggedId: string,
    private readonly handle: HTMLElement,
    private readonly row: HTMLElement,
    start: PointerEvent,
    private readonly callbacks: {
      onStart: () => void;
      onDrop: (targetId: string, side: DropSide) => void;
    }
  ) {
    this.lastY = start.clientY;
    this.scroller = row.closest('.overflow-auto');
    const startX = start.clientX;
    const startY = start.clientY;
    const pointerId = start.pointerId;
    try {
      handle.setPointerCapture?.(pointerId);
    } catch {
      // A pointer the browser no longer knows, such as one already lifted, cannot be captured;
      // the handle still hears it while the finger stays over it.
    }
    const options = { signal: this.abort.signal };
    handle.addEventListener(
      'pointermove',
      (event) => {
        if (event.pointerId !== pointerId) return;
        this.lastY = event.clientY;
        if (!this.started) {
          if (Math.hypot(event.clientX - startX, event.clientY - startY) < TOUCH_DRAG_SLOP_PX) return;
          this.begin();
        }
        event.preventDefault();
        this.track();
      },
      options
    );
    handle.addEventListener(
      'pointerup',
      (event) => {
        if (event.pointerId !== pointerId) return;
        const target = this.started ? this.target : null;
        this.end();
        if (target) this.callbacks.onDrop(target.id, target.side);
      },
      options
    );
    handle.addEventListener('pointercancel', () => this.end(), options);
  }

  /** Lets the row go without moving it. */
  cancel(): void {
    this.end();
  }

  private begin(): void {
    this.started = true;
    this.row.classList.add(DRAGGING_CLASS);
    this.callbacks.onStart();
    const scroll = () => {
      if (!this.started) return;
      if (this.scroller) {
        const area = this.scroller.getBoundingClientRect();
        const step = edgeScrollStep(this.lastY, area);
        if (step !== 0) {
          this.scroller.scrollTop += step;
          this.track();
        }
      }
      this.frame = requestAnimationFrame(scroll);
    };
    this.frame = requestAnimationFrame(scroll);
  }

  private siblingRows(): { element: HTMLElement; row: DropRow }[] {
    const list = this.row.parentElement;
    if (!list) return [];
    return Array.from(list.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement && !!child.dataset['gdeId'])
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { element, row: { id: element.dataset['gdeId']!, top: rect.top, height: rect.height } };
      });
  }

  private track(): void {
    const rows = this.siblingRows();
    this.target = pickDropRow(
      rows.map((entry) => entry.row),
      this.draggedId,
      this.lastY
    );
    for (const { element, row } of rows) {
      for (const side of ['before', 'after'] as const) {
        element.classList.toggle(DROP_CLASSES[side], this.target?.id === row.id && this.target.side === side);
      }
    }
  }

  private end(): void {
    cancelAnimationFrame(this.frame);
    this.started = false;
    this.abort.abort();
    this.row.classList.remove(DRAGGING_CLASS);
    for (const { element } of this.siblingRows()) element.classList.remove(DROP_CLASSES.before, DROP_CLASSES.after);
  }
}
