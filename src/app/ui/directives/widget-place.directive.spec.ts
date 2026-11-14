import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WidgetLayoutService } from '@axe/application/ui/widget-layout.service';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { topRightFallback, WidgetPlaceDirective } from '@axe/ui/directives/widget-place.directive';

@Component({
  imports: [DraggableDirective, WidgetPlaceDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown()) {
      <div
        class="fixed top-0 left-0"
        appDraggable
        [appWidgetPlace]="'probe'"
        [widgetFallback]="fallback"
        [widgetPlaceEnabled]="enabled()"
      ></div>
    }
  `,
})
class HostComponent {
  readonly shown = signal(true);
  readonly enabled = signal(true);
  readonly fallback = () => ({ left: 300, top: 40 });
}

describe('WidgetPlaceDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let layout: WidgetLayoutService;

  beforeEach(() => {
    localStorage.removeItem('ui-widget-layout');
    TestBed.configureTestingModule({ imports: [HostComponent] });
    layout = TestBed.inject(WidgetLayoutService);
  });

  afterEach(() => {
    localStorage.removeItem('ui-widget-layout');
    TestBed.resetTestingModule();
  });

  async function render(): Promise<void> {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function box(): HTMLElement | null {
    return fixture.nativeElement.querySelector('div');
  }

  function draggable(): DraggableDirective {
    return fixture.debugElement.query(By.directive(DraggableDirective)).injector.get(DraggableDirective);
  }

  it('puts the widget where the fallback says when nothing is remembered', async () => {
    await render();
    expect(box()!.style.left).toBe('300px');
    expect(box()!.style.top).toBe('40px');
  });

  it('puts the widget back where it was remembered', async () => {
    layout.remember('probe', { left: 120, top: 90 });
    await render();
    expect(box()!.style.left).toBe('120px');
    expect(box()!.style.top).toBe('90px');
  });

  it('writes the spot down when a drag ends and when the window settles', async () => {
    await render();
    box()!.style.left = '77px';
    box()!.style.top = '66px';
    draggable().onend.emit(new MouseEvent('mouseup'));
    expect(layout.spotOf('probe')).toEqual({ left: 77, top: 66 });

    box()!.style.left = '55px';
    draggable().onsettle.emit();
    expect(layout.spotOf('probe')).toEqual({ left: 55, top: 66 });
  });

  it('writes the spot down when the widget goes away', async () => {
    await render();
    box()!.style.left = '210px';
    box()!.style.top = '32px';
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(layout.spotOf('probe')).toEqual({ left: 210, top: 32 });
  });

  it('leaves the remembered spot alone when placing is switched off', async () => {
    layout.remember('probe', { left: 120, top: 90 });
    await render();

    box()!.style.left = '0px';
    box()!.style.top = '480px';
    fixture.componentInstance.enabled.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(layout.spotOf('probe')).toEqual({ left: 120, top: 90 });
  });

  it('neither places nor remembers while switched off', async () => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.enabled.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(box()!.style.left).not.toBe('300px');

    draggable().onend.emit(new MouseEvent('mouseup'));
    fixture.componentInstance.shown.set(false);
    fixture.detectChanges();
    expect(layout.spotOf('probe')).toBeNull();
  });
});

describe('topRightFallback()', () => {
  const widget = (width: number) => ({ offsetWidth: width }) as HTMLElement;

  it('stands a widget at the right of the window, a gap in, at the height given', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000);

    expect(topRightFallback(96)(widget(200))).toEqual({ left: 792, top: 96 });
    vi.restoreAllMocks();
  });

  it('keeps a widget wider than the window off its left edge', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(100);

    expect(topRightFallback(8)(widget(200))).toEqual({ left: 8, top: 8 });
    vi.restoreAllMocks();
  });
});
