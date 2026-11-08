import { TestBed } from '@angular/core/testing';
import { GroundService } from '@axe/application/tabletop/ground.service';
import { StandingGroundService } from '@axe/application/tabletop/standing-ground.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableAmbience } from '@axe/domain/tabletop/table-ambience';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('StandingGroundService', () => {
  const gridSize = 50;
  let standing: StandingGroundService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = gridSize;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    standing = TestBed.inject(StandingGroundService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  async function pond(ice: number): Promise<TableAmbience> {
    const water = TableAmbience.create('池', 'water', 2, 2);
    water.location = { name: 'table', x: gridSize, y: gridSize };
    water.surfaceHeight = 0.5;
    water.iceCover = ice;
    table.appendChild(water);
    await Promise.resolve();
    await Promise.resolve();
    return water;
  }

  it('stands what is on frozen water on the ice, and what is beside it on the ground', async () => {
    await pond(1);

    expect(standing.heightPxAt(75, 75)).toBeCloseTo(gridSize / 2);
    expect(standing.heightPxAt(140, 140)).toBeCloseTo(gridSize / 2);
    expect(standing.heightPxAt(500, 500)).toBe(0);
  });

  it('stands what is on open water, or ice too thin to bear it, on the ground, as the ground itself', async () => {
    const water = await pond(0);
    expect(standing.heightPxAt(75, 75)).toBe(0);
    expect(standing.surface()).toBe(TestBed.inject(GroundService).surface());

    water.iceCover = 0.3;
    await Promise.resolve();
    expect(standing.heightPxAt(75, 75)).toBe(0);
  });

  it('stands what is on a frozen lake dug into the ground on the ice, not on its bed', async () => {
    TestBed.inject(GroundService).dab({ kind: 'lower', x: 2, y: 2, radius: 3, strength: 1 });
    const water = await pond(1);
    water.surfaceHeight = 0;
    await Promise.resolve();

    expect(TestBed.inject(GroundService).heightPxAt(100, 100)).toBeLessThan(0);
    expect(standing.heightPxAt(100, 100)).toBeCloseTo(0);
  });
});
