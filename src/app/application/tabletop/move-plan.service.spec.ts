import { TestBed } from '@angular/core/testing';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
import { Config } from '@axe/domain/peer/config';
import { PeerCursor } from '@axe/domain/peer/peer-cursor';
import { cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';

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
