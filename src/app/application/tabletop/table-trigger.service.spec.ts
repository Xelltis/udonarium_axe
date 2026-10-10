import { TestBed } from '@angular/core/testing';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { TableSelecter } from '@axe/domain/tabletop/table-selecter';
import { TableTrigger } from '@axe/domain/tabletop/table-trigger';
import { VisionType } from '@axe/domain/tabletop/vision-types';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

function sitAs(userId: string, role: PeerRole): void {
  const cursor = new PeerCursor();
  cursor.userId = userId;
  cursor.role = role;
  cursor.initialize();
  PeerCursor.myCursor = cursor;
}

describe('the ground that goes off, as a seat is allowed to see it', () => {
  let service: TableTriggerService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.darknessEnabled = true;
    table.initialize();
    TestBed.inject(TableSelecter).viewTableIdentifier = table.identifier;
    service = TestBed.inject(TableTriggerService);
  });

  afterEach(() => {
    PeerCursor.myCursor = null!;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function trapAt(col: number, row: number, shownTo: string): TableTrigger {
    const trigger = new TableTrigger();
    trigger.col = col;
    trigger.row = row;
    trigger.shownTo = shownTo;
    trigger.initialize();
    table.appendChild(trigger);
    return trigger;
  }

  /** A piece of this reader's with eyes that reach a few cells into the dark. */
  function heroAt(col: number, row: number): GameCharacter {
    const hero = GameCharacter.create('英雄', 1, '');
    hero.owner = 'p1';
    hero.visionType = VisionType.DARKVISION;
    hero.visionRange = 4;
    hero.location = { name: 'table', x: col * GRID, y: row * GRID };
    return hero;
  }

  it('shows the master every piece of it, however it was painted', () => {
    sitAs('gm', PeerRole.GameMaster);
    trapAt(2, 2, 'master');
    trapAt(9, 9, 'sight');

    expect(service.shown()).toHaveLength(2);
  });

  it('keeps ground painted for the master alone from everybody else', () => {
    sitAs('p1', PeerRole.Player);
    heroAt(2, 2);
    trapAt(2, 2, 'master');

    expect(service.shown()).toEqual([]);
  });

  it('shows ground the reader has come upon', () => {
    sitAs('p1', PeerRole.Player);
    heroAt(2, 2);
    const near = trapAt(3, 2, 'sight');

    expect(service.shown()).toEqual([near]);
  });

  it('keeps that same ground from a reader whose eyes do not reach it', () => {
    sitAs('p1', PeerRole.Player);
    heroAt(2, 2);
    trapAt(15, 15, 'sight');

    expect(service.shown()).toEqual([]);
  });

  it('shows ground painted for the room wherever it lies', () => {
    sitAs('p1', PeerRole.Player);
    heroAt(2, 2);
    const far = trapAt(15, 15, 'room');

    expect(service.shown()).toEqual([far]);
  });

  it('reads ground painted before there was a middle answer by what it used to say', () => {
    sitAs('p1', PeerRole.Player);
    heroAt(2, 2);
    const open = trapAt(15, 15, '');
    open.open = true;

    expect(service.shown()).toEqual([open]);
  });
});
