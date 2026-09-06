import { TestBed } from '@angular/core/testing';
import { MovePlanService } from '@axe/application/tabletop/move-plan.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { DataElement } from '@axe/domain/data/data-element';
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
