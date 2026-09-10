import { TestBed } from '@angular/core/testing';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
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
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number, walk: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    DataElement.findElementByReference(character.rootDataElement!, '移動')!.value = walk;
    return character;
  }

  function wallOver(col: number, fromRow: number, depthCells: number): void {
    const terrain = Terrain.create('壁', 1, depthCells, 1, '', '');
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

  it('opens on the cell the piece stands on, with nothing settled and nothing spent', () => {
    const piece = pieceAt(5, 5, 3);

    expect(service.begin(piece)).toBe(true);

    const plan = service.plan()!;
    expect(plan.from).toBe(cell(5, 5));
    expect(plan.settled).toEqual([cell(5, 5)]);
    expect(plan.spent).toBe(0);
    expect(plan.budget).toBe(3);
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

  it('settles the way drawn, and works the next one out from where it ended', () => {
    service.begin(pieceAt(5, 5, 4));
    service.lookAt(7 * GRID + 10, 5 * GRID + 10);

    service.settle();

    const plan = service.plan()!;
    expect(plan.from).toBe(cell(7, 5));
    expect(plan.spent).toBe(2);
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

    it('leaves a face too sheer to climb out of reach, jumping or not', () => {
      blockOver(6, 5, 2, true);
      service.begin(pieceAt(5, 5, 3));

      service.toggleJump();

      expect(service.plan()!.reach.get(cell(6, 5))).toBe(false);
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

      expect(service.plan()!.spent).toBe(1);
      expect(service.plan()!.cornersCut).toBe(1);

      service.lookAt(7 * GRID + 10, 7 * GRID + 10);
      service.settle();

      // The second corner of the move costs two, wherever the reader chose to break the way.
      expect(service.plan()!.spent).toBe(3);
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
