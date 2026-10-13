import { TestBed } from '@angular/core/testing';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { MovePlannerService } from '@axe/application/tabletop/move-planner.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('MovePlannerService', () => {
  let planner: MovePlannerService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    planner = TestBed.inject(MovePlannerService);
  });

  afterEach(() => {
    Config.instance.pathMove = false;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const piece = GameCharacter.create('コマ', 1, '');
    piece.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(piece.rootDataElement!, '移動')!.value = walk;
    return piece;
  }

  it('counts a move in cells on a table with a grid, whatever the room asks for tables without one', () => {
    Config.instance.pathMove = true;
    const piece = pieceAt(5, 5, 3);

    expect(planner.begin(piece)).toBe(true);

    expect(TestBed.inject(MovePlanService).isPlanning()).toBe(true);
    expect(planner.isFree()).toBe(false);
    expect(planner.movingIdentifier()).toBe(piece.identifier);
  });

  it('draws a move as straight legs on a table with no grid whose room asks for it, with no jumping to it', () => {
    Config.instance.pathMove = true;
    table.gridType = GridType.NONE;
    const piece = pieceAt(5, 5, 3);

    expect(planner.begin(piece)).toBe(true);
    expect(TestBed.inject(FreeMovePlanService).isPlanning()).toBe(true);
    expect(planner.isFree()).toBe(true);
    expect(planner.hasWay()).toBe(false);

    planner.lookAt(7.5 * GRID, 5.5 * GRID);
    planner.toggleJump();

    expect(planner.hasWay()).toBe(true);
    expect(planner.isJumping()).toBe(false);
    planner.cancel();
    expect(planner.isPlanning()).toBe(false);
  });

  it('counts a move in cells on a table with no grid while the room has not asked', () => {
    table.gridType = GridType.NONE;

    expect(planner.begin(pieceAt(5, 5, 3))).toBe(true);
    expect(planner.isFree()).toBe(false);
  });
});
