import { TestBed } from '@angular/core/testing';
import { RenderStatsService } from '@axe/application/ui/render-stats.service';
import { perfCounters } from '@axe/core/util/perf-counters';

describe('RenderStatsService', () => {
  let service: RenderStatsService;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [RenderStatsService] });
    service = TestBed.inject(RenderStatsService);
  });

  afterEach(() => {
    service.stop();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('leaves the counters off until somebody opens the panel', () => {
    expect(perfCounters.enabled).toBe(false);

    service.start();

    expect(perfCounters.enabled).toBe(true);
  });

  it('reads back what was counted over the last second', () => {
    service.start();
    perfCounters.bump('visionScene');
    perfCounters.bump('visionScene');
    perfCounters.bump('visionScene');

    vi.advanceTimersByTime(1000);

    expect(service.stats().counters.get('visionScene')).toBe(3);
  });

  it('counts the next second on its own', () => {
    service.start();
    perfCounters.bump('visionScene');
    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(1000);

    expect(service.stats().counters.get('visionScene')).toBeUndefined();
  });

  it('keeps a running total across seconds until it is reset', () => {
    service.start();
    perfCounters.bump('visionScene');
    perfCounters.bump('visionScene');
    vi.advanceTimersByTime(1000);
    perfCounters.bump('visionScene');
    perfCounters.add('particles', 40);
    vi.advanceTimersByTime(1000);

    expect(service.totals().get('visionScene')).toBe(3);
    expect(service.totals().get('particles')).toBe(40);

    service.reset();

    expect(service.totals().size).toBe(0);
  });

  it('forgets the totals when the panel is closed', () => {
    service.start();
    perfCounters.bump('visionScene');
    vi.advanceTimersByTime(1000);
    service.stop();

    expect(service.totals().size).toBe(0);
  });

  it('stops counting when the panel is closed', () => {
    service.start();
    service.stop();

    expect(perfCounters.enabled).toBe(false);
    expect(service.watching()).toBe(false);
  });

  it('counts the terrain the table is showing', () => {
    const table = document.createElement('div');
    table.id = 'app-game-table';
    table.innerHTML = '<terrain><div><canvas></canvas></div></terrain><terrain><div></div></terrain>';
    document.body.appendChild(table);

    service.start();
    vi.advanceTimersByTime(1000);

    expect(service.stats().terrains).toBe(2);
    expect(service.stats().terrainCanvases).toBe(1);

    table.remove();
  });

  it('counts the terrain drawn together, and the surfaces it is drawn as', () => {
    const table = document.createElement('div');
    table.id = 'app-game-table';
    table.innerHTML =
      '<terrain></terrain><terrain-batch-layer data-merged="5"><div></div><div></div><div></div></terrain-batch-layer>';
    document.body.appendChild(table);

    service.start();
    vi.advanceTimersByTime(1000);

    expect(service.stats().terrains).toBe(1);
    expect(service.stats().mergedTerrains).toBe(5);
    expect(service.stats().mergedFaces).toBe(3);
    expect(service.stats().elementsPerTerrain).toBe(5 / 6);

    table.remove();
  });
});
