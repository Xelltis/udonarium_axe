import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCircumradius, hexCornerOffsets } from '@axe/domain/tabletop/hex-geometry';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';
import { DoorStyle, Terrain } from '@axe/domain/tabletop/terrain';
import { hiddenFacesByTerrain, hiddenFacesOf } from '@axe/domain/tabletop/terrain-occlusion/hidden-faces';
import {
  hexFaceKey,
  hexFaceMidpointOf,
  OcclusionShape,
  occlusionShapeOf,
} from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;
const made: Terrain[] = [];

afterEach(() => {
  for (const terrain of made.splice(0)) terrain.destroy();
});

function block(options: { x: number; y: number; width?: number; depth?: number; height?: number }): Terrain {
  const terrain = Terrain.create(
    'block',
    options.width ?? 1,
    options.depth ?? 1,
    options.height ?? 2,
    'wall.png',
    'floor.png'
  );
  terrain.location.x = options.x;
  terrain.location.y = options.y;
  terrain.isLocked = true;
  made.push(terrain);
  return terrain;
}

function hiddenOn(grid: CellGrid, terrains: readonly Terrain[], shownWhole = () => true) {
  const shapes = terrains
    .map((terrain) => occlusionShapeOf(terrain, grid, shownWhole()))
    .filter((shape): shape is OcclusionShape => shape !== null);
  const hidden = hiddenFacesByTerrain(shapes);
  return (terrain: Terrain) => [...hiddenFacesOf(hidden, terrain.identifier)].sort();
}

describe('the sides a block pressed against another hides, on squares', () => {
  const grid = cellGridOf(10, 10, GRID, GridType.SQUARE);

  it('hides the two sides where two blocks of a height meet, and no others', () => {
    const west = block({ x: 100, y: 100 });
    const east = block({ x: 150, y: 100 });
    const hidden = hiddenOn(grid, [west, east]);

    expect(hidden(west)).toEqual(['east']);
    expect(hidden(east)).toEqual(['west']);
  });

  it('keeps the part of a tall side that stands clear of a lower neighbour', () => {
    const tall = block({ x: 100, y: 100, height: 3 });
    const low = block({ x: 150, y: 100, height: 1 });
    const hidden = hiddenOn(grid, [tall, low]);

    expect(hidden(tall)).toEqual([]);
    expect(hidden(low)).toEqual(['west']);
  });

  it('keeps the part of a raised side that is open beneath it', () => {
    const ground = block({ x: 100, y: 100, height: 2 });
    const raised = block({ x: 150, y: 100, height: 1 });
    raised.altitude = 1;
    const hidden = hiddenOn(grid, [ground, raised]);

    expect(hidden(raised)).toEqual(['west']);
    expect(hidden(ground)).toEqual([]);
  });

  it('keeps a long side a short neighbour covers only part of', () => {
    const long = block({ x: 100, y: 100, width: 2 });
    const short = block({ x: 100, y: 50 });
    const hidden = hiddenOn(grid, [long, short]);

    expect(hidden(long)).toEqual([]);
    expect(hidden(short)).toEqual(['south']);
  });

  it('hides a long side once neighbours cover all of it', () => {
    const long = block({ x: 100, y: 100, width: 2 });
    const hidden = hiddenOn(grid, [long, block({ x: 100, y: 50 }), block({ x: 150, y: 50 })]);

    expect(hidden(long)).toEqual(['north']);
  });

  it('names the side as the block draws it when the block is turned a quarter round', () => {
    const turned = block({ x: 75, y: 25, width: 2 });
    turned.rotate = 90;
    const hidden = hiddenOn(grid, [turned, block({ x: 150, y: 0, depth: 2 })]);

    // Turned clockwise a quarter, the side the block draws facing up faces the column to its east.
    expect(hidden(turned)).toEqual(['north']);
  });

  it('keeps every side at the edge of the board', () => {
    const corner = block({ x: 0, y: 0 });
    expect(hiddenOn(grid, [corner, block({ x: 50, y: 0 })])(corner)).toEqual(['east']);
  });

  it('lets nothing a player can move, open or climb hide a side', () => {
    const wall = block({ x: 100, y: 100 });
    const unlocked = block({ x: 150, y: 100 });
    unlocked.isLocked = false;
    const door = block({ x: 50, y: 100 });
    door.doorStyle = DoorStyle.SWING;
    const slope = block({ x: 100, y: 50 });
    slope.isSlope = true;
    const hidden = hiddenOn(grid, [wall, unlocked, door, slope]);

    expect(hidden(wall)).toEqual([]);
    expect(hidden(unlocked)).toEqual([]);
    expect(hidden(door)).toEqual([]);
    expect(hidden(slope)).toEqual([]);
  });

  it('lets no glass block hide a side, since it is seen through', () => {
    const wall = block({ x: 100, y: 100 });
    const glass = Terrain.create('glass', 1, 1, 2, '', '');
    glass.location.x = 150;
    glass.location.y = 100;
    glass.isLocked = true;
    made.push(glass);

    expect(hiddenOn(grid, [wall, glass])(wall)).toEqual([]);
  });

  it('lets no block the fog has cut back hide a side', () => {
    const wall = block({ x: 100, y: 100 });
    const fogged = block({ x: 150, y: 100 });

    expect(hiddenOn(grid, [wall, fogged], () => false)(wall)).toEqual([]);
  });

  it('leaves a block off the grid, or with sizes it cannot read, to be drawn whole', () => {
    const offGrid = block({ x: 110, y: 100 });
    expect(occlusionShapeOf(offGrid, grid, true)).toBeNull();

    const blankWidth = block({ x: 100, y: 100 });
    blankWidth.commonDataElement!.getFirstElementByName('width')!.value = '';
    expect(occlusionShapeOf(blankWidth, grid, true)).toBeNull();

    const blankHeight = block({ x: 200, y: 100 });
    blankHeight.commonDataElement!.getFirstElementByName('height')!.value = '';
    expect(occlusionShapeOf(blankHeight, grid, true)).toBeNull();
  });
});

