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
  let beforeLayer: { frame: typeof PanelService.UIPanelComponentClass; layer: ViewContainerRef };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PanelTabsTestHostComponent, UIPanelComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    host = TestBed.createComponent(PanelTabsTestHostComponent);
    host.detectChanges();
    layer = host.componentInstance.layer();
    beforeLayer = { frame: PanelService.UIPanelComponentClass, layer: PanelService.defaultParentViewContainerRef };
    PanelService.UIPanelComponentClass = UIPanelComponent;
    PanelService.defaultParentViewContainerRef = layer;
  });

  afterEach(() => {
    PanelService.UIPanelComponentClass = beforeLayer.frame;
    PanelService.defaultParentViewContainerRef = beforeLayer.layer;
    host.destroy();
  });

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

  function barOf(frame: ComponentRef<UIPanelComponent>): HTMLElement {
    return frame.location.nativeElement.querySelector('.bg-ui-titlebar') as HTMLElement;
  }

  /** Puts a frame's bar somewhere on the screen, which happy-dom does not lay out on its own. */
  function place(frame: ComponentRef<UIPanelComponent>, left: number, top: number): void {
    barOf(frame).getBoundingClientRect = () =>
      ({ left, top, right: left + 300, bottom: top + 28 }) as unknown as DOMRect;
  }

  /** Takes a frame by its bar, carries it to a point, and lets go. */
  function dragBar(frame: ComponentRef<UIPanelComponent>, to: { x: number; y: number }): void {
    const drag = frame.instance as unknown as {
      onFrameDragStart(event: MouseEvent): void;
      onFrameDragMove(event: MouseEvent): void;
      onFrameDragEnd(): void;
    };
    drag.onFrameDragStart({ target: barOf(frame) } as unknown as MouseEvent);
    drag.onFrameDragMove({ clientX: to.x, clientY: to.y } as MouseEvent);
    drag.onFrameDragEnd();
    host.detectChanges();
  }

  it('takes in a panel whose bar is dropped on it', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);

    dragBar(second.frame, { x: 20, y: 14 });

    expect(first.frame.instance.tabCount()).toBe(2);
    expect(second.body.instance.gone).toBe(false);
    expect(first.frame.location.nativeElement.textContent).toContain('Sheet');
  });

  it('leaves a panel where it was let go of away from any bar', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);

    dragBar(second.frame, { x: 20, y: 400 });

    expect(first.frame.instance.tabCount()).toBe(1);
    expect(second.frame.instance.tabCount()).toBe(1);
  });

  it('takes in every panel a frame was holding', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    const third = openFrame('Palette');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);
    place(third.frame, 800, 0);
    dragBar(third.frame, { x: 420, y: 14 });

    place(second.frame, 400, 0);
    dragBar(second.frame, { x: 20, y: 14 });

    expect(first.frame.instance.tabCount()).toBe(3);
  });

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

  it('names every panel it holds once it holds more than one', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    expect(first.frame.location.nativeElement.querySelector('[role="tablist"]')).toBeNull();

    fold(first.frame, second);

    const names = [...first.frame.location.nativeElement.querySelectorAll('[role="tab"] span')].map(
      (pill) => (pill as HTMLElement).textContent
    );
    expect(names).toEqual(['Chat', 'Sheet']);
  });

  it('moves the bodies down to make room for the names', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');

    fold(first.frame, second);

    expect(grounds(first.frame).map((ground) => ground.style.top)).toEqual(['56px', '56px']);
  });

  it('shows the panel whose name was pressed', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);

    const pill = first.frame.location.nativeElement.querySelector('[data-testid="panel-tab-0"]') as HTMLElement;
    pill.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    host.detectChanges();

    expect(first.frame.instance.activeIndex()).toBe(0);
  });

  it('puts away the panel whose name was cleared', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    fold(first.frame, second);

    const clear = first.frame.location.nativeElement.querySelector('[data-testid="panel-tab-clear-1"]') as HTMLElement;
    clear.click();
    host.detectChanges();

    expect(second.body.instance.gone).toBe(true);
    expect(first.frame.instance.tabCount()).toBe(1);
  });

  /** Carries a name out of the row and lets go of it somewhere on the screen. */
  function dragTabOut(frame: ComponentRef<UIPanelComponent>, index: number, to: { x: number; y: number }): void {
    const strip = frame.instance as unknown as {
      onTabGrabbed(): void;
      onTabDragged(at: { x: number; y: number }): void;
      onTabTakenOut(taken: { index: number; x: number; y: number }): void;
    };
    strip.onTabGrabbed();
    strip.onTabDragged(to);
    strip.onTabTakenOut({ index, ...to });
    host.detectChanges();
  }

  it('stands a panel dragged out of the row in a frame of its own', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);
    dragBar(second.frame, { x: 20, y: 14 });

    dragTabOut(first.frame, 1, { x: 600, y: 300 });

    expect(first.frame.instance.tabCount()).toBe(1);
    expect(second.body.instance.gone).toBe(false);
    expect(second.panel.isShow).toBe(true);
  });

  it('takes the emptied frame away when its last panel is pulled out', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);
    dragBar(second.frame, { x: 20, y: 14 });
    let standing = 1;
    first.frame.onDestroy(() => (standing -= 1));

    dragTabOut(first.frame, 0, { x: 600, y: 300 });
    dragTabOut(first.frame, 0, { x: 700, y: 300 });

    expect(standing).toBe(0);
  });

  it('puts a name back in the order it was dropped in', () => {
    const first = openFrame('Chat');
    const second = openFrame('Sheet');
    place(first.frame, 0, 0);
    place(second.frame, 400, 0);
    dragBar(second.frame, { x: 20, y: 14 });
    const strip = first.frame.instance as unknown as { onTabMoved(move: { from: number; to: number }): void };

    strip.onTabMoved({ from: 1, to: 0 });
    host.detectChanges();

    const names = [...first.frame.location.nativeElement.querySelectorAll('[role="tab"] span')].map(
      (pill) => (pill as HTMLElement).textContent
    );
    expect(names).toEqual(['Sheet', 'Chat']);
    expect(first.frame.instance.activeIndex()).toBe(0);
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
