import { TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { ensureMoveBlockMapOn } from '@axe/domain/tabletop/move/move-block-map';
import { TableMoveBlockOverlayComponent } from '@axe/features/tabletop/table-move-block-overlay/table-move-block-overlay.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('TableMoveBlockOverlayComponent', () => {
  let table: GameTable;

  beforeEach(async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null as never);
    await TestBed.configureTestingModule({
      imports: [TableMoveBlockOverlayComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();

    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = 50;
    table.initialize();
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    PeerCursor.myCursor = null!;
    vi.restoreAllMocks();
  });

  function paintOneCell(): void {
    const grid = cellGridOf(12, 12, 50, GridType.SQUARE);
    const bits = new CellBits(cellCount(grid));
    bits.set(cellIndexOf(grid, 4, 4));
    ensureMoveBlockMapOn(table).write(grid, bits);
  }

  it('shows the painted ground to the game master', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    paintOneCell();

    const fixture = TestBed.createComponent(TableMoveBlockOverlayComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  it('shows the painted ground to a player too', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;
    paintOneCell();

    const fixture = TestBed.createComponent(TableMoveBlockOverlayComponent);
    fixture.detectChanges();

    // A piece that will not go where it is dragged is a puzzle unless the ground says why.
    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  it('shows a guest the same ground', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Guest;
    paintOneCell();

    const fixture = TestBed.createComponent(TableMoveBlockOverlayComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas')).not.toBeNull();
  });

  it('shows nothing where no ground has been closed', () => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.Player;

    const fixture = TestBed.createComponent(TableMoveBlockOverlayComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('canvas')).toBeNull();
  });
});