for (const isFlatTop of [true, false]) {
  describe(`the sides a block pressed against another hides, on ${isFlatTop ? 'flat' : 'pointy'}-topped hexes`, () => {
    const type = isFlatTop ? GridType.HEX_VERTICAL : GridType.HEX_HORIZONTAL;
    const grid = cellGridOf(10, 10, GRID, type);
    const corners = hexCornerOffsets(hexCircumradius(GRID), isFlatTop);
    const sideKey = (side: number) =>
      hexFaceKey((corners[side].x + corners[(side + 1) % 6].x) / 2, (corners[side].y + corners[(side + 1) % 6].y) / 2);

    function hexBlock(col: number, row: number, size = 1): Terrain {
      const origin = blockOrigin({ x: col, y: row, w: 1, h: 1 }, { sizePx: GRID, type });
      const offset = ((size - 1) * GRID) / 2;
      return block({ x: origin.x - offset, y: origin.y - offset, width: size, depth: size });
    }

    it('hides the side each of two neighbouring hexes turns to the other', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 4, 4)[1];
      const here = hexBlock(4, 4);
      const there = hexBlock(4 + dx, 4 + dy);
      const hidden = hiddenOn(grid, [here, there]);

      expect(hidden(here)).toEqual([sideKey(1)]);
      expect(hidden(there)).toEqual([sideKey(4)]);
    });

    it('hides every side of a hex walled in all round', () => {
      const here = hexBlock(4, 4);
      const ring = hexSideStepsAt(isFlatTop, 4, 4).map(([dx, dy]) => hexBlock(4 + dx, 4 + dy));

      expect(hiddenOn(grid, [here, ...ring])(here)).toHaveLength(6);
    });

    it('gives a flower of hexes the eighteen sides round its edge', () => {
      const shape = occlusionShapeOf(hexBlock(4, 4, 2), grid, true);

      expect(shape?.cells).toHaveLength(7);
      expect(shape?.faces).toHaveLength(18);
    });

    it('names the side as the block draws it when the block is turned a sixth round', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 4, 4)[1];
      const here = hexBlock(4, 4);
      here.rotate = 60;
      const hidden = hiddenOn(grid, [here, hexBlock(4 + dx, 4 + dy)]);

      // Turned a sixth clockwise, the side the block draws as its first now lies where its second was.
      expect(hidden(here)).toEqual([sideKey(0)]);
    });

    it('leaves a hex that is turned off the grid, or not on a cell, to be drawn whole', () => {
      const turned = hexBlock(4, 4);
      turned.rotate = 45;
      expect(occlusionShapeOf(turned, grid, true)).toBeNull();

      const shifted = hexBlock(6, 6);
      shifted.location.x += 7;
      expect(occlusionShapeOf(shifted, grid, true)).toBeNull();
    });
  });
}

describe('the middle of a hex side, read back from its name', () => {
  it('reads back where the middle lies, to a tenth of a pixel', () => {
    expect(hexFaceMidpointOf(hexFaceKey(13.44, -7.72))).toEqual({ x: 13.4, y: -7.7 });
    expect(hexFaceMidpointOf(hexFaceKey(0, 25))).toEqual({ x: 0, y: 25 });
  });

  it('reads nothing from the name of a square side', () => {
    expect(hexFaceMidpointOf('north')).toBeNull();
  });
});
