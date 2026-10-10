import { enclosedCells, firstPersonRoofOf } from '@axe/domain/tabletop/first-person/first-person-roof';
import { firstPersonWorldOf } from '@axe/domain/tabletop/first-person/first-person-world';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCount, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function block(col: number, row: number, width: number, depth: number, height = 1): Terrain {
  const terrain = Terrain.create('壁', width, depth, height, 'stone', 'slab');
  terrain.location = { name: 'table', x: col * GRID, y: row * GRID };
  return terrain;
}

function room(gap = false): Terrain[] {
  return [
    block(2, 2, 5, 1),
    gap ? block(2, 8, 2, 1) : block(2, 8, 5, 1),
    ...(gap ? [block(5, 8, 2, 1)] : []),
    block(2, 3, 1, 5),
    block(6, 3, 1, 5),
  ];
}

function roofOf(terrains: Terrain[], gridType = GridType.SQUARE) {
  const grid = cellGridOf(10, 10, GRID, gridType);
  const world = firstPersonWorldOf({ width: 10, height: 10, gridSize: GRID, gridType, imageIdentifier: '' }, terrains);
  return { grid, roof: firstPersonRoofOf(grid, terrains, world) };
}

describe('first-person-roof', () => {
  it('shuts in nothing on an open board', () => {
    const grid = cellGridOf(6, 6, GRID, GridType.SQUARE);

    expect(enclosedCells(grid, new CellBits(cellCount(grid))).isEmpty).toBe(true);
  });

  it('roofs a room its walls shut in, at the height of its walls, and not the ground outside it', () => {
    const { grid, roof } = roofOf(room());

    expect(roof?.heightPx).toBe(GRID);
    expect(roof!.cells.get(cellIndexOf(grid, 4, 5))).toBe(true);
    expect(roof!.cells.get(cellIndexOf(grid, 0, 0))).toBe(false);
    expect(roof!.cells.get(cellIndexOf(grid, 8, 5))).toBe(false);
  });

  it('leaves a room open to the sky where a gap in its walls lets it out to the edge', () => {
    const { grid, roof } = roofOf(room(true));

    expect(roof?.cells.get(cellIndexOf(grid, 4, 5)) ?? false).toBe(false);
  });

  it('counts a door as a wall, open or shut, so a room with a door is still roofed', () => {
    const door = block(4, 8, 1, 1);
    door.doorStyle = DoorStyle.SWING;
    door.isDoorOpen = true;
    const { grid, roof } = roofOf([...room(true), door]);

    expect(roof!.cells.get(cellIndexOf(grid, 4, 5))).toBe(true);
  });

  it('puts no roof over the field round a tower standing out in the open', () => {
    const { grid, roof } = roofOf([block(4, 4, 1, 1, 3)]);

    expect(roof?.cells.get(cellIndexOf(grid, 4, 6)) ?? false).toBe(false);
    expect(roof?.cells.get(cellIndexOf(grid, 0, 0)) ?? false).toBe(false);
  });

  it('roofs a room shut in on a hex board too', () => {
    const { grid, roof } = roofOf(room(), GridType.HEX_VERTICAL);

    expect(roof!.cells.get(cellIndexOf(grid, 4, 5))).toBe(true);
    expect(roof!.cells.get(cellIndexOf(grid, 0, 0))).toBe(false);
  });
});
