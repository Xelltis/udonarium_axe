import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelWindowLayerComponent } from '@axe/features/panels/panel-window-layer.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'layer-guest',
  template: 'guest',
})
class LayerGuestComponent {}

describe('PanelWindowLayerComponent', () => {
  let fixture: ComponentFixture<PanelWindowLayerComponent>;
  let root: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(PanelWindowLayerComponent);
    await fixture.whenStable();
    root = fixture.nativeElement as HTMLElement;
  });

  it("draws the window's own panel inside the frame that strips it", () => {
    const guest = fixture.componentInstance.layer().createComponent(LayerGuestComponent);

    const frame = root.querySelector('[data-panel-window-frame]')!;
    expect(frame.contains(guest.location.nativeElement)).toBe(true);
  });

  it('draws what is opened over it outside that frame', () => {
    const guest = fixture.componentInstance.overlay().createComponent(LayerGuestComponent);

    const frame = root.querySelector('[data-panel-window-frame]')!;
    expect(root.contains(guest.location.nativeElement)).toBe(true);
    expect(frame.contains(guest.location.nativeElement)).toBe(false);
  });
});
