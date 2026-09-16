import { TestBed } from '@angular/core/testing';
import { TerrainOcclusionService } from '@axe/application/tabletop/terrain-occlusion.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const GRID = 50;

describe('TerrainOcclusionService', () => {
  let service: TerrainOcclusionService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(TerrainOcclusionService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function wallAt(col: number, row: number): Terrain {
    const terrain = Terrain.create('壁', 1, 1, 2, 'wall.png', 'floor.png');
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    terrain.isLocked = true;
    table.appendChild(terrain);
    return terrain;
  }

  /** Lets the change announcements of the last edits arrive, which is when the versions rise. */
  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('hides the sides two walls press together', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();

    expect([...service.hiddenFacesFor(west.identifier)]).toEqual(['east']);
    expect([...service.hiddenFacesFor(east.identifier)]).toEqual(['west']);
  });

  it('shows a side again once the wall against it is taken away', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();
    expect(service.hiddenFacesFor(west.identifier).size).toBe(1);

    east.destroy();
    await settled();

    expect(service.hiddenFacesFor(west.identifier).size).toBe(0);
  });

  it('shows a side again once the wall against it is unlocked, and so may be moved away', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();

    east.isLocked = false;
    await settled();

    expect(service.hiddenFacesFor(west.identifier).size).toBe(0);
  });

  it('shows a side again once the wall against it is moved away', async () => {
    const west = wallAt(3, 3);
    const east = wallAt(4, 3);
    await settled();

    east.location = { name: 'table', x: 6 * GRID, y: 3 * GRID };
    await settled();

    expect(service.hiddenFacesFor(west.identifier).size).toBe(0);
  });

  it('answers a wall with nothing hidden with one shared empty set', async () => {
    const lone = wallAt(1, 1);
    const other = wallAt(8, 8);
    await settled();

    expect(service.hiddenFacesFor(lone.identifier)).toBe(service.hiddenFacesFor(other.identifier));
  });
});
