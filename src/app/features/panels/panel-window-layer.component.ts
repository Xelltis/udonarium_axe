import { ChangeDetectionStrategy, Component, viewChild, ViewContainerRef } from '@angular/core';

/**
 * Where a panel is drawn when it has a window to itself.
 *
 * It is the same thing the main document's modal layer is: somewhere for `PanelService` to
 * create into. Having one per window is what lets a menu opened inside that window find a
 * place to appear in that window, rather than in the one the app started in.
 *
 * The panel the window was opened for and whatever is opened over it are kept apart. The
 * window's own panel is stretched over the whole window and stripped of its frame, and a
 * smaller panel opened from it has to keep its own place, size and close box.
 */
@Component({
  selector: 'app-panel-window-layer',
  template: '<div class="contents" data-panel-window-frame><ng-container #layer /></div><ng-container #overlay />',
  host: { class: 'block h-dvh w-screen' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelWindowLayerComponent {
  /** Where the panel the window was opened for is drawn. */
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
  /** Where a panel, a menu or a dialogue opened over it is drawn. */
  readonly overlay = viewChild.required('overlay', { read: ViewContainerRef });
}
