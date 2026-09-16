import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { isBatchable } from '@axe/domain/tabletop/terrain-batch/batchable';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;
const square = cellGridOf(10, 10, GRID, GridType.SQUARE);
const flat = cellGridOf(10, 10, GRID, GridType.HEX_VERTICAL);
const made: Terrain[] = [];

afterEach(() => {
  for (const terrain of made.splice(0)) terrain.destroy();
});

function wall(width = 1, depth = 1): Terrain {
  const terrain = Terrain.create('wall', width, depth, 2, 'wall.png', 'floor.png');
  terrain.isLocked = true;
  terrain.isTiledTexture = true;
  made.push(terrain);
  return terrain;
}

describe('which blocks may be drawn together with others', () => {
  it('draws a locked, tiled wall standing on the ground together', () => {
    expect(isBatchable(wall(3, 1), square)).toBe(true);
    expect(isBatchable(wall(), flat)).toBe(true);
  });

  it('draws alone anything a player can move, open, climb or turn', () => {
    const unlocked = wall();
    unlocked.isLocked = false;
    const door = wall();
    door.doorStyle = DoorStyle.SWING;
    const slope = wall();
    slope.isSlope = true;
    const turned = wall();
    turned.rotate = 90;

    for (const terrain of [unlocked, door, slope, turned]) expect(isBatchable(terrain, square)).toBe(false);
  });

  it('draws alone a block off the ground, one carrying a grid, and one with a face left open', () => {
    const raised = wall();
    raised.altitude = 1;
    const resting = wall();
    resting.posZ = 10;
    const gridded = wall();
    gridded.isGrid = true;
    const floorOnly = wall();
    floorOnly.mode = TerrainViewState.FLOOR;

    for (const terrain of [raised, resting, gridded, floorOnly]) expect(isBatchable(terrain, square)).toBe(false);
  });

  it('draws alone a glass block, which has no picture to draw', () => {
    const glass = Terrain.create('glass', 1, 1, 2, '', '');
    glass.isLocked = true;
    made.push(glass);

    expect(isBatchable(glass, square)).toBe(false);
  });

  it('draws a stretched picture together only on a square block one cell across, where it lies as a tile would', () => {
    const one = wall();
    one.isTiledTexture = false;
    const long = wall(3, 1);
    long.isTiledTexture = false;

    expect(isBatchable(one, square)).toBe(true);
    expect(isBatchable(long, square)).toBe(false);
  });

  it('draws alone a block whose size is not a whole number of cells, or cannot be read', () => {
    const thin = wall();
    thin.depth = 0.25;
    const blank = wall();
    blank.commonDataElement!.getFirstElementByName('width')!.value = '';

    expect(isBatchable(thin, square)).toBe(false);
    expect(isBatchable(blank, square)).toBe(false);
  });

  it('draws alone a hex block that is not a whole flower, or has no picture for its walls', () => {
    const oblong = wall(2, 1);
    const huge = wall(7, 7);
    const bare = Terrain.create('bare', 1, 1, 2, '', 'floor.png');
    bare.isLocked = true;
    made.push(bare);

    expect(isBatchable(oblong, flat)).toBe(false);
    expect(isBatchable(huge, flat)).toBe(false);
    expect(isBatchable(bare, flat)).toBe(false);
  });
});
