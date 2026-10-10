import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EffectPlaybackService } from '@axe/application/effect/effect-playback.service';
import { CoordinateService } from '@axe/application/input/coordinate.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { RenderLiteService } from '@axe/application/ui/render-lite.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableWeatherOverlayComponent } from '@axe/features/tabletop/table-weather-overlay/table-weather-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import type { MockInstance } from 'vitest';

describe('TableWeatherOverlayComponent', () => {
  let fixture: ComponentFixture<TableWeatherOverlayComponent>;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TableWeatherOverlayComponent],
      providers: [...TEST_PROVIDERS, TabletopService],
    });

    table = new GameTable();
    table.initialize();
    TableSelecter.instance.viewTableIdentifier = table.identifier;

    // What the particles look like is settled by the domain specs. This watches only the
    // placement, so it never takes hold of a 2D context, which differs between runtimes.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);

    fixture = TestBed.createComponent(TableWeatherOverlayComponent);
  });

  afterEach(() => {
    ObjectStore.instance.remove(table);
    vi.restoreAllMocks();
  });

  function element(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('draws nothing without weather', () => {
    fixture.detectChanges();

    expect(element().querySelectorAll('div')).toHaveLength(0);
    expect(element().querySelectorAll('effect-canvas')).toHaveLength(0);
  });

  it('lays a full-screen wash under the chosen weather', () => {
    table.weatherKind = 'fog';
    fixture.detectChanges();

    const wash = element().querySelector<HTMLElement>('div');
    expect(wash).not.toBeNull();
    expect(wash!.style.background.length).toBeGreaterThan(0);
  });

  it('draws no particles before it knows its size', () => {
    // Drawing before the observer has run would make a canvas no pixels wide.
    table.weatherKind = 'rain';
    fixture.detectChanges();

    expect(element().querySelectorAll('effect-canvas')).toHaveLength(0);
  });

  it('draws them once the size is known', () => {
    table.weatherKind = 'rain';
    fixture.componentInstance['size'].set({ width: 1280, height: 720 });
    fixture.detectChanges();

    expect(element().querySelectorAll('effect-canvas')).toHaveLength(1);
  });

  it('takes a change of weather after it has drawn', async () => {
    fixture.detectChanges();
    expect(element().querySelectorAll('div')).toHaveLength(0);

    table.weatherKind = 'fog';
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();

    expect(element().querySelector<HTMLElement>('div')?.style.background.length).toBeGreaterThan(0);
  });

  describe('how far it falls', () => {
    it('masks nothing without weather', () => {
      fixture.detectChanges();
      expect(fixture.componentInstance.maskImage()).toBe('none');
    });

    it('masks nothing before it knows where the board is', () => {
      // Projected before the board is laid out, it collapses onto the origin.
      table.weatherKind = 'rain';
      fixture.detectChanges();
      expect(fixture.componentInstance.maskImage()).toBe('none');
    });
  });

  describe('how often it looks at the view again', () => {
    let playback: EffectPlaybackService;
    let coordinates: CoordinateService;
    let project: MockInstance<CoordinateService['convertManyToGlobal']>;

    beforeEach(() => {
      playback = TestBed.inject(EffectPlaybackService);
      coordinates = TestBed.inject(CoordinateService);
      TestBed.inject(RenderLiteService).setting.set('off');
      coordinates.tabletopOriginElement = document.createElement('div');
      project = vi
        .spyOn(coordinates, 'convertManyToGlobal')
        .mockImplementation((points) => points.map((point) => ({ x: point.x, y: point.y, z: 0 })));
      table.weatherKind = 'rain';
    });

    afterEach(() => {
      coordinates.tabletopOriginElement = document.body;
      document.documentElement.classList.remove('render-lite');
    });

    function runTo(ms: number): string {
      playback.now.set(ms);
      return fixture.componentInstance.maskImage();
    }

    it('projects a view that stands still once a second, not once a tick', () => {
      expect(runTo(0)).not.toBe('none');
      for (let ms = 16; ms < 1000; ms += 16) runTo(ms);
      expect(project).toHaveBeenCalledTimes(1);

      runTo(1000);
      expect(project).toHaveBeenCalledTimes(2);
    });

    it('projects a view that has been written out at the next tick', () => {
      runTo(0);
      coordinates.invalidateTabletopTransform();

      runTo(50);
      expect(project).toHaveBeenCalledTimes(1);

      runTo(100);
      expect(project).toHaveBeenCalledTimes(2);
    });

    it('follows a turning camera less often while the table is drawn the lighter way', () => {
      TestBed.inject(RenderLiteService).setting.set('on');

      for (let ms = 0; ms < 1200; ms += 16) {
        coordinates.invalidateTabletopTransform();
        runTo(ms);
      }

      expect(project).toHaveBeenCalledTimes(3);
    });
  });

  it('stays behind the panels', () => {
    // The panels set no stacking order, so weather that has one would cover them.
    const host = fixture.nativeElement as HTMLElement;
    expect(host.className).not.toMatch(/(^|\s)z-/);
    expect(host.style.zIndex).toBe('');
  });

  it('leaves no drawing loop running behind it', () => {
    const playback = TestBed.inject(EffectPlaybackService);
    const spy = vi.spyOn(playback, 'setPersistent');

    table.weatherKind = 'snow';
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('ambience', true);
  });
});
