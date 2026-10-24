import { TestBed } from '@angular/core/testing';
import { ChatMessageService } from '@axe/application/chat/chat-message.service';
import { ObjectChangeService } from '@axe/application/sync/object-change.service';
import { EngagementZoneService } from '@axe/application/tabletop/engagement-zone.service';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { PeerRole } from '@axe/domain/peer/peer-role';
import { cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { stepsFor } from '@axe/domain/tabletop/move/move-steps';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { vi } from 'vitest';

const GRID = 50;

describe('MovePlanService', () => {
  let service: MovePlanService;
  let table: GameTable;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    service = TestBed.inject(MovePlanService);
  });

  afterEach(() => {
    Config.instance.moveKinds = null;
    Config.instance.zoneEnabled = null;
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  /** A wall two cells high, which is more than a piece steps over. */
  function wallOver(col: number, fromRow: number, depthCells: number): void {
    const terrain = Terrain.create('壁', 1, depthCells, 2, '', '');
    terrain.location = { name: 'table', x: col * GRID, y: fromRow * GRID };
    table.appendChild(terrain);
  }

  function cell(col: number, row: number): number {
    return cellIndexOf(service.plan()!.grid, col, row);
  }

  describe('what the room is shown of a move being made', () => {
    /** The effect that tells the room runs when the application flushes its effects. */
    function flush(): void {
      TestBed.tick();
    }

    it('names the piece and the table the moment a move is opened', () => {
      PeerCursor.createMyCursor();
      const piece = pieceAt(5, 5, 3);

      service.begin(piece);
      flush();

      const cursor = PeerCursor.myCursor;
      expect(cursor.movingCharacterIdentifier).toBe(piece.identifier);
      expect(cursor.movingTableIdentifier).toBe(table.identifier);
    });

    it('sends the way as it is drawn, so the table watches it being worked out', () => {
      PeerCursor.createMyCursor();
      service.begin(pieceAt(5, 5, 4));

      service.lookAt(7 * GRID + 10, 5 * GRID + 10);
      service.settle();
      flush();

      expect(PeerCursor.myCursor.movingWay.split(',').map(Number)).toEqual([cell(5, 5), cell(6, 5), cell(7, 5)]);
    });

    it('takes the move off the table the moment it is called off', () => {
      PeerCursor.createMyCursor();
      service.begin(pieceAt(5, 5, 3));
      flush();
      expect(PeerCursor.myCursor.movingCharacterIdentifier).not.toBe('');

      service.cancel();
      flush();

      expect(PeerCursor.myCursor.movingCharacterIdentifier).toBe('');
      expect(PeerCursor.myCursor.movingTableIdentifier).toBe('');
      expect(PeerCursor.myCursor.movingWay).toBe('');
    });

    it('takes the move off the table once the piece has walked it', async () => {
      PeerCursor.createMyCursor();
      service.begin(pieceAt(5, 5, 4));
      service.lookAt(7 * GRID + 10, 5 * GRID + 10);
      flush();
      expect(PeerCursor.myCursor.movingCharacterIdentifier).not.toBe('');

      await service.run();
      flush();

      expect(PeerCursor.myCursor.movingCharacterIdentifier).toBe('');
      expect(PeerCursor.myCursor.movingWay).toBe('');
    });
  });

  describe('a seat made a guest', () => {
    afterEach(() => {
      PeerCursor.myCursor = null!;
    });

    it('drops the move it was working out, moving nothing', () => {
      PeerCursor.createMyCursor().role = PeerRole.Player;
      const piece = pieceAt(5, 5, 4);
      service.begin(piece);
      TestBed.tick();

      PeerCursor.myCursor.role = PeerRole.Guest;
      TestBed.inject(ObjectChangeService).notifyChanged(PeerCursor.myCursor.identifier);
      TestBed.tick();

      expect(service.isPlanning()).toBe(false);
      expect(piece.location.x).toBe(5 * GRID);
    });

    it('walks nothing, though it is not yet told', async () => {
      PeerCursor.createMyCursor().role = PeerRole.Player;
      const piece = pieceAt(5, 5, 4);
      service.begin(piece);
      service.lookAt(7 * GRID + 10, 5 * GRID + 10);

      PeerCursor.myCursor.role = PeerRole.Guest;

      expect(await service.run()).toBe(false);
      expect(piece.location.x).toBe(5 * GRID);
    });
  });

  it('opens on the cell the piece stands on, with nothing settled and nothing spent', () => {
    const piece = pieceAt(5, 5, 3);

    expect(service.begin(piece)).toBe(true);

    const plan = service.plan()!;
    expect(plan.from).toBe(cell(5, 5));
    expect(plan.settled).toEqual([cell(5, 5)]);
    expect(plan.spent).toBe(0);
    expect(plan.budget).toBe(stepsFor(3));
  });

  it('opens on nothing for a piece with no reach to draw', () => {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: 5 * GRID, y: 5 * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.destroy();

    expect(service.begin(character)).toBe(false);
    expect(service.plan()).toBeNull();
  });

  it('draws a way ahead of the pointer, from where the piece stands', () => {
    service.begin(pieceAt(5, 5, 3));

    service.lookAt(7 * GRID + 10, 5 * GRID + 10);

    const plan = service.plan()!;
    expect(plan.ahead[0]).toBe(cell(5, 5));
    expect(plan.ahead[plan.ahead.length - 1]).toBe(cell(7, 5));
  });

  it('draws nothing ahead of a pointer beyond what the piece can walk', () => {
    service.begin(pieceAt(5, 5, 1));

    service.lookAt(11 * GRID + 10, 11 * GRID + 10);

    expect(service.plan()!.ahead).toEqual([]);
  });

  it('draws the way round a wall rather than through it', () => {
    wallOver(6, 4, 3);
    service.begin(pieceAt(5, 5, 8));

    service.lookAt(7 * GRID + 10, 5 * GRID + 10);

    const plan = service.plan()!;
    expect(plan.ahead).not.toContain(cell(6, 5));
    expect(plan.ahead[plan.ahead.length - 1]).toBe(cell(7, 5));
  });

  it('draws a way through its own side rather than round it, and not onto it', () => {
    // Corners are left uncut so that one way through is the only cheapest way there is.
    table.moveDiagonally = false;
    table.samePartyPassage = 'pass';
    const ally = pieceAt(6, 5, 1);
    ally.partyIdentifier = 'heroes';
    const hero = pieceAt(5, 5, 3);
    hero.partyIdentifier = 'heroes';
    service.begin(hero);

    service.lookAt(6 * GRID + 10, 5 * GRID + 10);
    expect(service.plan()!.ahead).toEqual([]);

    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    const plan = service.plan()!;
    expect(plan.ahead).toContain(cell(6, 5));
    expect(plan.ahead[plan.ahead.length - 1]).toBe(cell(7, 5));
  });

  it('settles the way drawn, and works the next one out from where it ended', () => {
    service.begin(pieceAt(5, 5, 4));
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);

    service.settle();

    const plan = service.plan()!;
    expect(plan.from).toBe(cell(7, 5));
    expect(plan.spent).toBe(stepsFor(2));
    expect(plan.waypoints).toEqual([cell(7, 5)]);
    expect(plan.ahead).toEqual([]);
    expect(plan.settled).toEqual([cell(5, 5), cell(6, 5), cell(7, 5)]);
  });

  it('leaves only what is unspent to reach with after a leg is settled', () => {
    service.begin(pieceAt(5, 5, 3));
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();

    service.lookAt(9 * GRID + 10, 5 * GRID + 10);

    expect(service.plan()!.ahead).toEqual([]);
  });

  describe('a move taken over what stands in the way', () => {
    function blockOver(col: number, row: number, height: number, sheer = false): Terrain {
      const terrain = Terrain.create('岩', 1, 1, height, '', '', `rock_${col}_${row}`);
      terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
      terrain.blocksClimb = sheer;
      table.appendChild(terrain);
      return terrain;
    }

    it('walks around a block, and jumps onto it once the reader asks to', () => {
      blockOver(6, 5, 2);
      service.begin(pieceAt(5, 5, 3));

      expect(service.plan()!.reach.get(cell(6, 5))).toBe(false);
      expect(service.isJumping()).toBe(false);

      service.toggleJump();

      expect(service.isJumping()).toBe(true);
      expect(service.plan()!.reach.get(cell(6, 5))).toBe(true);
    });

    it('tells the room which rule the move is being taken under', () => {
      PeerCursor.createMyCursor();
      blockOver(6, 5, 2);
      service.begin(pieceAt(5, 5, 3));
      TestBed.tick();
      expect(PeerCursor.myCursor.movingJumping).toBe('');

      service.toggleJump();
      TestBed.tick();

      expect(PeerCursor.myCursor.movingJumping).toBe('true');
    });

    it('leaves a face too sheer to climb out of reach, jumping or not', () => {
      blockOver(6, 5, 2, true);
      service.begin(pieceAt(5, 5, 3));

      service.toggleJump();

      expect(service.plan()!.reach.get(cell(6, 5))).toBe(false);
    });

    describe('with a room that says how far a leap goes', () => {
      afterEach(() => {
        Config.instance.jumpCells = null;
      });

      it('leaps only as far as the room allows, though the move has more left', () => {
        service.begin(pieceAt(5, 5, 4));
        Config.instance.jumpCells = 2;

        service.toggleJump();

        expect(service.plan()!.reach.get(cell(7, 5))).toBe(true);
        expect(service.plan()!.reach.get(cell(9, 5))).toBe(false);
      });

      it('leaps as far as the move carries where the room says nothing', () => {
        service.begin(pieceAt(5, 5, 4));

        service.toggleJump();

        expect(service.plan()!.reach.get(cell(9, 5))).toBe(true);
      });

      it('draws no way past the end of one leap', () => {
        service.begin(pieceAt(5, 5, 4));
        Config.instance.jumpCells = 2;
        service.toggleJump();

        service.lookAt(9 * GRID + 10, 5 * GRID + 10);

        expect(service.plan()!.ahead).toEqual([]);
      });
    });

    it('takes the jumping back off again, and the block with it', () => {
      blockOver(6, 5, 2);
      service.begin(pieceAt(5, 5, 3));
      service.toggleJump();

      service.toggleJump();

      expect(service.isJumping()).toBe(false);
      expect(service.plan()!.reach.get(cell(6, 5))).toBe(false);
    });

    it('drops the leg drawn under the other rule', () => {
      blockOver(6, 5, 2);
      service.begin(pieceAt(5, 5, 3));
      service.lookAt(5 * GRID + 10, 7 * GRID + 10);
      expect(service.plan()!.ahead.length).toBeGreaterThan(1);

      service.toggleJump();

      expect(service.plan()!.ahead).toEqual([]);
    });

    it('draws a way onto the block once it is jumping', () => {
      blockOver(6, 5, 2);
      service.begin(pieceAt(5, 5, 3));
      service.toggleJump();

      service.lookAt(6 * GRID + 10, 5 * GRID + 10);

      expect(service.plan()!.ahead[service.plan()!.ahead.length - 1]).toBe(cell(6, 5));
    });

    it('stands the piece on top of what it jumped onto', async () => {
      blockOver(6, 5, 2);
      const piece = pieceAt(5, 5, 3);
      service.begin(piece);
      service.toggleJump();
      service.lookAt(6 * GRID + 10, 5 * GRID + 10);

      await service.run();

      expect(piece.posZ).toBe(2 * GRID);
      expect(piece.location.x).toBe(6 * GRID);
    });

    it('never sends the piece to where it is going before it has got there', async () => {
      blockOver(6, 5, 2);
      const piece = pieceAt(5, 5, 3);
      const seen: { x: number; z: number }[] = [];
      const update = piece.update.bind(piece);
      vi.spyOn(piece, 'update').mockImplementation(() => {
        seen.push({ x: piece.location.x, z: piece.posZ });
        update();
      });
      service.begin(piece);
      service.toggleJump();
      service.lookAt(6 * GRID + 10, 5 * GRID + 10);

      await service.run();

      // The block's own cell and its height are reached at the end of the hop and never before,
      // so nobody watching sees the piece arrive, wind back and cross a second time.
      const arrived = (at: { x: number; z: number }) => at.x === 6 * GRID && at.z === 2 * GRID;
      const first = seen.findIndex(arrived);

      expect(arrived(seen[0])).toBe(false);
      expect(first).toBeGreaterThan(0);
      expect(seen.slice(first).every(arrived)).toBe(true);
    });

    it('sets a piece back down on the floor when it comes off again', async () => {
      blockOver(6, 5, 2);
      const piece = pieceAt(6, 5, 3);
      piece.posZ = 2 * GRID;
      service.begin(piece);
      service.lookAt(5 * GRID + 10, 5 * GRID + 10);

      await service.run();

      expect(piece.posZ).toBe(0);
    });
  });

  describe('on a table that counts corners one, then two, by turns', () => {
    beforeEach(() => {
      Config.instance.diagonalMove = 'alternating';
    });

    afterEach(() => {
      Config.instance.diagonalMove = null;
    });

    it('goes on counting into the next leg, since the legs are one move', () => {
      service.begin(pieceAt(5, 5, 4));
      service.lookAt(6 * GRID + 10, 6 * GRID + 10);
      service.settle();

      expect(service.plan()!.spent).toBe(stepsFor(1));
      expect(service.plan()!.cornersCut).toBe(1);

      service.lookAt(7 * GRID + 10, 7 * GRID + 10);
      service.settle();

      // The second corner of the move costs two, wherever the reader chose to break the way.
      expect(service.plan()!.spent).toBe(stepsFor(3));
    });

    it('gives the count back with the corner when a leg is taken up again', () => {
      service.begin(pieceAt(5, 5, 4));
      service.lookAt(6 * GRID + 10, 6 * GRID + 10);
      service.settle();
      service.unsettle();

      expect(service.plan()!.cornersCut).toBe(0);
    });
  });

  it('takes the corner back up when it is pressed on a second time', () => {
    service.begin(pieceAt(5, 5, 4));
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();

    // The pointer has not moved off the corner, so nothing is drawn ahead of it.
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();

    const plan = service.plan()!;
    expect(plan.waypoints).toEqual([]);
    expect(plan.from).toBe(cell(5, 5));
    expect(plan.spent).toBe(0);
    expect(plan.settled).toEqual([cell(5, 5)]);
  });

  it('takes back only the corner set last, and leaves the ones before it', () => {
    service.begin(pieceAt(5, 5, 6));
    service.lookAt(6 * GRID + 10, 5 * GRID + 10);
    service.settle();
    service.lookAt(8 * GRID + 10, 5 * GRID + 10);
    service.settle();

    service.lookAt(8 * GRID + 10, 5 * GRID + 10);
    service.settle();

    expect(service.plan()!.waypoints).toEqual([cell(6, 5)]);
    expect(service.plan()!.from).toBe(cell(6, 5));
  });

  it('gives back what the corner cost, so the reach opens out again', () => {
    service.begin(pieceAt(5, 5, 3));
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();

    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();
    service.lookAt(8 * GRID + 10, 5 * GRID + 10);

    expect(service.plan()!.ahead).toEqual([cell(5, 5), cell(6, 5), cell(7, 5), cell(8, 5)]);
  });

  it('settles nothing where nothing is drawn ahead', () => {
    service.begin(pieceAt(5, 5, 3));

    service.settle();

    expect(service.plan()!.waypoints).toEqual([]);
    expect(service.plan()!.spent).toBe(0);
  });

  it('walks the piece to the end of the way it was given', async () => {
    const piece = pieceAt(5, 5, 4);
    service.begin(piece);
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);

    await service.run();

    expect(piece.location.x).toBe(7 * GRID);
    expect(piece.location.y).toBe(5 * GRID);
    expect(service.plan()).toBeNull();
  });

  it('springs the ground it crosses as it arrives on each cell, not once it has stopped', async () => {
    const fire = TestBed.inject(TriggerFireService);
    const sprung = vi.spyOn(fire, 'stepped').mockReturnValue([]);
    service.begin(pieceAt(5, 5, 4));
    service.lookAt(8 * GRID + 10, 5 * GRID + 10);
    service.settle();

    await service.run();

    expect(sprung).toHaveBeenCalledTimes(3);
    expect(sprung.mock.calls.map((call) => call[3])).toEqual([false, false, true]);
  });

  it('walks the whole way, legs and all', async () => {
    wallOver(6, 4, 3);
    const piece = pieceAt(5, 5, 8);
    service.begin(piece);
    service.lookAt(5 * GRID + 10, 7 * GRID + 10);
    service.settle();
    service.lookAt(7 * GRID + 10, 7 * GRID + 10);

    await service.run();

    expect(piece.location.x).toBe(7 * GRID);
    expect(piece.location.y).toBe(7 * GRID);
  });

  it('closes a move whose piece has gone from the table', async () => {
    const piece = pieceAt(5, 5, 4);
    service.begin(piece);
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    piece.destroy();

    const walked = await service.run();

    expect(walked).toBe(false);
    expect(service.plan()).toBeNull();
  });

  describe('kinds of move', () => {
    beforeEach(() => {
      Config.instance.moveKinds = '全力:3:,通常:1:,制限:1:2';
    });

    it("opens by the room's first kind, and by another where one is asked for", () => {
      const piece = pieceAt(1, 1, 2);

      service.begin(piece);
      expect(service.plan()!.kind).toBe('全力');
      expect(service.plan()!.budget).toBe(stepsFor(6));
      service.cancel();

      service.begin(piece, '制限');
      expect(service.plan()!.kind).toBe('制限');
      expect(service.plan()!.budget).toBe(stepsFor(2));
    });

    it('changes the kind until the first leg is settled, and keeps it from then on', () => {
      service.begin(pieceAt(1, 1, 2));

      expect(service.setKind('通常')).toBe(true);
      expect(service.plan()!.budget).toBe(stepsFor(2));
      service.lookAt(2 * GRID + 10, 1 * GRID + 10);
      service.settle();

      expect(service.setKind('全力')).toBe(false);
      expect(service.plan()!.kind).toBe('通常');
      expect(service.kindBand()!.kinds.map((kind) => kind.mayChoose)).toEqual([false, true, false]);
    });

    it('says how many metres the move has left', () => {
      service.begin(pieceAt(1, 1, 2), '通常');
      expect(service.kindBand()!.metresLeft).toBe(2);

      service.lookAt(2 * GRID + 10, 1 * GRID + 10);
      service.settle();

      expect(service.kindBand()!.metresLeft).toBe(1);
    });

    it('offers no kinds where the room has written none of its own', () => {
      Config.instance.moveKinds = null;
      service.begin(pieceAt(1, 1, 2));

      expect(service.plan()!.kind).toBe('');
      expect(service.kindBand()).toBeNull();
    });

    it('tells the room which kind the move is made by', () => {
      PeerCursor.createMyCursor();
      service.begin(pieceAt(1, 1, 2), '通常');
      TestBed.tick();

      expect(PeerCursor.myCursor.movingKind).toBe('通常');
    });
  });

  it('puts a piece that walked into an engagement zone holding it into that zone', async () => {
    Config.instance.zoneEnabled = true;
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
    const zones = TestBed.inject(EngagementZoneService);
    const hero = pieceAt(2, 2, 1);
    const foe = pieceAt(2, 2, 1);
    foe.isNpc = true;
    const zone = zones.declare(hero, foe)!;
    const walker = pieceAt(8, 2, 6);

    service.begin(walker);
    service.lookAt(4 * GRID + 10, 2 * GRID + 10);
    await service.run();

    expect(walker.engagementZone).toBe(zone.identifier);
  });

  it('walks a move nobody may stop through an engagement zone, and says it no longer is once walked', async () => {
    Config.instance.zoneEnabled = true;
    vi.spyOn(TestBed.inject(ChatMessageService), 'sendSystemMessage').mockReturnValue(null as never);
    const zones = TestBed.inject(EngagementZoneService);
    const foe = pieceAt(2, 2, 1);
    foe.isNpc = true;
    zones.declare(pieceAt(2, 2, 1), foe);
    const walker = pieceAt(8, 2, 6);

    service.begin(walker);
    expect(service.unstoppableBand()).toEqual({ on: false, mayChange: true });
    expect(service.setUnstoppable(true)).toBe(true);
    expect(walker.unstoppableMove).toBe('1');
    service.lookAt(4 * GRID + 10, 2 * GRID + 10);
    await service.run();

    expect(walker.engagementZone).toBe('');
    expect(walker.unstoppableMove).toBe('');
  });

  it('offers no move nobody may stop where the room plays no zones, and forgets one called off', () => {
    const piece = pieceAt(5, 5, 4);
    service.begin(piece);
    expect(service.unstoppableBand()).toBeNull();

    Config.instance.zoneEnabled = true;
    service.cancel();
    service.begin(piece);
    service.setUnstoppable(true);
    service.cancel();
    expect(piece.unstoppableMove).toBe('');
  });

  describe('on a table whose pieces keep to the cells of its squares', () => {
    beforeEach(() => {
      table.squareSpan = 2;
      table.gridSnapStyle = GridSnapStyle.GRID;
    });

    it('puts the piece down on the cell of the last square the pointer is over', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 50 });
    });

    it('puts it in the middle of the square under any other snap', async () => {
      table.gridSnapStyle = GridSnapStyle.CENTER;
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);

      await service.run();

      expect(piece.location).toMatchObject({ x: 125, y: 25 });
    });

    it('puts it down on the cell the pointer is over once the last leg is settled', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);
      service.settle();
      service.lookAt(110, 10);

      await service.run();

      expect(piece.location).toMatchObject({ x: 100, y: 0 });
    });

    it('shifts the piece onto another cell of the square it stands on, springing nothing', async () => {
      const sprung = vi.spyOn(TestBed.inject(TriggerFireService), 'stepped').mockReturnValue([]);
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(60, 60);

      expect(service.movesWithinSquare()).toBe(true);
      expect(await service.run()).toBe(true);
      expect(piece.location).toMatchObject({ x: 50, y: 50 });
      expect(sprung).not.toHaveBeenCalled();
    });

    it('has nowhere to go with the pointer on the cell the piece stands on', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(10, 10);

      expect(service.movesWithinSquare()).toBe(false);
      expect(await service.run()).toBe(false);
    });

    it('has nowhere to go once the pointer leaves the square it stands on for one out of reach', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(60, 60);
      service.lookAt(560, 560);

      expect(service.movesWithinSquare()).toBe(false);
      expect(await service.run()).toBe(false);
      expect(service.plan()!.landing).toBeNull();
    });

    /** A block of ground cells across and deep, cells high, standing on the table. */
    function groundAt(col: number, row: number, cells: number, height: number): void {
      const terrain = Terrain.create('段', cells, cells, height, '', '', `ground_${col}_${row}`);
      terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
      table.appendChild(terrain);
    }

    it('puts it on the nearest cell of the square it could stand on rather than one it could not', async () => {
      wallOver(3, 1, 1);
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(175, 75);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 0 });
    });

    it('lands on ground it jumps up onto, at the cell it was asked to', async () => {
      groundAt(2, 0, 2, 2);
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.toggleJump();
      service.lookAt(175, 75);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 50 });
    });

    it('lands on the cell chosen on the square the settled way ends on, with the pointer off out of reach', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);
      service.settle();
      service.lookAt(110, 60);
      service.lookAt(560, 560);

      await service.run();

      expect(piece.location).toMatchObject({ x: 100, y: 50 });
    });

    it('leaves the zones as they are for a shift within the square, and offers nothing, as for no move', async () => {
      const zones = TestBed.inject(EngagementZoneService);
      const afterMove = vi.spyOn(zones, 'afterMove');
      const offerFight = vi.spyOn(zones, 'offerFight');
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(60, 60);

      await service.run();

      expect(piece.location).toMatchObject({ x: 50, y: 50 });
      expect(afterMove).not.toHaveBeenCalled();
      expect(offerFight).not.toHaveBeenCalled();
    });

    it('lands a piece that flies on ground it could not step onto, at the cell it was asked to', async () => {
      groundAt(2, 0, 2, 2);
      const piece = pieceAt(0, 0, 2);
      piece.moveMode = 'fly';
      service.begin(piece);
      service.lookAt(175, 75);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 50 });
    });

    it('offers no way onto a square with no cell the piece could stand on', async () => {
      table.squareSpan = 3;
      wallOver(4, 0, 1);
      wallOver(4, 2, 1);
      const piece = pieceAt(0, 0, 2);
      piece.size = 2;
      service.begin(piece);
      service.lookAt(225, 75);

      expect(service.plan()!.ahead).toEqual([]);
      expect(await service.run()).toBe(false);
    });

    it('keeps the cell chosen as a leg was settled when the pointer passes over another square on its way out', async () => {
      const piece = pieceAt(0, 0, 3);
      service.begin(piece);
      service.lookAt(160, 60);
      service.settle();
      service.lookAt(260, 60);
      service.lookAt(560, 560);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 50 });
    });

    it('walks a piece wider than a square as on any other table, to the middle of the square', async () => {
      const piece = pieceAt(0, 0, 3);
      piece.size = 3;
      service.begin(piece);
      service.lookAt(260, 60);

      expect(service.plan()!.ahead.length).toBeGreaterThan(1);
      await service.run();

      expect(piece.location).toMatchObject({ x: 225, y: 25 });
    });

    it('measures the first step from where the piece stands, not the cell beside the middle of its square', () => {
      groundAt(1, 1, 1, 2);
      groundAt(2, 0, 2, 2);
      const piece = pieceAt(1, 1, 2);
      service.begin(piece);
      service.lookAt(110, 10);

      expect(service.plan()!.ahead).toEqual([cell(0, 0), cell(1, 0)]);
      expect(service.plan()!.landing).toMatchObject({ x: 100, y: 0 });
    });

    it('lands on the cell chosen as a leg was settled after pointing at a square with nowhere to stand', async () => {
      table.squareSpan = 3;
      wallOver(4, 0, 1);
      wallOver(4, 2, 1);
      const piece = pieceAt(0, 0, 3);
      piece.size = 2;
      service.begin(piece);
      service.lookAt(130, 230);
      service.settle();
      service.lookAt(225, 75);
      expect(service.plan()!.ahead).toEqual([]);

      await service.run();

      expect(piece.location).toMatchObject({ x: 50, y: 200 });
    });

    it('lands in the square rather than on a cell somebody built on while the move was worked out', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);
      wallOver(3, 1, 1);

      await service.run();

      expect(piece.location).toMatchObject({ x: 100, y: 0 });
    });

    it('puts the piece beside somebody who walked onto the cell chosen while the move was worked out', async () => {
      table.piecesShareCells = false;
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(110, 10);
      pieceAt(2, 0, 0);

      await service.run();

      expect(piece.location).toMatchObject({ x: 150, y: 0 });
    });

    it('forgets the cell chosen once the move is turned over to jumping or back', () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(60, 60);
      expect(service.plan()!.landing).not.toBeNull();

      service.toggleJump();

      expect(service.plan()!.landing).toBeNull();
    });

    it('has no square to shift within for a move setting out from elsewhere than where the piece stands', () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      const elsewhere = { ...service.plan()!, from: cell(1, 0), settled: [cell(1, 0)] };
      (service as unknown as { held: { set(plan: unknown): void } }).held.set(elsewhere);
      service.lookAt(160, 60);

      expect(service.movesWithinSquare()).toBe(false);
    });

    it('puts a piece it has no cell chosen for on the cells nearest the middle of the square', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);
      service.settle();
      service.lookAt(560, 560);
      service.plan()!.landing = null;
      service.plan()!.settledLanding = null;

      await service.run();

      expect(piece.location).toMatchObject({ x: 100, y: 0 });
    });

    it('takes a tap anywhere on a piece two cells across for a tap on the piece itself', async () => {
      table.squareSpan = 3;
      const piece = pieceAt(0, 0, 2);
      piece.size = 2;
      service.begin(piece);
      service.lookAt(80, 80);

      expect(service.movesWithinSquare()).toBe(false);
      expect(await service.run()).toBe(false);
    });

    it('forgets the cell it would have landed on once the way no longer ends in that square', async () => {
      const piece = pieceAt(0, 0, 2);
      service.begin(piece);
      service.lookAt(160, 60);
      service.lookAt(560, 560);

      expect(service.movesWithinSquare()).toBe(false);
      expect(await service.run()).toBe(false);
      expect(piece.location).toMatchObject({ x: 0, y: 0 });
    });
  });

  it('puts the piece back where it began when the move is called off', () => {
    const piece = pieceAt(5, 5, 4);
    service.begin(piece);
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);
    service.settle();

    service.cancel();

    expect(piece.location.x).toBe(5 * GRID);
    expect(piece.location.y).toBe(5 * GRID);
    expect(service.plan()).toBeNull();
  });
});
