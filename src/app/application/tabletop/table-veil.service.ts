import { Injectable, signal } from '@angular/core';
import type { Table3dLightMap, Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';

/**
 * What the page draws over what this seat cannot see well, which a table drawn on a canvas lays over
 * its scene: the veil of the fog and what is only remembered, and the darkness of a dark table with
 * the light carved out of it. Where each lies is read off its canvas as the page lays it out, in table
 * pixels.
 */
@Injectable({ providedIn: 'root' })
export class TableVeilService {
  private readonly laid = signal<Table3dVeil | null>(null);
  private readonly darkened = signal<Table3dLightMap | null>(null);

  /** The veil laid now, or none. */
  readonly veil = this.laid.asReadonly();

  /** The darkness laid now, or none where the table is not dark. */
  readonly lightMap = this.darkened.asReadonly();

  /** Lays the canvas the veil is drawn on, or lays it again with what the page has just drawn on it. */
  show(canvas: HTMLCanvasElement): void {
    this.laid.set({ canvas, box: boxOf(canvas), revision: (this.laid()?.revision ?? 0) + 1 });
  }

  /**
   * Lays the canvas the darkness is drawn on, or lays it again with what the page has just drawn on
   * it, with how dark the table is where no light reaches.
   */
  showDarkness(canvas: HTMLCanvasElement, darkness: number): void {
    this.darkened.set({ canvas, box: boxOf(canvas), revision: (this.darkened()?.revision ?? 0) + 1, darkness });
  }

  /** Takes the veil and the darkness away. */
  forget(): void {
    if (this.laid()) this.laid.set(null);
    this.forgetDarkness();
  }

  /** Takes the darkness away, leaving the table lit whole. */
  forgetDarkness(): void {
    if (this.darkened()) this.darkened.set(null);
  }
}

/** Where a canvas the page lays over the board lies, read off it as the page lays it out. */
function boxOf(canvas: HTMLCanvasElement) {
  return {
    x: parseFloat(canvas.style.left) || 0,
    y: parseFloat(canvas.style.top) || 0,
    width: parseFloat(canvas.style.width) || canvas.width,
    height: parseFloat(canvas.style.height) || canvas.height,
  };
}
