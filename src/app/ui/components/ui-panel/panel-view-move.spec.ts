import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  inject,
  signal,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelService } from '@axe/application/ui/panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';

@Component({
  standalone: true,
  selector: 'panel-body-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="probe">{{ mark() }}</span>',
})
class PanelBodyProbeComponent {
  readonly panel = inject(PanelService);
  readonly mark = signal('first');
  gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
  }
}

@Component({
  standalone: true,
  selector: 'panel-move-test-host',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<ng-template #layer></ng-template>',
})
class PanelMoveTestHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

describe('moving a panel body from one frame to another', () => {
  let host: ComponentFixture<PanelMoveTestHostComponent>;
  let layer: ViewContainerRef;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelMoveTestHostComponent, UIPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    host = TestBed.createComponent(PanelMoveTestHostComponent);
    host.detectChanges();
    layer = host.componentInstance.layer();
  });

  afterEach(() => host.destroy());

  function openFrame(): ComponentRef<UIPanelComponent> {
    const frame = layer.createComponent(UIPanelComponent, { index: layer.length, injector: layer.injector });
    host.detectChanges();
    return frame;
  }

  function bodyIn(frame: ComponentRef<UIPanelComponent>): Element | null {
    return frame.location.nativeElement.querySelector('.probe');
  }

  it('answers with a fresh frame content container before anything is drawn into it', () => {
    const frame = layer.createComponent(UIPanelComponent, { index: layer.length, injector: layer.injector });

    expect(frame.instance.content()).toBeTruthy();

    frame.destroy();
  });

  it('leaves the body standing when the frame it was built in is taken away', () => {
    const first = openFrame();
    const body = first.instance.content().createComponent(PanelBodyProbeComponent);
    const second = openFrame();
    host.detectChanges();

    second.instance.content().insert(body.hostView);
    first.destroy();
    host.detectChanges();

    expect(body.instance.gone).toBe(false);
    expect(bodyIn(second)).not.toBeNull();
  });

  it('leaves the body holding the panel service it was built with', () => {
    const first = openFrame();
    const body = first.instance.content().createComponent(PanelBodyProbeComponent);
    const second = openFrame();

    second.instance.content().insert(body.hostView);

    expect(body.instance.panel).toBe(first.injector.get(PanelService));
    expect(body.instance.panel).not.toBe(second.injector.get(PanelService));
  });

  it('goes on drawing the body in the frame it moved to', () => {
    const first = openFrame();
    const body = first.instance.content().createComponent(PanelBodyProbeComponent);
    const second = openFrame();
    second.instance.content().insert(body.hostView);
    first.destroy();

    body.instance.mark.set('second');
    host.detectChanges();

    expect(bodyIn(second)?.textContent).toContain('second');
  });

  it('takes the body away with the frame it ended up in, not the one it left', () => {
    const first = openFrame();
    const body = first.instance.content().createComponent(PanelBodyProbeComponent);
    const second = openFrame();
    second.instance.content().insert(body.hostView);

    first.destroy();
    expect(body.instance.gone).toBe(false);

    second.destroy();
    expect(body.instance.gone).toBe(true);
  });
});
