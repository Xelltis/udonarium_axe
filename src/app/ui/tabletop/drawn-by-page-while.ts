import { DestroyRef, effect, inject, untracked } from '@angular/core';
import { PageDrawnPiecesService } from '@axe/application/tabletop/page-drawn-pieces.service';

/**
 * Has the page draw a piece itself while it plays the piece's moves, as a die's tumble, and hands
 * the piece back to the table's canvas once they are over or the piece is gone. Must be called in an
 * injection context.
 */
export function drawnByPageWhile(identifier: () => string, playing: () => boolean): void {
  const pages = inject(PageDrawnPiecesService);
  let taken: string | null = null;
  const handBack = () => {
    if (taken) pages.draw(taken, false);
    taken = null;
  };
  effect(() => {
    const id = identifier();
    const itself = playing();
    untracked(() => {
      if (taken !== id) handBack();
      if (!itself) return handBack();
      pages.draw(id, true);
      taken = id;
    });
  });
  inject(DestroyRef).onDestroy(handBack);
}
