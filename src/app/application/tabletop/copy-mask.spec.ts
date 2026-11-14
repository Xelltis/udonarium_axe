import { TestBed } from '@angular/core/testing';
import { copyMask } from '@axe/application/tabletop/copy-mask';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { GameTableMask } from '@axe/domain/tabletop/game-table-mask';

describe('copyMask', () => {
  let mask: GameTableMask;
  let cloned: GameTableMask;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mask = GameTableMask.create('霧', 3, 2, 100);
    mask.location = { name: 'table', x: 100, y: 200 };
    mask.isLock = true;
    cloned = GameTableMask.create('霧', 3, 2, 100);
    cloned.location = { name: 'table', x: 100, y: 200 };
    cloned.isLock = true;
    vi.spyOn(mask, 'clone').mockReturnValue(cloned);
  });

  afterEach(() => {
    cloned.destroy();
    mask.destroy();
    vi.restoreAllMocks();
  });

  it('places an unlocked copy one cell down and to the right, leaving the original where it was', () => {
    const copy = copyMask(mask, 50);

    expect(copy).toBe(cloned);
    expect(copy.location.x).toBe(150);
    expect(copy.location.y).toBe(250);
    expect(copy.isLock).toBe(false);
    expect(mask.location.x).toBe(100);
    expect(mask.location.y).toBe(200);
    expect(mask.isLock).toBe(true);
  });

  it('puts the copy under the parent of the original', () => {
    const table = new GameTable();
    table.initialize();
    table.appendChild(mask);

    const copy = copyMask(mask, 50);

    expect(copy.parent).toBe(table);
    table.destroy();
  });

  it('sends the copy where it stands to the peers, with or without a parent', () => {
    const update = vi.spyOn(cloned, 'update');

    copyMask(mask, 50);

    expect(update).toHaveBeenCalled();
  });
});
