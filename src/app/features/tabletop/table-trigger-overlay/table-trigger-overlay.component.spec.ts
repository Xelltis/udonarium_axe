import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { TableTriggerOverlayComponent } from '@axe/features/tabletop/table-trigger-overlay/table-trigger-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableTriggerOverlayComponent', () => {
  let fixture: ComponentFixture<TableTriggerOverlayComponent>;
  let table: GameTable;

  const canvas = () => fixture.nativeElement.querySelector('canvas') as HTMLCanvasElement | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableTriggerOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
    PeerCursor.createMyCursor();
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    fixture = TestBed.createComponent(TableTriggerOverlayComponent);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function trap(open: boolean): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = 2;
    trigger.row = 2;
    trigger.open = open;
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  it('draws nothing on a table nobody has trapped', () => {
    fixture.detectChanges();

    expect(canvas()).toBeNull();
  });

  it('draws ground the room was meant to see, whoever is looking', () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    trap(true);

    fixture.detectChanges();

    expect(canvas()).not.toBeNull();
  });

  it("keeps a hidden trap off every screen but the master's", () => {
    PeerCursor.myCursor.role = PeerRole.Player;
    trap(false);

    fixture.detectChanges();

    expect(canvas()).toBeNull();
  });

  it('shows the master what the room cannot see', () => {
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    trap(false);

    fixture.detectChanges();

    expect(canvas()).not.toBeNull();
  });
});
