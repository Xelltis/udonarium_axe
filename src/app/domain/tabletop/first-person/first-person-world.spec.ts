import {
  FirstPersonTableShape,
  FirstPersonWall,
  firstPersonWorldOf,
} from '@axe/domain/tabletop/first-person/first-person-world';
import { GridType } from '@axe/domain/tabletop/game-table';
import { DoorStyle, Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function tableOf(gridType: GridType = GridType.SQUARE): FirstPersonTableShape {
  return { width: 10, height: 8, gridSize: GRID, gridType, imageIdentifier: 'floor-picture' };
}

function block(width: number, depth: number, height: number, wall = 'stone', floor = 'slab'): Terrain {
  const terrain = Terrain.create('壁', width, depth, height, wall, floor);
  terrain.location = { name: 'table', x: 2 * GRID, y: 3 * GRID };
  return terrain;
}

function seenFromTheFront(wall: FirstPersonWall): boolean {
  return (wall.bx - wall.ax) * wall.ny - (wall.by - wall.ay) * wall.nx >= 0;
}

describe('firstPersonWorldOf', () => {
  it('stands four walls round a block on squares, however long it runs', () => {
    const world = firstPersonWorldOf(tableOf(), [block(3, 1, 1)]);

    expect(world.walls).toHaveLength(4);
    const north = world.walls.find((wall) => wall.id.endsWith(':north'))!;
    expect(north.ny).toBeCloseTo(-1);
    expect(Math.min(north.ax, north.bx)).toBeCloseTo(2 * GRID);
    expect(Math.max(north.ax, north.bx)).toBeCloseTo(5 * GRID);
    expect(north.basePx).toBe(0);
    expect(north.topPx).toBe(GRID);
  });

  it('lays every wall out left to right as it is seen from in front', () => {
    const world = firstPersonWorldOf(tableOf(GridType.HEX_VERTICAL), [block(1, 1, 1), block(1, 0.25, 1)]);

    expect(world.walls.length).toBeGreaterThan(0);
    expect(world.walls.every(seenFromTheFront)).toBe(true);
  });

  it('turns the walls of a turned block with it', () => {
    const terrain = block(1, 2, 1);
    terrain.rotate = 90;

    const north = firstPersonWorldOf(tableOf(), [terrain]).walls.find((wall) => wall.id.endsWith(':north'))!;

    expect(north.nx).toBeCloseTo(1);
    expect(north.ny).toBeCloseTo(0);
  });

  it('builds a block on a hex board as the hex prism the table draws', () => {
    const world = firstPersonWorldOf(tableOf(GridType.HEX_VERTICAL), [block(1, 1, 1)]);

    expect(world.walls).toHaveLength(6);
    const centre = { x: 2.5 * GRID, y: 3.5 * GRID };
    for (const wall of world.walls) {
      const outX = (wall.ax + wall.bx) / 2 - centre.x;
      const outY = (wall.ay + wall.by) / 2 - centre.y;
      expect(wall.nx * outX + wall.ny * outY).toBeGreaterThan(0);
      expect(Math.hypot(wall.nx, wall.ny)).toBeCloseTo(1);
    }
  });

  it('follows the flower of hexes a larger block covers', () => {
    const world = firstPersonWorldOf(tableOf(GridType.HEX_HORIZONTAL), [block(2, 2, 1)]);

    expect(world.walls).toHaveLength(18);
  });

  it('draws a slab thinner than a hex as the box the table draws it as', () => {
    const world = firstPersonWorldOf(tableOf(GridType.HEX_VERTICAL), [block(1, 0.25, 1)]);

    expect(world.walls).toHaveLength(4);
  });

  it('marks the walls of a shut door, and leaves an open one out', () => {
    const door = block(1, 0.25, 1);
    door.doorStyle = DoorStyle.SWING;

    expect(firstPersonWorldOf(tableOf(), [door]).walls.every((wall) => wall.door)).toBe(true);

    door.isDoorOpen = true;
    const opened = firstPersonWorldOf(tableOf(), [door]);
    expect(opened.walls).toHaveLength(0);
    expect(opened.caps).toHaveLength(0);
  });

  it('draws a block with no picture anywhere as glass, and one that lets sight through as such', () => {
    const blank = block(1, 1, 1, '', '');
    const window = block(1, 1, 1);
    window.blocksSight = false;

    const world = firstPersonWorldOf(tableOf(), [blank, window]);

    expect(world.walls.filter((wall) => wall.terrain === blank.identifier).every((wall) => wall.glass)).toBe(true);
    expect(world.walls.filter((wall) => wall.terrain === window.identifier).every((wall) => wall.seeThrough)).toBe(
      true
    );
    expect(world.walls.filter((wall) => wall.terrain === window.identifier).every((wall) => wall.glass)).toBe(false);
  });

  it('dresses each side in its own picture, and the rest in the wall picture', () => {
    const terrain = block(1, 1, 1, 'stone');
    terrain.setFaceImage('north', 'carved');

    const images = new Map(
      firstPersonWorldOf(tableOf(), [terrain]).walls.map((wall) => [wall.id.split(':')[1], wall.image])
    );

    expect(images.get('north')).toBe('carved');
    expect(images.get('south')).toBe('stone');
  });

  it('puts a lid on a block, and a floor that is only a floor gets a lid and no walls', () => {
    const stair = block(1, 1, 0.1);
    stair.mode = TerrainViewState.FLOOR;

    const world = firstPersonWorldOf(tableOf(), [stair]);

    expect(world.walls).toHaveLength(0);
    expect(world.caps).toHaveLength(1);
    expect(world.caps[0].facing).toBe('up');
    expect(world.caps[0].zPx).toBeCloseTo(0.1 * GRID);
    expect(world.caps[0].image).toBe('slab');
  });

  it('gives a block hung above the floor an underside, and walls that start where it does', () => {
    const lintel = block(1, 1, 1);
    lintel.altitude = 1;

    const world = firstPersonWorldOf(tableOf(), [lintel]);

    expect(world.walls.every((wall) => wall.basePx === GRID && wall.topPx === 2 * GRID)).toBe(true);
    expect(world.caps.map((cap) => cap.facing).sort()).toEqual(['down', 'up']);
  });

  it('leaves out what is not standing on the floor of the table', () => {
    const hung = block(1, 1, 1);
    hung.location = { ...hung.location, surface: 'north-wall' };

    expect(firstPersonWorldOf(tableOf(), [hung]).walls).toHaveLength(0);
  });

  it('spreads the floor picture over the table on squares, and over the hex board it is drawn on', () => {
    expect(firstPersonWorldOf(tableOf(), []).floor).toEqual({
      x: 0,
      y: 0,
      width: 10 * GRID,
      height: 8 * GRID,
      image: 'floor-picture',
    });

    const hexFloor = firstPersonWorldOf(tableOf(GridType.HEX_VERTICAL), []).floor;
    expect(hexFloor.x).toBeLessThan(0);
    expect(hexFloor.y).toBeCloseTo(-GRID / 2);
  });

  it('stands the table walls that are shown round the edge, facing in', () => {
    const table = {
      ...tableOf(GridType.HEX_VERTICAL),
      wallHeight: 3,
      showNorthWall: true,
      showWestWall: true,
      northWallImageIdentifier: 'brick',
    };

    const perimeter = firstPersonWorldOf(table, []).walls;

    expect(perimeter.map((wall) => wall.id).sort()).toEqual(['table:north', 'table:west']);
    const north = perimeter.find((wall) => wall.id === 'table:north')!;
    expect(north.ny).toBe(1);
    expect(north.topPx).toBe(3 * GRID);
    expect(north.image).toBe('brick');
    expect(perimeter.every(seenFromTheFront)).toBe(true);
  });

  it('stands no table walls where the table is given no height for them', () => {
    const table = { ...tableOf(), wallHeight: 0, showNorthWall: true };

    expect(firstPersonWorldOf(table, []).walls).toHaveLength(0);
  });
});
