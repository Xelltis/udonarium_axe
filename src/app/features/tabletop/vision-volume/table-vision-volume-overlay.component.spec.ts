import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PERF_VISION_VOLUME_PAINT, perfCounters } from '@axe/core/util/perf-counters';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { VisionShape } from '@axe/domain/tabletop/vision-shape';
import { TableVisionVolumeOverlayComponent } from '@axe/features/tabletop/vision-volume/table-vision-volume-overlay.component';
import { contextThatTakesAnything } from '@axe/testing/fake-canvas-context';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableVisionVolumeOverlayComponent', () => {
  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    await TestBed.configureTestingModule({
      imports: [TableVisionVolumeOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    vi.restoreAllMocks();
  });

  function darkTable(): GameTable {
    const table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = 50;
    table.darknessEnabled = true;
    table.initialize();
    return table;
  }

  it('draws nothing for a piece that was not asked to show its sight', () => {
    darkTable();
    const character = GameCharacter.create('見張り', 1, '');
    character.lightEnabled = true;
    character.lightDimRadius = 6;

    const fixture = TestBed.createComponent(TableVisionVolumeOverlayComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.volumes()).toHaveLength(0);
  });

  it('draws a wire shape for a piece that was', () => {
    darkTable();
    const character = GameCharacter.create('見張り', 1, '');
    character.lightEnabled = true;
    character.lightDimRadius = 6;
    character.showVisionRange = true;
    character.visionShape = VisionShape.CONE;

    const fixture = TestBed.createComponent(TableVisionVolumeOverlayComponent);
    fixture.detectChanges();

    const volumes = fixture.componentInstance.volumes();
    expect(volumes).toHaveLength(1);
    expect(volumes[0].rings.length).toBeGreaterThan(0);
    expect(volumes[0].ribs.length).toBeGreaterThan(0);
    expect(volumes[0].rings[0].clipPath).not.toBeNull();
  });

  describe('the tint on the floor', () => {
    function watcherOn(table: GameTable): GameCharacter {
      const character = GameCharacter.create('見張り', 1, '');
      character.showVisionRange = true;
      character.visionRange = 4;
      character.lightEnabled = true;
      character.lightDimRadius = 6;
      table.appendChild(character);
      return character;
    }

    function seeing(grid: CellGrid, seen: number[]): CellBits {
      const cells = new CellBits(cellCount(grid));
      for (const cell of seen) cells.set(cell);
      return cells;
    }

    it('paints again only when the cells it tints or the board they lie on change', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        contextThatTakesAnything() as unknown as never
      );
      const table = darkTable();
      watcherOn(table);
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const shared = signal<{ grid: CellGrid; cells: CellBits }>({ grid, cells: seeing(grid, [0, 1]) });
      const seenByPiece = signal(seeing(grid, [0, 1]));
      TestBed.overrideProvider(VisionService, {
        useValue: {
          sharedVisibleCells: shared,
          visibleCellsOf: () => ({ cells: seenByPiece() }),
          isTokenVisible: () => true,
        },
      });

      const fixture = TestBed.createComponent(TableVisionVolumeOverlayComponent);
      perfCounters.enabled = true;
      perfCounters.clear();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(perfCounters.drain().get(PERF_VISION_VOLUME_PAINT)).toBe(1);

      const terrain = Terrain.create('crate', 1, 1, 1, '', '');
      table.appendChild(terrain);
      await Promise.resolve();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(perfCounters.drain().get(PERF_VISION_VOLUME_PAINT) ?? 0).toBe(0);

      seenByPiece.set(seeing(grid, [0, 1, 2]));
      fixture.detectChanges();
      await fixture.whenStable();
      expect(perfCounters.drain().get(PERF_VISION_VOLUME_PAINT)).toBe(1);

      perfCounters.enabled = false;
      perfCounters.clear();
    });

    it('leaves no box the size of the board once there is nothing to tint', async () => {
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        contextThatTakesAnything() as unknown as never
      );
      const table = darkTable();
      watcherOn(table);
      const grid = cellGridOf(20, 20, 50, GridType.SQUARE);
      const shared = signal<{ grid: CellGrid; cells: CellBits } | null>({ grid, cells: seeing(grid, [0, 1]) });
      const seenByPiece = signal<CellBits | null>(seeing(grid, [0, 1]));
      TestBed.overrideProvider(VisionService, {
        useValue: {
          sharedVisibleCells: shared,
          visibleCellsOf: () => ({ cells: seenByPiece() }),
          isTokenVisible: () => true,
        },
      });

      const fixture = TestBed.createComponent(TableVisionVolumeOverlayComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      const canvas = (fixture.nativeElement as HTMLElement).querySelector('canvas');
      expect(canvas?.style.width).toBe('1000px');

      shared.set(null);
      seenByPiece.set(null);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(canvas?.style.width).toBe('');
      expect(canvas?.style.height).toBe('');
      expect(canvas?.width).toBe(0);
    });
  });
});
