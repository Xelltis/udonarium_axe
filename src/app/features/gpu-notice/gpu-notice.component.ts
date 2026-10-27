import { afterNextRender, ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { drawsWithoutGpu } from '@axe/core/util/graphics-acceleration';
import { accelerationBrowserOf } from '@axe/features/gpu-notice/acceleration-browser';
import { TranslocoModule } from '@jsverse/transloco';

/**
 * Tells a reader whose browser draws without the GPU, each time the page opens, that Udonarium Axe
 * will be very heavy until the browser's graphics acceleration is turned on, and where the browser
 * they use keeps that setting. Nothing else changes for them: the table is drawn as it always is.
 *
 * A browser driven by automation, as the end-to-end tests drive one, is not told: what it draws with
 * is the harness's choice, not a reader's.
 */
@Component({
  selector: 'app-gpu-notice',
  templateUrl: './gpu-notice.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoModule],
})
export class GpuNoticeComponent {
  protected readonly visible = signal(false);
  protected readonly browser = accelerationBrowserOf(typeof navigator === 'undefined' ? '' : navigator.userAgent);

  constructor() {
    afterNextRender(() => {
      if (typeof navigator !== 'undefined' && navigator.webdriver) return;
      if (drawsWithoutGpu()) this.visible.set(true);
    });
  }

  /** Puts the notice away until the page is opened again. */
  protected close(): void {
    this.visible.set(false);
  }
}
