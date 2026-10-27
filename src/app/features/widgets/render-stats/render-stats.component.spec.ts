import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WidgetVisibilityService } from '@axe/application/ui/widget-visibility.service';
import { perfCounters } from '@axe/core/util/perf-counters';
import { RenderStatsComponent } from '@axe/features/widgets/render-stats/render-stats.component';
import { RenderStatsService } from '@axe/features/widgets/render-stats/render-stats.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

interface ComponentInternals {
  close: () => void;
}

describe('RenderStatsComponent', () => {
  let fixture: ComponentFixture<RenderStatsComponent>;
  let widgets: WidgetVisibilityService;

  function panel(): HTMLElement | null {
    return fixture.nativeElement.querySelector('dl');
  }

  beforeEach(async () => {
    localStorage.removeItem('ui-widgets');
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    widgets = TestBed.inject(WidgetVisibilityService);
    fixture = TestBed.createComponent(RenderStatsComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    widgets.renderStats.set(false);
    TestBed.inject(RenderStatsService).stop();
    TestBed.resetTestingModule();
  });

  it('stays out of the way until it is asked for', () => {
    expect(panel()).toBeNull();
    expect(perfCounters.enabled).toBe(false);
  });

  it('starts counting once it is on screen', async () => {
    widgets.renderStats.set(true);
    await fixture.whenStable();

    expect(panel()).not.toBeNull();
    expect(perfCounters.enabled).toBe(true);
  });

  it('stops counting when it is closed', async () => {
    widgets.renderStats.set(true);
    await fixture.whenStable();

    (fixture.componentInstance as unknown as ComponentInternals).close();
    await fixture.whenStable();

    expect(panel()).toBeNull();
    expect(perfCounters.enabled).toBe(false);
  });
});
