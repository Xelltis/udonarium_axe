import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { cheapestPath } from '@axe/domain/tabletop/move/cheapest-path';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';

const GRID = cellGridOf(600, 600, 50, GridType.SQUARE);

function at(col: number, row: number): number {
  return cellIndexOf(GRID, col, row);
}

const open = () => false;

describe('cheapestPath()', () => {
  it('starts on the cell it is asked from and ends on the one it is asked for', () => {
    const way = cheapestPath(GRID, at(1, 1), at(4, 1), 6, open)!;

    expect(way[0]).toBe(at(1, 1));
    expect(way[way.length - 1]).toBe(at(4, 1));
  });

  it('answers with one cell for a way that goes nowhere', () => {
    expect(cheapestPath(GRID, at(1, 1), at(1, 1), 6, open)).toEqual([at(1, 1)]);
  });

  it('hands back a way that is walkable in its own right', () => {
    const way = cheapestPath(GRID, at(1, 1), at(4, 3), 8, open)!;

    expect(walkedPath(GRID, way, open).walkable).toBe(true);
  });

  it('spends no more than the reach it was given', () => {
    const way = cheapestPath(GRID, at(1, 1), at(4, 1), 3, open)!;

    expect(walkedPath(GRID, way, open).cost).toBeLessThanOrEqual(3);
  });

  it('answers with nothing where the cell is further than the piece can walk', () => {
    expect(cheapestPath(GRID, at(1, 1), at(9, 1), 3, open)).toBeNull();
  });

  it('goes round ground nobody may enter', () => {
    const wall = new Set([at(2, 0), at(2, 1), at(2, 2)]);

    const way = cheapestPath(GRID, at(1, 1), at(3, 1), 8, (index) => wall.has(index))!;

    expect(way.some((cell) => wall.has(cell))).toBe(false);
    expect(way[way.length - 1]).toBe(at(3, 1));
  });

  it('answers with nothing where a wall shuts the way off entirely', () => {
    const wall = new Set<number>();
    for (let row = 0; row < 12; row++) wall.add(at(2, row));

    expect(cheapestPath(GRID, at(1, 1), at(3, 1), 4, (index) => wall.has(index))).toBeNull();
  });

  it('takes the long way round ground that costs more to cross', () => {
    const dear = at(2, 1);
    const way = cheapestPath(GRID, at(1, 1), at(3, 1), 8, open, {
      diagonals: 'none',
      costOf: (index) => (index === dear ? 9 : 1),
    })!;

    expect(way).not.toContain(dear);
  });

  it('counts on from the corners a settled leg already cut', () => {
    const owed = { diagonals: 'alternating', cornersCut: 1 } as const;

    expect(cheapestPath(GRID, at(1, 1), at(2, 2), 1, open, owed)).toBeNull();
    expect(cheapestPath(GRID, at(1, 1), at(2, 2), 2, open, owed)).toEqual([at(1, 1), at(2, 2)]);
  });

  it('may end on ground that ends a walk, but never carries on through it', () => {
    const sticky = new Set<number>();
    for (let row = 0; row < 12; row++) sticky.add(at(2, row));

    const onto = cheapestPath(GRID, at(1, 1), at(2, 1), 8, open, { stopsAt: (index) => sticky.has(index) });
    const beyond = cheapestPath(GRID, at(1, 1), at(3, 1), 8, open, { stopsAt: (index) => sticky.has(index) });

    expect(onto).toEqual([at(1, 1), at(2, 1)]);
    expect(beyond).toBeNull();
  });
});
