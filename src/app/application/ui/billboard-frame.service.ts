import { Injectable } from '@angular/core';
import { TableViewRotation } from '@axe/application/ui/ui-signal.service';

/**
 * Where a part of a piece is turned to, given the turn the table is seen at.
 *
 * Everything the function needs besides the turn — the piece's own rotation, its roll, how high the
 * part floats above it — is held in the function itself, so the same function answers for every turn
 * of the camera and is only built again when the piece itself changes.
 */
export type BillboardFacing = (rotation: TableViewRotation | null) => string;

/** What a part that the camera never turns is given: the piece it hangs on already faces the reader. */
export const NOT_TURNED: BillboardFacing = () => '';

/** A facing that answers the same transform at every turn, for a part the camera does not turn. */
export function facesAlways(transform: string): BillboardFacing {
  return () => transform;
}

interface FramedElement {
  facing: BillboardFacing;
  written: string | null;
}

/**
 * The register of everything on the table that turns to face the camera.
 *
 * A turn of the camera used to be published as a signal, which woke every piece that reads it and
 * had each of them work its labels out again through change detection, a frame behind the table.
 * The parts that turn are registered here instead, and the frame that writes the table's own
 * transform writes theirs in the same breath.
 */
@Injectable({ providedIn: 'root' })
export class BillboardFrameService {
  private readonly framed = new Map<HTMLElement, FramedElement>();
  private rotation: TableViewRotation | null = null;

  /**
   * Adds an element to the register, faced the way the table is turned now.
   *
   * Hands back the way to take it off again.
   */
  register(element: HTMLElement, facing: BillboardFacing): () => void {
    const framed: FramedElement = { facing, written: null };
    this.framed.set(element, framed);
    this.face(element, framed);
    return () => {
      if (this.framed.get(element) === framed) this.framed.delete(element);
    };
  }

  /** Turns everything on the register to face a camera that now stands here. */
  apply(rotation: TableViewRotation | null): void {
    this.rotation = rotation;
    for (const [element, framed] of this.framed) this.face(element, framed);
  }

  private face(element: HTMLElement, framed: FramedElement): void {
    const transform = framed.facing(this.rotation);
    if (transform === framed.written) return;
    framed.written = transform;
    element.style.transform = transform;
  }
}
