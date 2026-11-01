import { TestBed } from '@angular/core/testing';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TablePickService } from '@axe/application/tabletop/table-pick.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { DEFAULT_TABLE_CAMERA_VIEW, pageOfTablePoint, TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GRID = 50;
const layout: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 1000 };

describe('TablePickService', () => {
  let service: TablePickService;
  let camera: TableCameraService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    camera = TestBed.inject(TableCameraService);
    camera.setLayout(layout);
    camera.showView(DEFAULT_TABLE_CAMERA_VIEW);
    service = TestBed.inject(TablePickService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function blockAt(col: number, row: number, height = 2): Terrain {
    const terrain = Terrain.create('block', 1, 1, height, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    table.appendChild(terrain);
    return terrain;
  }

  /** Where the middle of a cell's top is drawn on the page. */
  function onPage(col: number, row: number, z: number): { x: number; y: number } {
    return pageOfTablePoint(camera.sceneMatrix()!, (col + 0.5) * GRID, (row + 0.5) * GRID, z);
  }

  async function settled(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('lands on the block drawn at a point of the page, and on nothing beside it', async () => {
    const block = blockAt(5, 5);
    await settled();
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
    const bare = onPage(12, 12, 0);
    expect(service.pickAt(bare.x, bare.y)).toBeNull();
  });

  it('puts the nearer of two blocks on one line of sight first', async () => {
    const near = blockAt(5, 6, 6);
    const far = blockAt(5, 5, 1);
    await settled();
    // The camera looks from the south, so a tall block just south of a low one hides it.
    const hidden = onPage(5, 5, GRID);
    expect(service.allAt(hidden.x, hidden.y).map((hit) => hit.target.id)).toEqual([near.identifier, far.identifier]);
  });

  it('builds a block over again once it has moved', async () => {
    const block = blockAt(5, 5);
    await settled();
    const first = service.targets()[0];
    expect(service.targets()[0]).toBe(first);

    block.location = { name: 'table', x: 8 * GRID, y: 5 * GRID };
    await settled();
    expect(service.targets()[0]).not.toBe(first);
    const top = onPage(8, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)?.target.id).toBe(block.identifier);
  });

  it('leaves out a block the fog lies over entirely', async () => {
    const block = blockAt(5, 5);
    await settled();
    const cover: TerrainFogCover = { cols: 1, rows: 1, cleared: [false] } as unknown as TerrainFogCover;
    vi.spyOn(TestBed.inject(VisionService), 'terrainFogCover').mockReturnValue(cover);
    const top = onPage(5, 5, 2 * GRID);
    expect(service.pickAt(top.x, top.y)).toBeNull();
    expect(block.identifier).toBeTruthy();
  });

  it('has nothing to say before the table has a camera', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    expect(TestBed.inject(TablePickService).pickAt(100, 100)).toBeNull();
  });
});
