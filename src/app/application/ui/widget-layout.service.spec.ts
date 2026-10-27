import { TestBed } from '@angular/core/testing';
import { parseWidgetLayout, WidgetLayoutService } from '@axe/application/ui/widget-layout.service';
import { refuseLocalStorage } from '@axe/testing/refused-storage';

const STORAGE_KEY = 'ui-widget-layout';

describe('parseWidgetLayout()', () => {
  it('starts empty with nothing saved', () => {
    expect(parseWidgetLayout(null)).toEqual({});
    expect(parseWidgetLayout('{')).toEqual({});
    expect(parseWidgetLayout('null')).toEqual({});
  });

  it('keeps only what reads as a position', () => {
    const layout = parseWidgetLayout(
      JSON.stringify({
        clock: { left: 10, top: 20 },
        broken: { left: 'ひだり', top: 20 },
        partial: { left: 10 },
        wild: { left: Number.NaN, top: 0 },
      })
    );

    expect(layout).toEqual({ clock: { left: 10, top: 20 } });
  });
});

describe('WidgetLayoutService', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(STORAGE_KEY);
  });

  it('returns nothing until something is remembered', () => {
    expect(TestBed.inject(WidgetLayoutService).spotOf('clock')).toBeNull();
  });

  it('carries a position over to the next time it opens', () => {
    TestBed.inject(WidgetLayoutService).remember('clock', { left: 240.4, top: 120.6 });

    TestBed.resetTestingModule();
    expect(TestBed.inject(WidgetLayoutService).spotOf('clock')).toEqual({ left: 240, top: 121 });
  });

  it('remembers each widget separately', () => {
    const service = TestBed.inject(WidgetLayoutService);
    service.remember('clock', { left: 10, top: 20 });
    service.remember('connectionQuality', { left: 30, top: 40 });

    expect(service.spotOf('clock')).toEqual({ left: 10, top: 20 });
    expect(service.spotOf('connectionQuality')).toEqual({ left: 30, top: 40 });
  });

  it('refuses a position that does not read as numbers', () => {
    const service = TestBed.inject(WidgetLayoutService);
    service.remember('clock', { left: Number.NaN, top: 0 });
    expect(service.spotOf('clock')).toBeNull();
  });

  it('can be made to forget', () => {
    const service = TestBed.inject(WidgetLayoutService);
    service.remember('clock', { left: 10, top: 20 });
    service.forget('clock');

    expect(service.spotOf('clock')).toBeNull();
    expect(TestBed.inject(WidgetLayoutService).spotOf('clock')).toBeNull();
  });

  it('pulls a position that fell off screen back into view', () => {
    const service = TestBed.inject(WidgetLayoutService);
    const spot = service.keepInView({ left: 99_999, top: -50 }, 100, 40);

    expect(spot.left).toBe(window.innerWidth - 100 - 8);
    expect(spot.top).toBe(8);
  });

  it('leaves a position that still fits alone', () => {
    expect(TestBed.inject(WidgetLayoutService).keepInView({ left: 40, top: 60 }, 100, 40)).toEqual({
      left: 40,
      top: 60,
    });
  });

  it('still moves a widget where the browser refuses to keep where it was left', () => {
    TestBed.resetTestingModule();
    refuseLocalStorage();
    const service = TestBed.inject(WidgetLayoutService);

    service.remember('clock', { left: 10, top: 20 });
    expect(service.spotOf('clock')).toEqual({ left: 10, top: 20 });
    service.forget('clock');
    expect(service.spotOf('clock')).toBeNull();
  });
});
