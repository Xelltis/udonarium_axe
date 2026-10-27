import { ChangeDetectionStrategy, Component, viewChild, ViewContainerRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PANEL_FRAME_COMPONENT } from '@axe/application/ui/overlay-components';
import { OverlayLayers } from '@axe/application/ui/overlay-layers';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';

@Component({
  standalone: true,
  selector: 'panel-layer-test-host',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<ng-template #layer></ng-template>',
  providers: [{ provide: PANEL_FRAME_COMPONENT, useValue: UIPanelComponent }],
})
export class PanelLayerTestHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

/**
 * Somewhere for panels to be put up during a test.
 *
 * The application hands over its layer and the frame class when it starts, so anything opening
 * a panel does nothing at all in a test until the same is done here. Returns the undo, to be
 * called from `afterEach`.
 */
export function installPanelLayer(): () => void {
  const hostFixture = TestBed.createComponent(PanelLayerTestHostComponent);
  hostFixture.detectChanges();

  const layers = TestBed.inject(OverlayLayers);
  const originalLayer = layers.main;
  layers.main = hostFixture.componentInstance.layer();

  return () => {
    layers.main = originalLayer;
    hostFixture.destroy();
  };
}
