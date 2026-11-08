import { inject, Injectable, signal } from '@angular/core';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';

/** Where this seat shows a piece, ahead of the place its object has been told. */
export interface TransientPlacement {
  /** The face it stands on, named as a location names it. */
  readonly surface: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The outline of where a dragged piece would land on another face, in that face's own axes. */
export interface DropPreview {
  readonly surface: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where the pieces this seat is moving are shown, for as long as that runs ahead of their objects.
 *
 * A dragged piece writes where it is to its object a few frames after it moves, so the other seats
 * are not sent every move. What draws the table here reads the place from this instead and follows
 * the pointer at every frame; a piece is let go of once its object has caught up and it is no
 * longer held.
 */
@Injectable({ providedIn: 'root' })
export class TransientPlacementService {
  private readonly objectChange = inject(ObjectChangeService);
  private readonly placements = new Map<string, TransientPlacement>();
  private readonly changes = signal(0);
  private readonly preview = signal<DropPreview | null>(null);

  /** Goes up each time a place is shown or let go of; read it to follow the places. */
  readonly version = this.changes.asReadonly();
  /** The outline of where a dragged piece would land on another face, or null while there is none. */
  readonly dropPreview = this.preview.asReadonly();

  /** Shows a piece at a place, ahead of its object. */
  place(identifier: string, placement: TransientPlacement): void {
    const shown = this.placements.get(identifier);
    if (
      shown?.surface === placement.surface &&
      shown.x === placement.x &&
      shown.y === placement.y &&
      shown.z === placement.z
    ) {
      return;
    }
    this.placements.set(identifier, placement);
    this.changes.update((version) => version + 1);
  }

  /**
   * Lets go of a piece, which is shown where its object says from then on. It is drawn again from its
   * object at once: its object's own change is told a moment later, and until then what draws the
   * table would keep it where it stood before it was moved.
   */
  release(identifier: string): void {
    if (!this.placements.delete(identifier)) return;
    this.objectChange.notifyChanged(identifier);
    this.changes.update((version) => version + 1);
  }

  /** Every piece this seat shows ahead of its object, by its identifier; read it to follow the places. */
  placed(): ReadonlyMap<string, TransientPlacement> {
    this.changes();
    return this.placements;
  }

  /** Where this seat shows a piece ahead of its object, or null where it is shown where its object says. */
  placementOf(identifier: string): TransientPlacement | null {
    return this.placements.get(identifier) ?? null;
  }

  /** Shows, or with null takes away, the outline of where a dragged piece would land. */
  showDropPreview(preview: DropPreview | null): void {
    const shown = this.preview();
    if (
      shown === preview ||
      (shown &&
        preview &&
        shown.surface === preview.surface &&
        shown.x === preview.x &&
        shown.y === preview.y &&
        shown.width === preview.width &&
        shown.height === preview.height)
    ) {
      return;
    }
    this.preview.set(preview);
  }
}
