import { ChangeDetectionStrategy, Component, viewChild, ViewContainerRef } from '@angular/core';

/**
 * Where a panel is drawn when it has a window to itself.
 *
 * It is the same thing the main document's modal layer is: somewhere for `PanelService` to
 * create into. Having one per window is what lets a menu opened inside that window find a
 * place to appear in that window, rather than in the one the app started in.
 */
@Component({
  selector: 'app-panel-window-layer',
  template: '<ng-container #layer />',
  host: { class: 'block h-dvh w-screen' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PanelWindowLayerComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}
