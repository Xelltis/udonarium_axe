import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits, encodeCellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexAt } from '@axe/domain/tabletop/fog/cell-grid';
import { ensureFogMemoryOn } from '@axe/domain/tabletop/fog/fog-memory';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { LightSource } from '@axe/domain/tabletop/light-source';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The throttle the service puts on a change before it acts on it. */
const GEOMETRY_THROTTLE = 50;
const GRID_SIZE = 50;
const HALF = GRID_SIZE / 2;
const COLS = 12;
const ROWS = 12;

type Point = readonly [number, number];

interface Layout {
  eye: Point;
  lamp: Point;
  wall: Point;
  boundaryPoints: readonly Point[];
}

/**
 * Whole-pixel points that sit exactly on the line between two hex cells, where only the order the
 * old scan looked at its candidates decided which cell a point belonged to.
 */
const FLAT_TOP_LAYOUT: Layout = {
  eye: [32, 450],
  lamp: [52, 100],
  wall: [50, 150],
  boundaryPoints: [
    [32, 450],
    [44, 300],
    [46, 150],
    [52, 100],
    [87, 25],
    [89, 325],
  ],
};

const POINTY_TOP_LAYOUT: Layout = {
  eye: [25, 161],
  lamp: [25, 101],
  wall: [75, 100],
  boundaryPoints: [
    [25, 101],
    [25, 161],
    [25, 185],
    [25, 246],
    [25, 249],
    [25, 252],
  ],
};

describe('what a player sees on a hex table, with eyes and lamps on cell boundaries', () => {
  let service: VisionService;
  let store: ObjectStore;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS, VisionService] });
    store = ObjectStore.instance;
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    service = TestBed.inject(VisionService);
  });

  afterEach(() => {
    store.getObjects().forEach((obj) => store.delete(obj, false));
    store.clearDeleteHistory();
    PeerCursor.myCursor = null!;
    vi.useRealTimers();
  });

  function becomePlayer(): void {
    const cursor = new PeerCursor();
    cursor.userId = 'p1';
    cursor.role = PeerRole.Player;
    cursor.initialize();
    PeerCursor.myCursor = cursor;
  }

  async function settle(): Promise<void> {
    for (let round = 0; round < 3; round++) {
      await vi.advanceTimersByTimeAsync(GEOMETRY_THROTTLE);
      service.scene();
    }
  }

  function buildTable(gridType: GridType, layout: Layout): Terrain {
    becomePlayer();
    const table = new GameTable();
    table.width = COLS;
    table.height = ROWS;
    table.gridSize = GRID_SIZE;
    table.gridType = gridType;
    table.darknessEnabled = true;
    table.fogEnabled = true;
    table.initialize();

    const grid = cellGridOf(COLS, ROWS, GRID_SIZE, gridType);
    const explored = new CellBits(cellCount(grid));
    for (let index = 0; index < explored.count; index++) explored.set(index);
    ensureFogMemoryOn(table).write(grid, explored);

    const wall = Terrain.create('wall', 1, 1, 1, 'wall.png', 'floor.png');
    wall.location.x = layout.wall[0];
    wall.location.y = layout.wall[1];
    table.appendChild(wall);

    const lamp = LightSource.create('torch');
    lamp.lightBrightRadius = 2;
    lamp.lightDimRadius = 5;
    lamp.location.x = layout.lamp[0] - HALF;
    lamp.location.y = layout.lamp[1] - HALF;
    table.appendChild(lamp);

    const pc = GameCharacter.create('PC', 1, '');
    pc.owner = 'p1';
    pc.visionRange = 6;
    pc.location.x = layout.eye[0] - HALF;
    pc.location.y = layout.eye[1] - HALF;
    table.appendChild(pc);
    return wall;
  }

  it('stays the same on a flat-topped table', async () => {
    const wall = buildTable(GridType.HEX_VERTICAL, FLAT_TOP_LAYOUT);
    await settle();

    const shared = service.sharedVisibleCells()!;
    expect(encodeCellBits(shared.cells)).toMatchInlineSnapshot(`"czAHe7AHczAAAQAAAAAAAAAA"`);
    expect(FLAT_TOP_LAYOUT.boundaryPoints.map(([x, y]) => cellIndexAt(shared.grid, x, y))).toMatchInlineSnapshot(`
      [
        97,
        61,
        25,
        13,
        2,
        74,
      ]
    `);
    expect(service.terrainFogCover(wall)?.brightness).toMatchInlineSnapshot(`
      [
        0.07999999999999996,
      ]
    `);
  });

  it('stays the same on a pointy-topped table', async () => {
    const wall = buildTable(GridType.HEX_HORIZONTAL, POINTY_TOP_LAYOUT);
    await settle();

    const shared = service.sharedVisibleCells()!;
    expect(encodeCellBits(shared.cells)).toMatchInlineSnapshot(`"DzAAAzAAA3AAD3AAAwAAAAAA"`);
    expect(POINTY_TOP_LAYOUT.boundaryPoints.map(([x, y]) => cellIndexAt(shared.grid, x, y))).toMatchInlineSnapshot(`
      [
        24,
        48,
        48,
        72,
        72,
        72,
      ]
    `);
    expect(service.terrainFogCover(wall)?.brightness).toMatchInlineSnapshot(`
      [
        1,
      ]
    `);
  });
});
