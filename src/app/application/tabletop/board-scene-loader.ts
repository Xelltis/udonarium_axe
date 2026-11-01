import { inject, Injectable, Injector } from '@angular/core';
import type { BoardSceneService } from '@axe/application/tabletop/board-scene.service';
import { LOAD_FAILURE_NOTICE } from '@axe/application/ui/overlay-components';

/**
 * Fetches the code that puts scenes on the first time a hotbar slot or a switch on the board
 * wants it, as nothing at start does. Null where it could not be fetched, which the reader is told,
 * and the next time it is wanted it is tried again.
 */
@Injectable({ providedIn: 'root' })
export class BoardSceneLoader {
  private readonly injector = inject(Injector);
  private readonly loadFailureNotice = inject(LOAD_FAILURE_NOTICE);
  private loading: Promise<BoardSceneService | null> | null = null;

  load(): Promise<BoardSceneService | null> {
    this.loading ??= import('@axe/application/tabletop/board-scene.service').then(
      (m) => this.injector.get(m.BoardSceneService),
      () => {
        this.loading = null;
        this.loadFailureNotice();
        return null;
      }
    );
    return this.loading;
  }
}
