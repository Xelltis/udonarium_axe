import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { StillTerrainInput, stillTerrainLayoutOf } from '@axe/domain/tabletop/terrain-batch/still-terrain-layout';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;
const made: Terrain[] = [];

afterEach(() => {
  for (const terrain of made.splice(0)) terrain.destroy();
});

function wall(x: number, y: number, size = 1): Terrain {
  const terrain = Terrain.create('wall', size, size, 2, 'wall.png', 'floor.png');
  terrain.location.x = x;
  terrain.location.y = y;
  terrain.isLocked = true;
  terrain.isTiledTexture = true;
  made.push(terrain);
  return terrain;
}

function still(terrain: Terrain, extra: Partial<StillTerrainInput> = {}): StillTerrainInput {
  return { terrain, shownWhole: true, selected: false, ...extra };
}

describe('the blocks that do not move, drawn together on a square board', () => {
  const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);

  it('draws two walls side by side together', () => {
    const west = wall(100, 100);
    const east = wall(150, 100);
    const layout = stillTerrainLayoutOf([still(west), still(east)], grid);

    expect([...layout.merged].sort()).toEqual([east.identifier, west.identifier].sort());
  });

  it('draws a selected wall alone', () => {
    const west = wall(100, 100);
    const east = wall(150, 100);
    const layout = stillTerrainLayoutOf([still(west), still(east, { selected: true })], grid);

    expect([...layout.merged]).toEqual([west.identifier]);
  });

  it('draws alone a wall the fog has cut back', () => {
    const west = wall(100, 100);
    const east = wall(150, 100);
    const layout = stillTerrainLayoutOf([still(west), still(east, { shownWhole: false })], grid);

    expect([...layout.merged]).toEqual([west.identifier]);
  });

  it('draws alone blocks laid over one another, and a block hanging off the board', () => {
    const one = wall(100, 100);
    const two = wall(100, 100);
    const hanging = wall(450, 100, 2);
    const layout = stillTerrainLayoutOf([still(one), still(two), still(hanging)], grid);

    expect(layout.merged.size).toBe(0);
  });

  it('draws alone a wall anyone may move, beside one drawn together', () => {
    const merged = wall(100, 100);
    const unlocked = wall(150, 100);
    unlocked.isLocked = false;
    const layout = stillTerrainLayoutOf([still(merged), still(unlocked)], grid);

    expect([...layout.merged]).toEqual([merged.identifier]);
  });
});

for (const isFlatTop of [true, false]) {
  describe(`the blocks that do not move, drawn together on ${isFlatTop ? 'flat' : 'pointy'}-topped hexes`, () => {
    const type = isFlatTop ? GridType.HEX_VERTICAL : GridType.HEX_HORIZONTAL;
    const grid = cellGridOf(10, 10, GRID, type);

    function hexWall(col: number, row: number, size = 1): Terrain {
      const origin = blockOrigin({ x: col, y: row, w: 1, h: 1 }, { sizePx: GRID, type });
      const offset = ((size - 1) * GRID) / 2;
      return wall(origin.x - offset, origin.y - offset, size);
    }

    it('draws neighbouring hexes together', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 4, 4)[1];
      const here = hexWall(4, 4);
      const there = hexWall(4 + dx, 4 + dy);
      const layout = stillTerrainLayoutOf([still(here), still(there)], grid);

      expect([...layout.merged].sort()).toEqual([here.identifier, there.identifier].sort());
    });

    it('draws a flower of hexes together', () => {
      const flower = hexWall(4, 4, 2);
      const layout = stillTerrainLayoutOf([still(flower)], grid);

      expect([...layout.merged]).toEqual([flower.identifier]);
    });

    it('draws alone a hex nobody has reached any of', () => {
      const layout = stillTerrainLayoutOf([still(hexWall(4, 4), { shownWhole: false })], grid);

      expect(layout.merged.size).toBe(0);
    });
  });
}
