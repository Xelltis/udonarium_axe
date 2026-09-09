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

  /** Builds a panel into one frame and folds it into another, which is what merging does. */
  function moveTo(
    from: ComponentRef<UIPanelComponent>,
    to: ComponentRef<UIPanelComponent>
  ): ComponentRef<PanelBodyProbeComponent> {
    const panel = from.injector.get(PanelService);
    const body = from.instance.openTab(PanelBodyProbeComponent, panel);
    to.instance.adoptTab(from.instance.releaseTab(panel)!);
    return body;
  }

  it('builds a panel into a frame that has not been drawn yet', () => {
    const frame = layer.createComponent(UIPanelComponent, { index: layer.length, injector: layer.injector });

    const body = frame.instance.openTab(PanelBodyProbeComponent, frame.injector.get(PanelService));

    expect(body.instance).toBeTruthy();
    frame.destroy();
  });

  it('leaves the body standing when the frame it was built in is taken away', () => {
    const first = openFrame();
    const second = openFrame();
    const body = moveTo(first, second);
    host.detectChanges();

    first.destroy();
    host.detectChanges();

    expect(body.instance.gone).toBe(false);
    expect(bodyIn(second)).not.toBeNull();
  });

  it('leaves the body holding the panel service it was built with', () => {
    const first = openFrame();
    const second = openFrame();
    const body = moveTo(first, second);

    expect(body.instance.panel).toBe(first.injector.get(PanelService));
    expect(body.instance.panel).not.toBe(second.injector.get(PanelService));
  });

  it('goes on drawing the body in the frame it moved to', () => {
    const first = openFrame();
    const second = openFrame();
    const body = moveTo(first, second);
    first.destroy();

    body.instance.mark.set('second');
    host.detectChanges();

    expect(bodyIn(second)?.textContent).toContain('second');
  });

  it('takes the body away with the frame it ended up in, not the one it left', () => {
    const first = openFrame();
    const second = openFrame();
    const body = moveTo(first, second);

    first.destroy();
    expect(body.instance.gone).toBe(false);

    second.destroy();
    expect(body.instance.gone).toBe(true);
  });
});
