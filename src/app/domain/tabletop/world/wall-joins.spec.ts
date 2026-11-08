import { cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type JoinableBlock, wallJoinsOf } from '@axe/domain/tabletop/world/wall-joins';

describe('wallJoinsOf()', () => {
  const grid = cellGridOf(6, 6, 50, GridType.SQUARE);
  const at = (col: number, row: number) => cellIndexOf(grid, col, row);
  const wall = (owner: string, cells: number[], model = 'timber_frame_wall'): JoinableBlock => ({
    owner,
    model,
    door: false,
    cells,
  });

  it('reaches a run out along itself and round its corner into the run beside it, as far as the side of each cell', () => {
    const joins = wallJoinsOf(grid, [
      wall('row', [at(1, 1), at(2, 1), at(3, 1)]),
      wall('column', [at(1, 2), at(1, 3)]),
    ]);

    const row = joins.get('row')!;
    expect(row.map((cell) => [cell.x, cell.y])).toEqual([
      [75, 75],
      [125, 75],
      [175, 75],
    ]);
    expect(row[0].arms).toEqual([
      { deg: 0, lengthPx: 25 },
      { deg: 90, lengthPx: 25 },
    ]);
    expect(row[1].arms.map((arm) => arm.deg)).toEqual([0, 180]);
    expect(row[2].arms.map((arm) => arm.deg)).toEqual([180]);
    expect(joins.get('column')![0].arms.map((arm) => arm.deg)).toEqual([90, 270]);
  });

  it('runs a wall on into a door hung in it, and leaves the door as it hangs', () => {
    const door: JoinableBlock = { owner: 'door', model: '', door: true, cells: [at(2, 1)] };
    const joins = wallJoinsOf(grid, [wall('left', [at(1, 1)]), door, wall('right', [at(3, 1)])]);

    expect(joins.get('left')![0].arms.map((arm) => arm.deg)).toEqual([0]);
    expect(joins.get('right')![0].arms.map((arm) => arm.deg)).toEqual([180]);
    expect(joins.has('door')).toBe(false);
  });

  it('joins no wall to one drawn as another model, and leaves out a block that reaches out to nothing', () => {
    const joins = wallJoinsOf(grid, [wall('house', [at(1, 1)]), wall('fence', [at(2, 1)], 'rail_fence')]);

    expect(joins.size).toBe(0);
  });

  it('reaches out to each of the six sides of a hex, whichever way the hexes stand', () => {
    for (const type of [GridType.HEX_HORIZONTAL, GridType.HEX_VERTICAL]) {
      const hexes = cellGridOf(6, 6, 50, type);
      const middle = cellIndexOf(hexes, 2, 2);
      const around: number[] = [];
      for (let col = 0; col < 6; col++)
        for (let row = 0; row < 6; row++) if (col !== 2 || row !== 2) around.push(cellIndexOf(hexes, col, row));
      const joins = wallJoinsOf(hexes, [
        { owner: 'middle', model: 'log_wall', door: false, cells: [middle] },
        { owner: 'rest', model: 'log_wall', door: false, cells: around },
      ]);

      const arms = joins.get('middle')![0].arms;
      expect(arms).toHaveLength(6);
      const turns = arms.map((arm) => arm.deg).sort((a, b) => a - b);
      expect(turns.slice(1).map((deg, index) => Math.round(deg - turns[index]))).toEqual([60, 60, 60, 60, 60]);
      expect(new Set(arms.map((arm) => Math.round(arm.lengthPx))).size).toBe(1);
    }
  });
});
