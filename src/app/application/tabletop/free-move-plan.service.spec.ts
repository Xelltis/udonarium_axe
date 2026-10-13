import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { FreeMovePlanService } from '@axe/application/tabletop/free-move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

const GRID = 50;

describe('FreeMovePlanService', () => {
  let service: FreeMovePlanService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 20;
    table.height = 20;
    table.gridSize = GRID;
    table.gridType = GridType.NONE;
    table.initialize();
    Config.instance.pathMove = true;
    service = TestBed.inject(FreeMovePlanService);
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
  });

  afterEach(() => {
    Config.instance.pathMove = false;
    Config.instance.moveKinds = null;
    Config.instance.zoneEnabled = null;
    vi.restoreAllMocks();
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  /** A piece whose middle stands at the middle of a cell, so its way starts at a round number. */
  function pieceAt(col: number, row: number, walk: number, npc = false): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    character.isNpc = npc;
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  const middleOf = (col: number, row: number) => ({ x: (col + 0.5) * GRID, y: (row + 0.5) * GRID });

  it('opens only on a table with no grid whose room asks for it', () => {
    const piece = pieceAt(2, 2, 3);

    Config.instance.pathMove = false;
    expect(service.begin(piece)).toBe(false);

    Config.instance.pathMove = true;
    table.gridType = GridType.SQUARE;
    expect(service.begin(piece)).toBe(false);

    table.gridType = GridType.NONE;
    expect(service.begin(piece)).toBe(true);
    expect(service.plan()!.settled).toEqual([middleOf(2, 2)]);
    expect(service.plan()!.budgetPx).toBe(3 * GRID);
  });

  it('draws the way straight to the pointer, and no further than the move goes', () => {
    service.begin(pieceAt(2, 2, 3));

    service.lookAt(middleOf(4, 2).x, middleOf(4, 2).y);
    expect(service.plan()!.ahead).toEqual([middleOf(2, 2), middleOf(4, 2)]);

    service.lookAt(middleOf(12, 2).x, middleOf(12, 2).y);
    expect(service.plan()!.ahead[1]).toEqual(middleOf(5, 2));
  });

  it('settles a corner and draws the next leg with what is left', () => {
    service.begin(pieceAt(2, 2, 3));
    service.lookAt(middleOf(2, 4).x, middleOf(2, 4).y);
    service.settle();

    expect(service.plan()!.settled).toEqual([middleOf(2, 2), middleOf(2, 4)]);
    expect(service.plan()!.spentPx).toBe(2 * GRID);

    service.lookAt(middleOf(9, 4).x, middleOf(9, 4).y);
    expect(service.plan()!.ahead[1]).toEqual(middleOf(3, 4));

    service.unsettle();
    expect(service.plan()!.settled).toEqual([middleOf(2, 2)]);
  });

  it('stops short of a wall', () => {
    const wall = Terrain.create('壁', 1, 5, 2, '', '');
    wall.location = { name: 'table', x: 4 * GRID, y: 0 };
    table.appendChild(wall);
    service.begin(pieceAt(2, 2, 6));

    service.lookAt(middleOf(7, 2).x, middleOf(7, 2).y);

    expect(service.plan()!.ahead[1].x).toBeCloseTo(4 * GRID - 1);
  });

  it('walks the piece to the end of the way and closes the move, telling the room the way meanwhile', async () => {
    PeerCursor.createMyCursor();
    const piece = pieceAt(2, 2, 4);
    service.begin(piece);
    service.lookAt(middleOf(4, 2).x, middleOf(4, 2).y);
    service.settle();
    service.lookAt(middleOf(4, 4).x, middleOf(4, 4).y);
    TestBed.tick();
    expect(PeerCursor.myCursor.movingPoints).toBe('125,125 225,125 225,225');

    expect(await service.run()).toBe(true);
    TestBed.tick();

    expect(piece.location.x).toBe(4 * GRID);
    expect(piece.location.y).toBe(4 * GRID);
    expect(service.plan()).toBeNull();
    expect(PeerCursor.myCursor.movingPoints).toBe('');
  });

  it('puts the piece back where it began when the move is called off', () => {
    const piece = pieceAt(2, 2, 4);
    service.begin(piece);
    service.lookAt(middleOf(4, 2).x, middleOf(4, 2).y);

    service.cancel();

    expect(piece.location.x).toBe(2 * GRID);
    expect(service.plan()).toBeNull();
  });

  it('says how many metres are left, by the kind of move chosen', () => {
    Config.instance.moveKinds = '全力:3:,通常:1:';
    service.begin(pieceAt(2, 2, 2));

    expect(service.kindBand()!.metresLeft).toBe(6);
    expect(service.setKind('通常')).toBe(true);
    expect(service.kindBand()!.metresLeft).toBe(2);
  });

  it('ends the move inside a zone that holds the piece, and puts it into that zone once walked', async () => {
    Config.instance.zoneEnabled = true;
    const zones = TestBed.inject(EngagementZoneService);
    const zone = zones.declare(pieceAt(2, 2, 1), pieceAt(2, 2, 1, true))!;
    const walker = pieceAt(10, 2, 9);
    service.begin(walker);

    service.lookAt(middleOf(0, 2).x, middleOf(0, 2).y);
    service.settle();

    expect(service.plan()!.ended).toBe(true);
    expect(service.plan()!.settled[1].x).toBeCloseTo(middleOf(4, 2).x - 0.5);
    service.lookAt(middleOf(8, 8).x, middleOf(8, 8).y);
    expect(service.plan()!.ahead).toEqual([]);

    await service.run();

    expect(walker.engagementZone).toBe(zone.identifier);
  });

  it('draws a move nobody may stop on through a zone, and leaves the piece out of it once walked', async () => {
    Config.instance.zoneEnabled = true;
    const zones = TestBed.inject(EngagementZoneService);
    zones.declare(pieceAt(2, 2, 1), pieceAt(2, 2, 1, true));
    const walker = pieceAt(10, 2, 9);
    service.begin(walker);
    expect(service.setUnstoppable(true)).toBe(true);

    service.lookAt(middleOf(3, 2).x, middleOf(3, 2).y);
    service.settle();

    expect(service.plan()!.ended).toBe(false);
    expect(service.plan()!.settled[1].x).toBeCloseTo(middleOf(3, 2).x);
    await service.run();
    expect(walker.engagementZone).toBe('');
    expect(walker.unstoppableMove).toBe('');
  });
});
