import { TestBed } from '@angular/core/testing';
import { blockedCellKeysOn, FunctionalPaintService } from '@axe/application/tabletop/functional-paint.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';
import { ensureMoveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('FunctionalPaintService', () => {
  let service: FunctionalPaintService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 10;
    table.height = 8;
    table.gridSize = 50;
    table.initialize();
    service = TestBed.inject(FunctionalPaintService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function grid() {
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  }

  it('reads the size and the grid of the table that is out', () => {
    const snapshot = service.snapshot()!;

    expect(snapshot.cols).toBe(10);
    expect(snapshot.rows).toBe(8);
    expect(snapshot.cellPx).toBe(50);
  });

  it('reads the cells the table is closed on', () => {
    const bits = new CellBits(80);
    bits.set(0);
    bits.set(12);
    ensureMoveBlockMapOn(table).write(grid(), bits);

    expect([...service.snapshot()!.blockedCells].sort()).toEqual(['0,0', '2,1']);
  });

  it('reads only the terrain the editor painted', () => {
    const painted = Terrain.create('塗った壁', 1, 1, 1, '', '');
    painted.paintCell = '3,4';
    table.appendChild(painted);
    const byHand = Terrain.create('置いた壁', 3, 2, 4, '', '');
    table.appendChild(byHand);

    expect(service.snapshot()!.terrainCells).toEqual(['3,4']);
  });

  it('reads only the masks the editor painted', () => {
    const painted = GameTableMask.create('塗った覆い', 1, 1, 0.6);
    painted.paintCell = '5,6';
    table.appendChild(painted);
    const byHand = GameTableMask.create('置いた覆い', 4, 4, 0.6);
    table.appendChild(byHand);

    expect(service.snapshot()!.maskCells).toEqual(['5,6']);
  });

  it('reads nothing at all from a table with no size', () => {
    table.gridSize = 0;

    expect(service.snapshot()).toBeNull();
  });
});

describe('blockedCellKeysOn()', () => {
  it('answers with nothing for a table that was never closed anywhere', () => {
    const table = new GameTable();
    table.width = 4;
    table.height = 4;
    table.gridSize = 50;
    table.initialize();

    expect(blockedCellKeysOn(table, cellGridOf(4, 4, 50, table.gridType))).toEqual([]);

    table.destroy();
  });
});
