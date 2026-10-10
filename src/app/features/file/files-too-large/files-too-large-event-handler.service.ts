import { DestroyRef, inject, Injectable } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { SnackbarService } from '@axe/application/ui/snackbar.service';
import { filesTooLarge$, FilesTooLargeEvent } from '@axe/core/event/domain-events';
import { filesTooLargeMessage } from '@axe/features/file/files-too-large/files-too-large-message';

/** How long the notice stays, a little longer than most, since it names files to go and find. */
const NOTICE_MS = 8000;

/**
 * Tells the reader, at the foot of the screen, which dropped or chosen files were left out for
 * being too large, rather than letting them vanish without a word.
 */
@Injectable({ providedIn: 'root' })
export class FilesTooLargeEventHandlerService {
  private readonly snackbar = inject(SnackbarService);
  private readonly t = inject(TRANSLATE_FN);

  constructor() {
    filesTooLarge$.subscribe((event) => this.tell(event), inject(DestroyRef));
  }

  private tell(event: FilesTooLargeEvent): void {
    const message = filesTooLargeMessage(event.files, this.t);
    if (message) this.snackbar.show(message, { ms: NOTICE_MS });
  }
}
