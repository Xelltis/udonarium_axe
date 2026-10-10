import { afterNextRender, Directive, inject } from '@angular/core';
import { ReloadNoticeService } from '@axe/application/ui/reload-notice.service';

/**
 * Asks the reader to reload the page once it has been drawn.
 *
 * It belongs in the `@error` block of a view deferred into a chunk of its own, which is drawn when
 * that chunk cannot be fetched, as happens to a tab left open across a release.
 */
@Directive({ selector: '[appReloadNotice]' })
export class ReloadNoticeDirective {
  constructor() {
    const notice = inject(ReloadNoticeService);
    afterNextRender(() => notice.tellReloadNeeded());
  }
}
