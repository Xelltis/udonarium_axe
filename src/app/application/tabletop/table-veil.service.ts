import { Injectable, signal } from '@angular/core';
import type { Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';

/**
 * The veil the page draws over what this seat cannot see well, which a table drawn on a canvas lays
 * over its scene: where it lies is read off the canvas as the page lays it out, in table pixels.
 */
@Injectable({ providedIn: 'root' })
export class TableVeilService {
  private readonly laid = signal<Table3dVeil | null>(null);

  /** The veil laid now, or none. */
  readonly veil = this.laid.asReadonly();

  /** Lays the canvas the veil is drawn on, or lays it again with what the page has just drawn on it. */
  show(canvas: HTMLCanvasElement): void {
    const box = {
      x: parseFloat(canvas.style.left) || 0,
      y: parseFloat(canvas.style.top) || 0,
      width: parseFloat(canvas.style.width) || canvas.width,
      height: parseFloat(canvas.style.height) || canvas.height,
    };
    this.laid.set({ canvas, box, revision: (this.laid()?.revision ?? 0) + 1 });
  }

  /** Takes the veil away. */
  forget(): void {
    if (this.laid()) this.laid.set(null);
  }
}
