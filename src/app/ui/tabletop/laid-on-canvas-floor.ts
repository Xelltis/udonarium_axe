import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { FloorCanvasesService } from '@axe/application/tabletop/floor-canvases.service';

/** A canvas a part of the page paints on and lays on the floor. */
export interface CanvasOnFloor {
  /** Which canvas it is, apart from every other laid on the floor. */
  readonly id: () => string;
  /** The canvas, while the page has one. */
  readonly canvas: () => HTMLCanvasElement | undefined;
  /** How high over the board it lies, in table pixels. */
  readonly heightPx: () => number;
}

/**
 * Has a table drawn on a canvas lay a canvas the page paints on over its board, as where a piece may
 * move, and hands back what to call each time the page has painted it anew. The canvas is taken up
 * again while the page has none, and once the part is gone.
 * Must be called in an injection context.
 */
export function laidOnCanvasFloor(floor: CanvasOnFloor): () => void {
  const floors = inject(FloorCanvasesService);
  let laid: string | null = null;
  const takeUp = () => {
    if (laid) floors.forget(laid);
    laid = null;
  };
  effect(() => {
    const canvas = floor.canvas();
    const id = floor.id();
    if (!canvas || (laid !== null && laid !== id)) untracked(takeUp);
  });
  inject(DestroyRef).onDestroy(takeUp);
  return () =>
    untracked(() => {
      const canvas = floor.canvas();
      if (!canvas) return;
      const id = floor.id();
      if (laid !== null && laid !== id) floors.forget(laid);
      floors.show(id, canvas, floor.heightPx());
      laid = id;
    });
}
