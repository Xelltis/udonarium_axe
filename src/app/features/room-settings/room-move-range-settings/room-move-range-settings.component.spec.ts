import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ObjectStore } from '@axe/core/sync/object-store';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { RoomMoveRangeSettingsComponent } from '@axe/features/room-settings/room-move-range-settings/room-move-range-settings.component';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

describe('RoomMoveRangeSettingsComponent', () => {
  let fixture: ComponentFixture<RoomMoveRangeSettingsComponent>;
  let component: RoomMoveRangeSettingsComponent;
  let table: GameTable;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RoomMoveRangeSettingsComponent],
      providers: [...TEST_PROVIDERS],
    }).compileComponents();
  });

  beforeEach(() => {
    PeerCursor.createMyCursor();
    PeerCursor.myCursor.role = PeerRole.GameMaster;
    table = new GameTable();
    table.width = 10;
    table.height = 10;
    table.gridSize = 50;
    table.initialize();
    fixture = TestBed.createComponent(RoomMoveRangeSettingsComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
    (Config as unknown as { _instance: Config | undefined })._instance = undefined;
  });

  it('does not throw when it is drawn', () => {
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('puts the question of corners only to a square board', () => {
    table.gridType = GridType.SQUARE;
    expect(component.showsDiagonalOption).toBe(true);

    table.gridType = GridType.HEX_VERTICAL;
    expect(component.showsDiagonalOption).toBe(false);
  });

  it('follows the older answer about sharing cells until a side is set', () => {
    table.piecesShareCells = false;

    for (const side of component.piecePassageSides) expect(component.piecePassage(side)).toBe('block');
  });

  it('takes over one side at a time, leaving the others where they were', () => {
    component.setPiecePassage('samePartyPassage', 'pass');

    expect(Config.instance.samePartyPassage).toBe('pass');
    expect(component.piecePassage('samePartyPassage')).toBe('pass');
    expect(component.piecePassage('otherPartyPassage')).toBe('share');
    expect(component.answersFor('moveRange')).toBe(true);
  });

  it('asks what crossing costs only where a side is charged for it', () => {
    expect(component.showsPiecePassageCost).toBe(false);

    component.setPiecePassage('samePartyPassage', 'pass');
    expect(component.showsPiecePassageCost).toBe(false);

    component.setPiecePassage('samePartyPassage', 'cost');
    expect(component.showsPiecePassageCost).toBe(true);
  });

  it('takes a crossing price that is not a whole count as none at all', () => {
    component.piecePassageCost.value = Number.NaN;

    expect(component.piecePassageCost.value).toBe(0);
  });

  it('takes a distance that is not a number as no conversion at all', () => {
    component.cellDistance.value = Number.NaN;

    expect(component.cellDistance.value).toBe(0);
  });

  it('starts a table turned over to cells again at one cell a cell', () => {
    component.cellDistanceUnit.value = 'foot';
    component.cellDistance.value = 1.5;

    component.cellDistanceUnit.value = 'cell';

    expect(component.cellDistance.value).toBe(1);
  });

  it('keeps what a cell stands for on a table that was counted in cells already', () => {
    component.cellDistanceUnit.value = 'cell';
    component.cellDistance.value = 0.5;

    component.cellDistanceUnit.value = 'cell';
    component.cellDistanceUnit.value = 'metre';

    expect(component.cellDistance.value).toBe(0.5);
  });

  it('counts a corner as it is chosen, and an unknown way of counting as the default', () => {
    component.diagonalMove.value = 'double';
    expect(Config.instance.diagonalMove).toBe('double');

    component.diagonalMove.value = 'zigzag' as never;
    expect(component.diagonalMove.value).toBe('equal');
  });

  it('writes whether a move on a table with no grid is drawn as straight legs', () => {
    component.pathMove.value = true;
    expect(Config.instance.pathMove).toBe(true);

    component.pathMove.value = false;
    expect(Config.instance.pathMove).toBe(false);
  });

  it('writes the kinds of move, and forgets them left empty', () => {
    component.moveKinds.value = ' 全力:3:,通常:1: ';
    expect(Config.instance.moveKinds).toBe('全力:3:,通常:1:');

    component.moveKinds.value = '';
    expect(Config.instance.moveKinds).toBeNull();
  });

  it('writes nothing for a reader who may not edit the table', () => {
    PeerCursor.myCursor.role = PeerRole.Guest;

    component.moveRangeEnabled.value = false;
    component.setPiecePassage('samePartyPassage', 'pass');
    component.cellDistanceUnit.value = 'foot';

    expect(Config.instance.moveRangeEnabled).toBeNull();
    expect(Config.instance.samePartyPassage).toBeNull();
    expect(Config.instance.cellDistanceUnit).toBeNull();
  });
});
