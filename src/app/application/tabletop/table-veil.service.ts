import { Injectable, signal } from '@angular/core';
import type { Table3dFogAirSheet, Table3dLightMap, Table3dVeil } from '@axe/infrastructure/table-3d/table-3d-port';

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
  private readonly glowing = signal<Table3dVeil | null>(null);
  private readonly hanging = signal<readonly Table3dFogAirSheet[]>([]);
  private pictures = 0;

  /** The veil laid now, or none. */
  readonly veil = this.laid.asReadonly();

  /** The darkness laid now, or none where the table is not dark. */
  readonly lightMap = this.darkened.asReadonly();

  /** The glow of the lamps laid now, or none. */
  readonly glow = this.glowing.asReadonly();

  /** The sheets of fog hanging in the air now, none where there is no fog. */
  readonly fogAir = this.hanging.asReadonly();

  /** How many pictures the page is loading to draw the veil and the darkness with, as the shadows things throw. */
  loadingPictures(): number {
    return this.pictures;
  }

  /** Counts a picture the veil or the darkness is drawn with as loading, until the answer given is called. */
  pictureLoading(): () => void {
    this.pictures++;
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.pictures--;
    };
  }

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

  /** Lays the canvas the glow of the lamps is drawn on, or lays it again with what the page has just drawn on it. */
  showGlow(canvas: HTMLCanvasElement): void {
    this.glowing.set({ canvas, box: boxOf(canvas), revision: (this.glowing()?.revision ?? 0) + 1 });
  }

  /**
   * Hangs the canvases the sheets of fog in the air are painted on, each at its height and drifting
   * as the page drifts it, or hangs them again with what the page has just painted on them.
   */
  showFogAir(sheets: readonly Omit<Table3dFogAirSheet, 'box' | 'revision'>[]): void {
    const revision = (this.hanging()[0]?.revision ?? 0) + 1;
    this.hanging.set(sheets.map((sheet) => ({ ...sheet, box: boxOf(sheet.canvas), revision })));
  }

  /** Takes the sheets of fog in the air away. */
  forgetFogAir(): void {
    if (this.hanging().length > 0) this.hanging.set([]);
  }

  /** Takes the veil, the darkness and the glow away. */
  forget(): void {
    if (this.laid()) this.laid.set(null);
    this.forgetDarkness();
  }

  /** Takes the darkness and the glow away, leaving the table lit whole. */
  forgetDarkness(): void {
    if (this.darkened()) this.darkened.set(null);
    this.forgetGlow();
  }

  /** Takes the glow of the lamps away. */
  forgetGlow(): void {
    if (this.glowing()) this.glowing.set(null);
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
