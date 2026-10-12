import { Injectable, signal, untracked } from '@angular/core';

/**
 * How tall each piece's picture stands over its base, in table pixels, as the pieces drawn on the
 * table give it: what a mount's riding card reads to stand clear of the pictures of those riding it.
 */
@Injectable({ providedIn: 'root' })
export class PieceFigureHeightsService {
  private readonly heights = signal<ReadonlyMap<string, number>>(new Map());

  /** How tall a piece's picture stands, or null where it is not drawn. */
  heightOf(identifier: string): number | null {
    return this.heights().get(identifier) ?? null;
  }

  /** Says how tall a piece's picture stands now. */
  set(identifier: string, height: number): void {
    untracked(() => {
      if (this.heights().get(identifier) === height) return;
      const next = new Map(this.heights());
      next.set(identifier, height);
      this.heights.set(next);
    });
  }

  /** Forgets a piece no longer drawn. */
  forget(identifier: string): void {
    untracked(() => {
      if (!this.heights().has(identifier)) return;
      const next = new Map(this.heights());
      next.delete(identifier);
      this.heights.set(next);
    });
  }
}
