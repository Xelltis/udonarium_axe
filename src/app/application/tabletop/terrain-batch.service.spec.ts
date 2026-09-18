import { TestBed } from '@angular/core/testing';
import { TerrainBatchService } from '@axe/application/tabletop/terrain-batch.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
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
    expect(service.layout().squareCaps).toHaveLength(1);

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

  it('hands back the pieces a change leaves alone as the objects they were', async () => {
    wallAt(1, 1);
    wallAt(2, 1);
    const far = wallAt(15, 15);
    await settled();
    const before = service.layout();
    const nearCap = before.squareCaps.find((cap) => cap.left < 200)!;
    const nearWalls = before.squareWalls.filter((wall) => wall.startX < 200);

    far.location = { name: 'table', x: 16 * GRID, y: 15 * GRID };
    await settled();
    const after = service.layout();

    expect(after.squareCaps).toContain(nearCap);
    for (const wall of nearWalls) expect(after.squareWalls).toContain(wall);
    expect(after.squareCaps.find((cap) => cap.left > 200)).not.toBe(before.squareCaps.find((cap) => cap.left > 200));
  });

  it('shades a cap cell by cell from the light on the roof of each block', async () => {
    const lit = wallAt(3, 3);
    wallAt(4, 3);
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'terrainTopCover').mockImplementation((terrain) => ({
      cols: 1,
      rows: 1,
      cleared: [true],
      brightness: [terrain === lit ? 1 : 0.25],
    }));
    await settled();
    const [cap] = service.layout().squareCaps;

    expect(service.capShade(cap)).toEqual([
      [
        { at: 1, value: 1 },
        { at: 51, value: 1 },
        { at: 51, value: 0.25 },
      ],
    ]);
  });

  it('shades a wall by the way it faces and the light along it', async () => {
    const wall = wallAt(3, 3);
    const vision = TestBed.inject(VisionService);
    vi.spyOn(vision, 'terrainFogCover').mockReturnValue({ cols: 1, rows: 1, cleared: [true], brightness: [0.5] });
    await settled();
    const north = service.layout().squareWalls.find((one) => one.side === 'north')!;

    expect(service.wallShade(north)).toEqual([{ at: 0, value: 0.15 }]);

    wall.isSurfaceShading = false;
    await settled();

    expect(service.wallShade(service.layout().squareWalls.find((one) => one.side === 'north')!)).toEqual([
      { at: 0, value: 0.5 },
    ]);
  });

  it('reads the light on a hex block at its middle', async () => {
    const wall = wallAt(3, 3);
    const vision = TestBed.inject(VisionService);
    const top = vi.spyOn(vision, 'terrainTopBrightness').mockReturnValue(0.4);
    const walls = vi.spyOn(vision, 'terrainBrightness').mockReturnValue(0.7);
    await settled();

    expect(service.hexTopBrightness(wall.identifier)).toBe(0.4);
    expect(service.hexWallBrightness(wall.identifier)).toBe(0.7);
    expect(top).toHaveBeenCalledWith(wall, 175, 175, 25);
    expect(walls).toHaveBeenCalledWith(wall, 175, 175, 25);
  });
});
