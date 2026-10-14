import { TestBed } from '@angular/core/testing';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { WaterService } from '@axe/application/tabletop/water.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('WaterService', () => {
  const gridSize = 50;
  let service: WaterService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = gridSize;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(WaterService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  async function lay(
    kind: 'water' | 'swamp',
    col: number,
    row: number,
    cols: number,
    rows: number
  ): Promise<TableAmbience> {
    const area = TableAmbience.create(kind, kind, cols, rows);
    area.location = { name: 'table', x: col * gridSize, y: row * gridSize };
    table.appendChild(area);
    await Promise.resolve();
    await Promise.resolve();
    return area;
  }

  it('reads only the areas laid as water', async () => {
    const pond = await lay('water', 1, 1, 2, 2);
    await lay('swamp', 5, 5, 2, 2);

    expect(service.areas().map((area) => area.identifier)).toEqual([pond.identifier]);
  });

  it('stands the surface over the floor by the height of the water', async () => {
    const pond = await lay('water', 1, 1, 2, 2);
    pond.posZ = 10;
    pond.surfaceHeight = 2;

    const [area] = service.areas();

    expect(area.floorPx).toBe(10);
    expect(area.surfacePx).toBe(10 + 2 * gridSize);
  });

  it('finds the water under a point', async () => {
    await lay('water', 1, 1, 2, 2);

    expect(service.waterAt(1.5 * gridSize, 1.5 * gridSize)).not.toBeNull();
    expect(service.waterAt(4.5 * gridSize, 4.5 * gridSize)).toBeNull();
  });

  it('keeps the water on ground nobody has walked to hidden with the rest of that ground', async () => {
    await lay('water', 0, 0, 4, 1);
    vi.spyOn(TestBed.inject(VisionService), 'isHiddenByFog').mockImplementation((x) => x > 2 * gridSize);

    expect(service.cells().size).toBe(2);
  });

  it('stands the water on the ground risen under it, and leaves ground risen to the surface dry', async () => {
    const pond = await lay('water', 0, 0, 4, 1);
    pond.surfaceHeight = 2;
    const shelf = Terrain.create('浜', 1, 1, 1, '', '');
    shelf.location = { name: 'table', x: gridSize, y: 0 };
    const beach = Terrain.create('浜', 1, 1, 3, '', '');
    beach.location = { name: 'table', x: 2 * gridSize, y: 0 };
    table.appendChild(shelf);
    table.appendChild(beach);
    await Promise.resolve();
    await Promise.resolve();

    const cells = service.cells();

    expect(cells.get(0)).toMatchObject({ floorPx: 0, flat: true });
    expect(cells.get(1)).toMatchObject({ floorPx: gridSize, flat: false });
    expect(cells.has(2)).toBe(false);
    expect(service.groundOf(2)).toBe(3 * gridSize);
  });

  it('hands on the same water while what changed leaves it as it was', async () => {
    const pond = await lay('water', 1, 1, 2, 2);
    const areas = service.areas();
    const before = service.cells();

    pond.name = '池';
    await Promise.resolve();
    await Promise.resolve();
    expect(service.areas()).not.toBe(areas);
    expect(service.cells()).toBe(before);

    pond.surfaceHeight = 2;
    await Promise.resolve();
    await Promise.resolve();
    expect(service.cells()).not.toBe(before);
  });

  it('reads no light while the table has no darkness', async () => {
    await lay('water', 1, 1, 2, 2);
    expect(service.light()).toBeNull();
  });
});
