import { computed, Injectable, signal } from '@angular/core';
import type { Table3dFloorCanvas } from '@axe/infrastructure/table-3d/table-3d-port';

/**
 * The canvases the page paints on and lays on the floor, as where a piece may move, which a table
 * drawn on a canvas lays over its board: where each lies is read off the canvas as the page lays it
 * out, in table pixels.
 */
@Injectable({ providedIn: 'root' })
export class FloorCanvasesService {
  private readonly laid = signal<ReadonlyMap<string, Table3dFloorCanvas>>(new Map());

  /** Every canvas laid on the floor now. */
  readonly all = computed(() => [...this.laid().values()]);

  /**
   * Lays a canvas on the floor at a height over it, or takes it up again with what the page has just
   * painted on it.
   */
  show(id: string, canvas: HTMLCanvasElement, heightPx: number): void {
    const was = this.laid().get(id);
    const box = {
      x: parseFloat(canvas.style.left) || 0,
      y: parseFloat(canvas.style.top) || 0,
      width: parseFloat(canvas.style.width) || canvas.width,
      height: parseFloat(canvas.style.height) || canvas.height,
    };
    this.laid.update((laid) =>
      new Map(laid).set(id, { id, canvas, box, heightPx, revision: (was?.revision ?? 0) + 1 })
    );
  }

  /** Takes a canvas up off the floor. */
  forget(id: string): void {
    if (!this.laid().has(id)) return;
    this.laid.update((laid) => {
      const next = new Map(laid);
      next.delete(id);
      return next;
    });
  }
}
