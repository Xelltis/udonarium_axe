import { TestBed } from '@angular/core/testing';
import { PieceStepService } from '@axe/application/tabletop/piece-step.service';
import { TriggerFireService } from '@axe/application/tabletop/trigger-fire.service';
import { ObjectStore } from '@axe/core/sync/object-store';
import { GameCharacter } from '@axe/domain/character/game-character';
import { CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GameTable, GridSnapStyle } from '@axe/domain/tabletop/game-table';
import { moveGridOf } from '@axe/domain/tabletop/move/move-grid';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TEST_PROVIDERS } from '@axe/testing/test-providers';
import { vi } from 'vitest';

const GRID = 50;

describe('PieceStepService', () => {
  let service: PieceStepService;
  let table: GameTable;
  let grid: CellGrid;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...TEST_PROVIDERS] });
    table = new GameTable();
    table.width = 12;
    table.height = 12;
    table.gridSize = GRID;
    table.initialize();
    grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    service = TestBed.inject(PieceStepService);
  });

  afterEach(() => {
    for (const object of ObjectStore.instance.getObjects()) ObjectStore.instance.remove(object);
  });

  function pieceAt(col: number, row: number): GameCharacter {
    const character = GameCharacter.create('コマ', 1, '');
    character.location = { name: 'table', x: col * GRID, y: row * GRID };
    return character;
  }

  function blockOver(col: number, row: number, height: number): void {
    const terrain = Terrain.create('岩', 1, 1, height, '', '', `rock_${col}_${row}`);
    terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
    table.appendChild(terrain);
  }

  it('reads the ground under the cell a piece is kept to, not the middle of its square', async () => {
    table.squareSpan = 2;
    table.gridSnapStyle = GridSnapStyle.GRID;
    const squares = moveGridOf(table);
    blockOver(3, 1, 1);
    const piece = pieceAt(0, 0);

    const landed = await service.step(piece, table, squares, cellIndexOf(squares, 1, 0), true);

    expect(landed).toBe(0);
    expect([piece.location.x, piece.location.y]).toEqual([100, 0]);
  });

  it('steps onto the cell nearest the middle of a square that it can step onto, not a pillar', async () => {
    table.squareSpan = 2;
    table.gridSnapStyle = GridSnapStyle.GRID;
    const squares = moveGridOf(table);
    blockOver(2, 0, 2);
    const piece = pieceAt(0, 0);

    const landed = await service.step(piece, table, squares, cellIndexOf(squares, 1, 0), true);

    expect(landed).toBe(0);
    expect([piece.location.x, piece.location.y]).toEqual([150, 0]);
  });

  it('keeps off the cells the move says the piece may not stand on', async () => {
    table.squareSpan = 2;
    table.gridSnapStyle = GridSnapStyle.GRID;
    const squares = moveGridOf(table);
    const piece = pieceAt(0, 0);
    const held = cellIndexOf(grid, 2, 0);

    await service.step(piece, table, squares, cellIndexOf(squares, 1, 0), true, 0, (cell) => cell !== held);

    expect([piece.location.x, piece.location.y]).toEqual([150, 0]);
  });

  it('puts the piece on the cell it steps to', async () => {
    const piece = pieceAt(5, 5);

    const landed = await service.step(piece, table, grid, cellIndexOf(grid, 6, 5), true);

    expect(landed).toBe(0);
    expect(piece.location.x).toBe(6 * GRID);
    expect(piece.location.y).toBe(5 * GRID);
  });

  function watch(piece: GameCharacter): { x: number; z: number }[] {
    const seen: { x: number; z: number }[] = [];
    const update = piece.update.bind(piece);
    vi.spyOn(piece, 'update').mockImplementation(() => {
      seen.push({ x: piece.location.x, z: piece.posZ });
      update();
    });
    return seen;
  }

  it('never shows a step across flat ground part of the way', async () => {
    const piece = pieceAt(5, 5);
    const seen = watch(piece);

    await service.step(piece, table, grid, cellIndexOf(grid, 6, 5), true);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((at) => at.x === 6 * GRID && at.z === 0)).toBe(true);
  });

  it('springs the cell once the piece is standing on it', async () => {
    const piece = pieceAt(5, 5);
    const target = cellIndexOf(grid, 6, 5);
    const standing: number[] = [];
    const sprung = vi.spyOn(TestBed.inject(TriggerFireService), 'stepped').mockImplementation(() => {
      standing.push(piece.location.x);
      return [];
    });

    await service.step(piece, table, grid, target, false);

    expect(sprung).toHaveBeenCalledWith(piece, grid, target, false);
    expect(standing).toEqual([6 * GRID]);
  });

  it('hops up onto a block through the air and lands on its top', async () => {
    blockOver(6, 5, 2);
    const piece = pieceAt(5, 5);
    const seen = watch(piece);

    const landed = await service.step(piece, table, grid, cellIndexOf(grid, 6, 5), true);

    expect(landed).toBe(2 * GRID);
    expect(seen.some((at) => at.x > 5 * GRID && at.x < 6 * GRID)).toBe(true);
    expect(seen[seen.length - 1]).toEqual({ x: 6 * GRID, z: 2 * GRID });
  });

  it('hops from the height the caller says it stands at', async () => {
    const piece = pieceAt(5, 5);
    const seen = watch(piece);

    const landed = await service.step(piece, table, grid, cellIndexOf(grid, 6, 5), true, 2 * GRID);

    expect(landed).toBe(0);
    expect(seen.some((at) => at.z > 0)).toBe(true);
    expect(seen[seen.length - 1]).toEqual({ x: 6 * GRID, z: 0 });
  });

  it('steps a piece to a point rather than a cell, and springs the cell under that point', async () => {
    const piece = pieceAt(5, 5);
    const sprung = vi.spyOn(TestBed.inject(TriggerFireService), 'stepped').mockReturnValue([]);

    await service.stepToPoint(piece, table, { x: 310, y: 275 }, true);

    expect(piece.location.x).toBe(285);
    expect(piece.location.y).toBe(250);
    expect(sprung).toHaveBeenCalledWith(piece, grid, cellIndexOf(grid, 6, 5), true);
  });
});
