import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { blockOrigin } from '@axe/domain/tabletop/map-grid';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { squareCapsOf } from '@axe/domain/tabletop/terrain-batch/square-caps';
import { SquareWall } from '@axe/domain/tabletop/terrain-batch/square-walls';
import { stillTerrainLayoutOf } from '@axe/domain/tabletop/terrain-batch/still-terrain-layout';
import { occlusionShapeOf } from '@axe/domain/tabletop/terrain-occlusion/occlusion-shape';
import { BlockSide } from '@axe/domain/tabletop/terrain-shade';
import {
  capBackground,
  hiddenHexWallsOf,
  wallBackground,
  wallPlacement,
} from '@axe/features/tabletop/terrain-batch/terrain-batch-look';
import { afterEach, describe, expect, it } from 'vitest';

const GRID = 50;

type Vec = [number, number, number];
type Mat = (v: Vec) => Vec;

/**
 * Where a CSS transform list puts a point of an element, for the handful of functions the faces
 * use, as a browser works it out: about the origin, the rightmost function first.
 */
function place(point: Vec, transform: string, origin: Vec, box: { width: number; height: number }): Vec {
  const length = (value: string, of: number) =>
    value.endsWith('%') ? (parseFloat(value) / 100) * of : parseFloat(value);
  const angle = (value: string) => (value.endsWith('rad') ? parseFloat(value) : (parseFloat(value) * Math.PI) / 180);
  const steps: Mat[] = [...transform.matchAll(/(\w+)\(([^)]*)\)/g)].map(([, name, args]) => {
    const parts = args.split(',').map((part) => part.trim());
    switch (name) {
      case 'translate3d':
        return ([x, y, z]) => [
          x + length(parts[0], box.width),
          y + length(parts[1], box.height),
          z + parseFloat(parts[2]),
        ];
      case 'translateX':
        return ([x, y, z]) => [x + length(parts[0], box.width), y, z];
      case 'translateY':
        return ([x, y, z]) => [x, y + length(parts[0], box.height), z];
      case 'scaleX':
        return ([x, y, z]) => [x * parseFloat(parts[0]), y, z];
      case 'rotateX': {
        const a = angle(parts[0]);
        return ([x, y, z]) => [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
      }
      case 'rotateZ': {
        const a = angle(parts[0]);
        return ([x, y, z]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
      }
      default:
        throw new Error(`no ${name}`);
    }
  });
  let v: Vec = [point[0] - origin[0], point[1] - origin[1], point[2] - origin[2]];
  for (const step of [...steps].reverse()) v = step(v);
  return [v[0] + origin[0], v[1] + origin[1], v[2] + origin[2]];
}

function originOf(value: string, box: { width: number; height: number }): Vec {
  const [x, y] = value.split(' ');
  const length = (part: string, of: number) => (part.endsWith('%') ? (parseFloat(part) / 100) * of : parseFloat(part));
  return [length(x, box.width), length(y, box.height), 0];
}

/** Where a block drawn alone stands the corners of one of its faces, on the table. */
function aloneCorners(side: BlockSide, at: { x: number; y: number }, w: number, d: number, h: number): Vec[] {
  const faces: Record<BlockSide, { left: number; top: number; width: number; origin: string; transform: string }> = {
    north: {
      left: 0,
      top: 0,
      width: w,
      origin: '50% 100%',
      transform: 'translateY(-100%) rotateX(90deg) rotateZ(180deg) scaleX(-1)',
    },
    south: { left: 0, top: d - h, width: w, origin: '50% 100%', transform: 'rotateX(-90deg)' },
    west: {
      left: 0,
      top: 0,
      width: d,
      origin: '0% 0%',
      transform: 'rotateZ(90deg) rotateX(-90deg) scaleX(-1) translateX(-100%) translateY(-100%)',
    },
    east: {
      left: w - d,
      top: 0,
      width: d,
      origin: '100% 0%',
      transform: 'rotateZ(-90deg) rotateX(-90deg) translateY(-100%)',
    },
  };
  const face = faces[side];
  const box = { width: face.width, height: h };
  return (
    [
      [0, 0, 0],
      [face.width, 0, 0],
      [0, h, 0],
      [face.width, h, 0],
    ] as Vec[]
  ).map((corner) => {
    const [x, y, z] = place(corner, face.transform, originOf(face.origin, box), box);
    return [x + face.left + at.x, y + face.top + at.y, z];
  });
}

function wallCorners(wall: SquareWall): Vec[] {
  const box = { width: wall.lengthPx, height: wall.heightPx };
  const placement = wallPlacement(wall);
  return (
    [
      [0, 0, 0],
      [wall.lengthPx, 0, 0],
      [0, wall.heightPx, 0],
      [wall.lengthPx, wall.heightPx, 0],
    ] as Vec[]
  ).map((corner) => place(corner, placement.transform, originOf(placement.origin, box), box));
}

const made: Terrain[] = [];

afterEach(() => {
  for (const terrain of made.splice(0)) terrain.destroy();
});

function wall(x: number, y: number, width: number, depth: number, height = 2): Terrain {
  const terrain = Terrain.create('wall', width, depth, height, 'wall.png', 'floor.png');
  terrain.location.x = x;
  terrain.location.y = y;
  terrain.isLocked = true;
  terrain.isTiledTexture = true;
  made.push(terrain);
  return terrain;
}

describe('where a wall stands', () => {
  const grid = cellGridOf(20, 20, GRID, GridType.SQUARE);

  it('stands each side exactly where a block drawn alone stands that face, picture end and all', () => {
    const block = wall(100, 150, 3, 2);
    const { squareWalls } = stillTerrainLayoutOf([{ terrain: block, shownWhole: true, selected: false }], grid);

    expect(squareWalls).toHaveLength(4);
    for (const wall of squareWalls) {
      const expected = aloneCorners(wall.side, block.location, 150, 100, 100);
      wallCorners(wall).forEach((corner, i) => {
        expect(corner[0]).toBeCloseTo(expected[i][0], 6);
        expect(corner[1]).toBeCloseTo(expected[i][1], 6);
        expect(corner[2]).toBeCloseTo(expected[i][2], 6);
      });
    }
  });
});

describe('the background of a cap', () => {
  const [cap] = squareCapsOf(
    [
      { identifier: 'a', col: 0, row: 0, cols: 1, rows: 2, topPx: 100, look: 'stone' },
      { identifier: 'b', col: 1, row: 0, cols: 1, rows: 2, topPx: 100, look: 'stone' },
    ],
    GRID
  );

  it('lays one flat shade over the picture where the cap is lit evenly', () => {
    const background = capBackground(cap, [[{ at: 1, value: 0.5 }], [{ at: 1, value: 0.5 }]], 'a.png', GRID, '0,0,0');

    expect(background.image).toBe('linear-gradient(rgba(0,0,0,0.500), rgba(0,0,0,0.500)), url(a.png)');
    expect(background.size).toBe('100% 100%, 50px 50px');
    expect(background.position).toBe('0 0, 1px 1px');
  });

  it('lays a band a row, the outer rows reaching over the bleed', () => {
    const background = capBackground(
      cap,
      [
        [
          { at: 1, value: 1 },
          { at: 51, value: 1 },
          { at: 51, value: 0.5 },
        ],
        [{ at: 1, value: 0.25 }],
      ],
      'a.png',
      GRID,
      '0,0,0'
    );

    expect(background.size).toBe('102px 51px, 102px 51px, 50px 50px');
    expect(background.position).toBe('0 0px, 0 51px, 1px 1px');
  });

  it('lays only the picture where the cap is fully lit', () => {
    expect(capBackground(cap, [[{ at: 1, value: 1 }], [{ at: 1, value: 1 }]], 'a.png', GRID, '0,0,0').image).toBe(
      'url(a.png)'
    );
  });
});

describe('the background of a wall', () => {
  const wall: SquareWall = {
    key: 'a:north',
    identifier: 'a',
    side: 'north',
    startX: 0,
    startY: 0,
    lengthPx: 100,
    heightPx: 100,
  };

  it('tiles a tiled picture a cell to a tile, and a stretched one a cell long and the wall high', () => {
    expect(wallBackground(wall, [{ at: 0, value: 1 }], 'a.png', GRID, true, '0,0,0').size).toBe('50px 50px');
    expect(wallBackground(wall, [{ at: 0, value: 1 }], 'a.png', GRID, false, '0,0,0').size).toBe('50px 100px');
  });

  it('lays the shade along the wall over the picture', () => {
    const background = wallBackground(
      wall,
      [
        { at: 0, value: 1 },
        { at: 50, value: 0.5 },
      ],
      'a.png',
      GRID,
      true,
      '1,2,3'
    );

    expect(background.image).toBe(
      'linear-gradient(to right, rgba(1,2,3,0.000) 0px, rgba(1,2,3,0.500) 50px), url(a.png)'
    );
    expect(background.repeat).toBe('no-repeat, repeat');
  });
});

for (const isFlatTop of [true, false]) {
  describe(`the walls of a hex block on ${isFlatTop ? 'flat' : 'pointy'}-topped hexes`, () => {
    const type = isFlatTop ? GridType.HEX_VERTICAL : GridType.HEX_HORIZONTAL;

    /** The names of every side of a block `size` across, on a board of cells `gridSize` wide. */
    function everySide(gridSize: number, size: number): ReadonlySet<string> {
      const grid = cellGridOf(40, 40, gridSize, type);
      const origin = blockOrigin({ x: 10, y: 10, w: 1, h: 1 }, { sizePx: gridSize, type });
      const offset = ((size - 1) * gridSize) / 2;
      const block = wall(origin.x - offset, origin.y - offset, size, size);
      return new Set(occlusionShapeOf(block, grid, true)!.faces.map((face) => face.key));
    }

    it('finds each wall its neighbours hide, whatever size the cells are', () => {
      for (let gridSize = 10; gridSize <= 120; gridSize++) {
        for (let size = 1; size <= 6; size++) {
          const hidden = everySide(gridSize, size);
          const walls = hiddenHexWallsOf(calcHexFlowerParams(size, gridSize, isFlatTop), hidden);

          expect(walls, `${gridSize}px cells, ${size} across`).toHaveLength(hidden.size);
          expect(walls.filter(Boolean), `${gridSize}px cells, ${size} across`).toHaveLength(hidden.size);
        }
      }
    });

    it('hides only the walls named', () => {
      const params = calcHexFlowerParams(2, GRID, isFlatTop);
      const [one] = everySide(GRID, 2);

      expect(hiddenHexWallsOf(params, new Set([one])).filter(Boolean)).toHaveLength(1);
      expect(hiddenHexWallsOf(params, new Set()).some(Boolean)).toBe(false);
    });
  });
}
