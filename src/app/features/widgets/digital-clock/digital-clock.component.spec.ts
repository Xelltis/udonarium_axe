import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { WidgetLayoutService } from '@axe/application/ui/widget-layout.service';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { DigitalClockComponent } from '@axe/features/widgets/digital-clock/digital-clock.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { DraggableDirective } from '@axe/ui/directives/draggable.directive';
import { beforeEach, describe, expect, it } from 'vitest';

describe('DigitalClockComponent', () => {
  let fixture: ComponentFixture<DigitalClockComponent>;
  let component: DigitalClockComponent;
  let widgets: WidgetVisibilityService;

  function clock(): HTMLElement | null {
    return fixture.nativeElement.querySelector('.digital-clock');
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.removeItem('ui-widget-layout');
  });

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DigitalClockComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    fixture = TestBed.createComponent(DigitalClockComponent);
    component = fixture.componentInstance;
    widgets = TestBed.inject(WidgetVisibilityService);
  });

  it('writes down where it was dragged to as soon as the drag ends, not when it closes', async () => {
    widgets.clock.set(true);
    await render();
    const layout = TestBed.inject(WidgetLayoutService);
    const element = clock()!;
    element.style.left = '321px';
    element.style.top = '123px';

    fixture.debugElement
      .query(By.directive(DraggableDirective))
      .injector.get(DraggableDirective)
      .onend.emit(new MouseEvent('mouseup'));
    await fixture.whenStable();

    expect(layout.spotOf('clock')).toEqual({ left: 321, top: 123 });
  });

  it('draws nothing while it is switched off', async () => {
    widgets.clock.set(false);
    await render();

    expect(clock()).toBeNull();
  });

  it('shows the time and the date once it is switched on', async () => {
    widgets.clock.set(true);
    await render();

    const el = clock();
    expect(el).not.toBeNull();
    expect(el!.textContent).toContain(component['parts']().hoursMinutes);
    expect(el!.textContent).toContain(component['parts']().date);
  });

  it('switches it off from the close button', async () => {
    widgets.clock.set(true);
    await render();

    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'close')!
      .click();
    await render();

    expect(widgets.clock()).toBe(false);
    expect(clock()).toBeNull();
  });

  it('comes back where it was dragged to', async () => {
    widgets.clock.set(true);
    await render();

    const el = clock();
    expect(el).not.toBeNull();
    el!.style.left = '240px';
    el!.style.top = '120px';

    widgets.clock.set(false);
    await render();
    widgets.clock.set(true);
    await render();

    const restored = clock();
    expect(restored).not.toBeNull();
    expect(restored!.style.left).toBe('240px');
    expect(restored!.style.top).toBe('120px');
  });
});
