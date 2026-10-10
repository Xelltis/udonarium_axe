import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableMoveCost } from '@axe/domain/tabletop/table-move-cost';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableMoveCostOverlayComponent } from '@axe/features/tabletop/table-move-cost-overlay/table-move-cost-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableMoveCostOverlayComponent', () => {
  let fixture: ComponentFixture<TableMoveCostOverlayComponent>;
  let table: GameTable;

  const canvas = () => fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableMoveCostOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    PeerCursor.createMyCursor();
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(TableMoveCostOverlayComponent);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function bog(extraCost = 1): TableMoveCost {
    const area = new TableMoveCost();
    area.col = 2;
    area.row = 2;
    area.extraCost = extraCost;
    area.initialize();
    table.appendChild(area);
    return area;
  }

  it('draws nothing on a table nobody has made dear', () => {
    fixture.detectChanges();

    expect(canvas()).toBeNull();
  });

  it('draws dear ground for a player, since a reach would give it away anyway', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    bog();

    fixture.detectChanges();

    expect(canvas()).not.toBeNull();
  });

  it('draws it for the master just as it does for everybody else', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    bog(3);

    fixture.detectChanges();

    expect(canvas()).not.toBeNull();
  });

  it('draws a stretch that has been painted off the edge of the board no more than the board holds', () => {
    const area = bog();
    area.col = 40;
    area.row = 40;

    fixture.detectChanges();

    expect(canvas()).toBeNull();
  });
});
