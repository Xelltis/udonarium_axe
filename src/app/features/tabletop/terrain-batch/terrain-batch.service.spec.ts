import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainBatchService } from '@axe/features/tabletop/terrain-batch/terrain-batch.service';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;

describe('TerrainBatchService', () => {
  let service: TerrainBatchService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TerrainBatchService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function wallAt(col: number, row: number): Terrain {
    const terrain = Terrain.create('壁', 1, 1, 2, 'wall.png', 'floor.png');
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    terrain.isLocked = true;
    terrain.isTiledTexture = true;
    table.appendChild(terrain);
    return terrain;
  }

  /** Lets the change announcements of the last edits arrive, which is when the versions rise. */
  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('draws locked walls together, and a wall alone again once it is unlocked', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();

    expect([...service.mergedTerrains()].sort()).toEqual([west.identifier, east.identifier].sort());

    east.isLocked = false;
    await settled();

    expect([...service.mergedTerrains()]).toEqual([west.identifier]);
  });

  it('draws a selected wall alone, so it can be shown as selected', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();

    TestBed.inject(SelectionSignalService).replaceSelection([east.identifier]);

    expect([...service.mergedTerrains()]).toEqual([west.identifier]);
  });

  it('draws alone a wall the fog has left only part of', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'terrainFogCover').mockImplementation((terrain) => ({
      cols: 1,
      rows: 1,
      cleared: [terrain !== east],
      brightness: [1],
    }));
    await settled();

    expect([...service.mergedTerrains()]).toEqual([west.identifier]);
  });
});
