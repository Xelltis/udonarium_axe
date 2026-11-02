import { Injectable, signal } from '@angular/core';

/**
 * The pieces the page draws itself for a while on a table drawn on a canvas, as a die while it
 * tumbles: the page plays a piece's moves, so it draws the piece through them, and the canvas
 * leaves the piece out until the page hands it back.
 */
@Injectable({ providedIn: 'root' })
export class PageDrawnPiecesService {
  private readonly drawn = signal<ReadonlySet<string>>(new Set());

  /** Whether the page draws a piece itself now. Follows the pieces taken and handed back. */
  drawsItself(identifier: string): boolean {
    return this.drawn().has(identifier);
  }

  /** Has the page draw a piece itself, or with false hands it back to the canvas. */
  draw(identifier: string, itself: boolean): void {
    if (this.drawn().has(identifier) === itself) return;
    const next = new Set(this.drawn());
    if (itself) next.add(identifier);
    else next.delete(identifier);
    this.drawn.set(next);
  }
}
