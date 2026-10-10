import { TestBed } from '@angular/core/testing';
import { TableFocusService } from '@axe/application/tabletop/table-focus.service';
import { SelectionSignalService } from '@axe/application/ui/selection-signal.service';
import { GameCharacter } from '@axe/domain/character/game-character';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { WhiteBoard } from '@axe/domain/tabletop/white-board';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('TableFocusService', () => {
  let service: TableFocusService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    service = TestBed.inject(TableFocusService);
  });

  function lookAtTable(gridType: GridType): void {
    const table = new GameTable();
    table.initialize();
    table.width = 10;
    table.height = 8;
    table.wallHeight = 4;
    table.gridSize = 50;
    table.gridType = gridType;
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
  }

  function standOn(surface: string, x: number, y: number): GameCharacter {
    const character = GameCharacter.create('壁のぬし', 1, '');
    character.location = { name: 'table', x, y, surface };
    return character;
  }

  function focused(): { x: number; y: number } | null {
    const focus = TestBed.inject(SelectionSignalService).focusCoordinate();
    return focus ? { x: focus.x, y: focus.y } : null;
  }

  it('glides to the foot of the wall a piece stands on', () => {
    lookAtTable(GridType.SQUARE);

    service.focusOn(standOn('north-wall', 120, 80));

    expect(focused()).toEqual({ x: 120, y: 0 });
  });

  it('measures the far walls of a hex table along the table edge', () => {
    lookAtTable(GridType.HEX_HORIZONTAL);

    service.focusOn(standOn('east-wall', 120, 80));
    expect(focused()).toEqual({ x: 500, y: 120 });

    service.focusOn(standOn('south-wall', 120, 80));
    expect(focused()).toEqual({ x: 500 - 120, y: 400 });
  });

  it('glides to where the board carrying a piece stands', () => {
    lookAtTable(GridType.SQUARE);
    const board = WhiteBoard.create('板', 4, 3, 1);
    board.location = { name: 'table', x: 300, y: 200 };

    service.focusOn(standOn(board.identifier, 20, 10));

    expect(focused()).toEqual({ x: 300, y: 200 });
  });

  it('glides straight to a piece on the floor', () => {
    lookAtTable(GridType.SQUARE);

    service.focusOn(standOn('', 120, 80));

    expect(focused()).toEqual({ x: 120, y: 80 });
  });

  it('takes a piece at its own coordinates when no table is in view', () => {
    service.focusOn(standOn('north-wall', 120, 80));

    expect(focused()).toEqual({ x: 120, y: 80 });
  });
});
