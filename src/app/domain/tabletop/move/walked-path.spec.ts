import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { walkedPath } from '@axe/domain/tabletop/move/walked-path';

const GRID = cellGridOf(600, 600, 50, GridType.SQUARE);

function at(col: number, row: number): number {
  return cellIndexOf(GRID, col, row);
}

const nothingBlocked = () => false;

describe('walkedPath()', () => {
  it('counts a step for each cell entered', () => {
    const way = [at(1, 1), at(2, 1), at(3, 1)];

    expect(walkedPath(GRID, way, nothingBlocked)).toEqual({ walkable: true, cost: 2, corners: 0 });
  });

  it('counts nothing for standing still', () => {
    expect(walkedPath(GRID, [at(1, 1)], nothingBlocked)).toEqual({ walkable: true, cost: 0, corners: 0 });
  });

  it('passes over a cell named twice in a row', () => {
    const way = [at(1, 1), at(1, 1), at(2, 1)];

    expect(walkedPath(GRID, way, nothingBlocked).cost).toBe(1);
  });

  it('refuses a step onto anything that is not a neighbour', () => {
    const way = [at(1, 1), at(5, 5)];

    expect(walkedPath(GRID, way, nothingBlocked).walkable).toBe(false);
  });

  it('refuses a step onto ground nobody may enter', () => {
    const wall = at(2, 1);

    expect(walkedPath(GRID, [at(1, 1), wall], (index) => index === wall).walkable).toBe(false);
  });

  it('counts a corner as one step where corners may be cut', () => {
    const way = [at(1, 1), at(2, 2)];

    expect(walkedPath(GRID, way, nothingBlocked, { diagonals: 'equal' })).toEqual({
      walkable: true,
      cost: 1,
      corners: 1,
    });
  });

  it('refuses the corner where corners may not be cut', () => {
    const way = [at(1, 1), at(2, 2)];

    expect(walkedPath(GRID, way, nothingBlocked, { diagonals: 'none' }).walkable).toBe(false);
  });

  it('counts a corner one, then two, by turns', () => {
    const way = [at(1, 1), at(2, 2), at(3, 3)];

    expect(walkedPath(GRID, way, nothingBlocked, { diagonals: 'alternating' })).toEqual({
      walkable: true,
      cost: 3,
      corners: 2,
    });
  });

  it('counts on from the corners cut before it, so a leg is not a fresh reckoning', () => {
    const way = [at(1, 1), at(2, 2)];

    expect(walkedPath(GRID, way, nothingBlocked, { diagonals: 'alternating', cornersCut: 1 })).toEqual({
      walkable: true,
      cost: 2,
      corners: 2,
    });
  });

  it('charges two for a corner where the table always does', () => {
    const way = [at(1, 1), at(2, 2), at(3, 3)];

    expect(walkedPath(GRID, way, nothingBlocked, { diagonals: 'double' }).cost).toBe(4);
  });

  it('charges what a cell of its own price costs', () => {
    const dear = at(2, 1);
    const way = [at(1, 1), dear, at(3, 1)];

    expect(walkedPath(GRID, way, nothingBlocked, { costOf: (index) => (index === dear ? 3 : 1) }).cost).toBe(4);
  });

  it('refuses a way that carries on past ground that ends the walk', () => {
    const sticky = at(2, 1);
    const way = [at(1, 1), sticky, at(3, 1)];

    expect(walkedPath(GRID, way, nothingBlocked, { stopsAt: (index) => index === sticky }).walkable).toBe(false);
  });

  it('allows a way that ends on the ground that ends the walk', () => {
    const sticky = at(2, 1);
    const way = [at(1, 1), sticky];

    expect(walkedPath(GRID, way, nothingBlocked, { stopsAt: (index) => index === sticky })).toEqual({
      walkable: true,
      cost: 1,
      corners: 0,
    });
  });

  it('reads a way with nothing in it as no way at all', () => {
    expect(walkedPath(GRID, [], nothingBlocked).walkable).toBe(false);
  });
});
