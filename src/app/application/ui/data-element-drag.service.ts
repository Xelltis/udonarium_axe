import { Injectable, signal } from '@angular/core';

const DATA_ELEMENT_DRAG_MIME = 'application/x-udonarium-data-element';

@Injectable({ providedIn: 'root' })
export class DataElementDragService {
  private readonly _draggedId = signal<string | null>(null);
  readonly draggedId = this._draggedId.asReadonly();

  /**
   * Marks a data element as being dragged and writes its identifier into the drag data.
   *
   * The identifier goes under a type of our own as well as plain text, which is what lets
   * `getDraggedId` tell a drag from this page from one brought in from outside.
   */
  start(event: DragEvent, identifier: string): void {
    this._draggedId.set(identifier);
    event.dataTransfer?.setData(DATA_ELEMENT_DRAG_MIME, identifier);
    event.dataTransfer?.setData('text/plain', identifier);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  /** Forgets the dragged element once the drag has been dropped or abandoned. */
  end(): void {
    this._draggedId.set(null);
  }

  /**
   * Which card is being dragged, where one of ours is.
   *
   * Anything dragged in from outside the page carries text of its own - a picture from
   * another tab brings its address - so plain text alone is not taken as ours. It is read
   * only where the drag also says, in a type of our own, that it came from here; otherwise
   * the drop is somebody else's business and travels on to whoever wants it.
   */
  getDraggedId(event?: DragEvent): string | null {
    const held = this._draggedId();
    if (held) return held;

    const transfer = event?.dataTransfer;
    if (!transfer) return null;
    if (!Array.from(transfer.types ?? []).includes(DATA_ELEMENT_DRAG_MIME)) return null;
    return transfer.getData(DATA_ELEMENT_DRAG_MIME) || transfer.getData('text/plain') || null;
  }
}
