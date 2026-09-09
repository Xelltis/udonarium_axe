import {
  ChangeDetectionStrategy,
  Component,
  ComponentRef,
  DestroyRef,
  inject,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PanelService } from '@axe/application/ui/panel.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { UIPanelComponent } from '@axe/ui/components/ui-panel/ui-panel.component';

@Component({
  standalone: true,
  selector: 'tabbed-panel-probe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<span class="probe"></span>',
})
class TabbedPanelProbeComponent {
  readonly panel = inject(PanelService);
  gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.gone = true));
  }
}

@Component({
  standalone: true,
  selector: 'panel-tabs-test-host',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: '<ng-template #layer></ng-template>',
})
class PanelTabsTestHostComponent {
  readonly layer = viewChild.required('layer', { read: ViewContainerRef });
}

describe('a frame holding more than one panel', () => {
  let host: ComponentFixture<PanelTabsTestHostComponent>;
  let layer: ViewContainerRef;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelTabsTestHostComponent, UIPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    host = TestBed.createComponent(PanelTabsTestHostComponent);
    host.detectChanges();
    layer = host.componentInstance.layer();
  });

  afterEach(() => host.destroy());

  function openFrame(title: string): {
    frame: ComponentRef<UIPanelComponent>;
    panel: PanelService;
    body: ComponentRef<TabbedPanelProbeComponent>;
  } {
    const frame = layer.createComponent(UIPanelComponent, { index: layer.length, injector: layer.injector });
    const panel = frame.injector.get(PanelService);
    frame.instance.claimSelf(frame);
    const body = frame.instance.openTab(TabbedPanelProbeComponent, panel);
    panel.attachTo(frame.instance);
    frame.setInput('title', title);
    host.detectChanges();
    return { frame, panel, body };
  }

  /** Folds the second panel into the first, the way dropping one bar on another will. */
  function fold(
    into: ComponentRef<UIPanelComponent>,
    from: { frame: ComponentRef<UIPanelComponent>; panel: PanelService }
  ): void {
    into.instance.adoptTab(from.frame.instance.releaseTab(from.panel)!);
    from.frame.destroy();
    host.detectChanges();
  }

  function grounds(frame: ComponentRef<UIPanelComponent>): HTMLElement[] {
    return [...frame.location.nativeElement.querySelectorAll('panel-tab-slot > div')] as HTMLElement[];
  }

  it('wears the name of the panel it is showing', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');

    fold(first.frame, second);
    expect(first.frame.location.nativeElement.textContent).toContain('Sheet');

    first.frame.instance.selectTab(0);
    host.detectChanges();

    expect(first.frame.location.nativeElement.textContent).toContain('Chat');
  });

  it('keeps the panel it is not showing standing, out of sight', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');

    fold(first.frame, second);

    expect(first.frame.instance.tabCount()).toBe(2);
    expect(first.body.instance.gone).toBe(false);
    expect(grounds(first.frame).map((ground) => ground.style.display)).toEqual(['none', '']);
  });

  it('shrinks every panel it holds along with itself', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);

    first.frame.instance.toggleMinimize();

    expect(first.panel.isMinimized()).toBe(true);
    expect(second.panel.isMinimized()).toBe(true);
  });

  it('puts one panel away without touching the rest', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);

    second.panel.close();
    host.detectChanges();

    expect(second.body.instance.gone).toBe(true);
    expect(first.body.instance.gone).toBe(false);
    expect(first.frame.instance.tabCount()).toBe(1);
  });

  it('goes with the last panel it held', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);
    let framesLeft = 2;
    first.frame.onDestroy(() => (framesLeft -= 1));

    second.panel.close();
    expect(framesLeft).toBe(2);

    first.panel.close();

    expect(framesLeft).toBe(1);
  });

  it('hands a panel out without taking it down', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);

    const handed = first.frame.instance.releaseTab(second.panel);

    expect(handed?.panel).toBe(second.panel);
    expect(second.body.instance.gone).toBe(false);
    expect(first.frame.instance.tabCount()).toBe(1);
  });

  it('tells a panel when it is looked at again', async () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);
    let woken = 0;
    first.panel.activated$.subscribe(() => (woken += 1));

    first.frame.instance.selectTab(0);
    host.detectChanges();
    await host.whenStable();

    expect(woken).toBe(1);
    expect(first.panel.isActiveTab()).toBe(true);
    expect(second.panel.isActiveTab()).toBe(false);
  });
});
