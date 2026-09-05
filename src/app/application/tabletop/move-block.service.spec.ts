import { TestBed } from '@angular/core/testing';
import { MoveBlockService } from '@axe/application/tabletop/move-block.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { ensureMoveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('MoveBlockService', () => {
  let service: MoveBlockService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = 50;
    table.initialize();
    service = TestBed.inject(MoveBlockService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  const grid = () => cellGridOf(12, 12, 50, GridType.SQUARE);

  it('answers with nothing for a table that was never closed anywhere', () => {
    expect(service.blockedOn(grid())).toBeNull();
  });

  it('reads back the cells the table is closed on', () => {
    const bits = new CellBits(cellCount(grid()));
    bits.set(cellIndexOf(grid(), 4, 4));
    ensureMoveBlockMapOn(table).write(grid(), bits);

    const read = service.blockedOn(grid());

    expect(read?.get(cellIndexOf(grid(), 4, 4))).toBe(true);
    expect(read?.get(cellIndexOf(grid(), 5, 4))).toBe(false);
  });

  it('answers with an open grid where the table is closed on a grid of another shape', () => {
    const other = cellGridOf(8, 8, 50, GridType.SQUARE);
    const bits = new CellBits(cellCount(other));
    bits.set(cellIndexOf(other, 1, 1));
    ensureMoveBlockMapOn(table).write(other, bits);

    expect(service.blockedOn(grid())?.isEmpty).toBe(true);
  });
});
