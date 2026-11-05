import { TestBed } from '@angular/core/testing';
import { TableVeilService } from '@axe/application/tabletop/table-veil.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableFogAirOverlayComponent } from '@axe/features/tabletop/fog-of-war/table-fog-air-overlay.component';
import { FOG_AIR_LAYER_COUNT } from '@axe/infrastructure/tabletop/fog/fog-air-layers';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableFogAirOverlayComponent', () => {
  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    await TestBed.configureTestingModule({
      imports: [TableFogAirOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  function table(fogEnabled: boolean): GameTable {
    const built = new GameTable();
    built.width = 20;
    built.height = 20;
    built.gridSize = 50;
    built.fogEnabled = fogEnabled;
    built.initialize();
    return built;
  }

  it('hangs nothing in the air over a table with no fog on it', () => {
    table(false);
    const fixture = TestBed.createComponent(TableFogAirOverlayComponent);
    fixture.detectChanges();
    expect(fixture.componentInstance.sheets()).toHaveLength(0);
  });

  it('hands the sheets it paints over to a table drawn on a canvas, out of sight, and takes them back when it goes', () => {
    table(true);
    const fixture = TestBed.createComponent(TableFogAirOverlayComponent);
    fixture.detectChanges();
    TestBed.tick();
    const veil = TestBed.inject(TableVeilService);

    expect(veil.fogAir()).toHaveLength(FOG_AIR_LAYER_COUNT);
    expect(veil.fogAir()[0].heightPx).toBeLessThan(veil.fogAir()[1].heightPx);
    const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas')!;
    expect(canvas.classList.contains('invisible')).toBe(true);

    fixture.destroy();
    expect(veil.fogAir()).toHaveLength(0);
  });

  it('hangs a sheet for each layer once the fog is on', () => {
    table(true);
    const fixture = TestBed.createComponent(TableFogAirOverlayComponent);
    fixture.detectChanges();
    const sheets = fixture.componentInstance.sheets();
    expect(sheets).toHaveLength(FOG_AIR_LAYER_COUNT);
    expect(sheets[0].style['animation-name']).toBe('fogDrift');
  });
});
