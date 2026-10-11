import { MinimapGround, minimapViewOf } from '@axe/domain/tabletop/first-person/minimap-view';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function groundOn(grid: CellGrid, overrides: Partial<MinimapGround> = {}): MinimapGround {
  const count = grid.cols * grid.rows;
  return { grid, walls: new CellBits(count), noEntry: null, doors: new Map(), reveal: null, ...overrides };
}

function eyeAt(grid: CellGrid, col: number, row: number, yaw = 0) {
  const centre = cellCenterOf(grid, cellIndexOf(grid, col, row));
  return { x: centre.x, y: centre.y, z: 25, yaw };
}

describe('minimapViewOf', () => {
  const grid = cellGridOf(20, 20, GRID, GridType.SQUARE);

  it('shows the cells within reach of the eye and none beyond', () => {
    const view = minimapViewOf(groundOn(grid), eyeAt(grid, 10, 10), 2);
    const indexes = new Set(view.cells.map((cell) => cell.index));

    expect(indexes.has(cellIndexOf(grid, 10, 8))).toBe(true);
    expect(indexes.has(cellIndexOf(grid, 12, 10))).toBe(true);
    expect(indexes.has(cellIndexOf(grid, 12, 12))).toBe(false);
    expect(indexes.has(cellIndexOf(grid, 10, 13))).toBe(false);
  });

  it('marks walls, painted no-entry cells, and doors shut or open', () => {
    const walls = new CellBits(400);
    walls.set(cellIndexOf(grid, 11, 10));
    walls.set(cellIndexOf(grid, 10, 9));
    const noEntry = new CellBits(400);
    noEntry.set(cellIndexOf(grid, 9, 10));
    const doors = new Map([
      [cellIndexOf(grid, 10, 9), false],
      [cellIndexOf(grid, 10, 11), true],
    ]);

    const tones = new Map(
      minimapViewOf(groundOn(grid, { walls, noEntry, doors }), eyeAt(grid, 10, 10), 2).cells.map((cell) => [
        cell.index,
        cell.tone,
      ])
    );

    expect(tones.get(cellIndexOf(grid, 11, 10))).toBe('wall');
    expect(tones.get(cellIndexOf(grid, 9, 10))).toBe('noEntry');
    expect(tones.get(cellIndexOf(grid, 10, 9))).toBe('doorShut');
    expect(tones.get(cellIndexOf(grid, 10, 11))).toBe('doorOpen');
    expect(tones.get(cellIndexOf(grid, 10, 10))).toBe('floor');
  });

  it('shows a player only the ground the table has shown them', () => {
    const reveal = new CellBits(400);
    reveal.set(cellIndexOf(grid, 10, 10));
    reveal.set(cellIndexOf(grid, 10, 9));

    const view = minimapViewOf(groundOn(grid, { reveal }), eyeAt(grid, 10, 10), 3);

    expect(view.cells.map((cell) => cell.index).sort((a, b) => a - b)).toEqual(
      [cellIndexOf(grid, 10, 9), cellIndexOf(grid, 10, 10)].sort((a, b) => a - b)
    );
  });

  it('centres on the eye, faces the way it looks, and outlines hexes as hexes', () => {
    const hexes = cellGridOf(20, 20, GRID, GridType.HEX_VERTICAL);
    const eye = eyeAt(hexes, 10, 10, 60);

    const view = minimapViewOf(groundOn(hexes), eye, 1);

    expect(view.centre).toEqual({ x: eye.x, y: eye.y });
    expect(view.yaw).toBe(60);
    expect(view.radiusPx).toBe(GRID);
    expect(view.cells.every((cell) => cell.outline.length === 6)).toBe(true);
    expect(view.cells).toHaveLength(7);
  });
});
