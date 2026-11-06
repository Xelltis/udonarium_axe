import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { FLAT_GROUND, type GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import { Terrain } from '@axe/domain/tabletop/terrain';
import {
  boardShapeOf,
  EMPTY_TABLE_WORLD,
  sameTableWorld,
  type TableWorld,
  tableWorldOf,
} from '@axe/domain/tabletop/world/table-world';

describe('the table world', () => {
  function table(gridType = GridType.SQUARE): GameTable {
    const made = new GameTable();
    made.width = 20;
    made.height = 15;
    made.gridSize = 60;
    made.gridType = gridType;
    made.imageIdentifier = 'board-picture';
    return made;
  }

  it('lays the board out as wide and deep as its cells run, with its picture and a veil over it', () => {
    const board = tableWorldOf(table(GridType.HEX_VERTICAL), (identifier) => `blob:${identifier}`).board!;

    expect(board).toMatchObject({
      widthPx: 1200,
      depthPx: 900,
      gridSize: 60,
      gridType: GridType.HEX_VERTICAL,
      pictureUrl: 'blob:board-picture',
      veiled: true,
    });
  });

  it('lays the board over the ground, and what is laid on the floor over the ground as it is stood on, over the ice', () => {
    const ice: GroundSurface = { isFlat: false, sampleAt: () => 0.5, paintAt: () => null, heightAt: () => 0.5 };

    const frozen = tableWorldOf(
      table(),
      () => '',
      [],
      () => null,
      FLAT_GROUND,
      ice
    ).board!;
    expect(frozen.ground).toBeNull();
    expect(Math.min(...heightsOf(frozen.floorGround!.points))).toBeCloseTo(30);

    const open = tableWorldOf(
      table(),
      () => '',
      [],
      () => null,
      ice
    ).board!;
    expect(open.floorGround).toBe(open.ground);
    expect(tableWorldOf(table()).board!.floorGround).toBeNull();
  });

  it('gives a board no picture where its picture cannot be read', () => {
    expect(tableWorldOf(table()).board!.pictureUrl).toBe('');
  });

  it('draws nothing for no table', () => {
    expect(tableWorldOf(null)).toBe(EMPTY_TABLE_WORLD);
    expect(EMPTY_TABLE_WORLD.board).toBeNull();
  });

  it('stretches the picture of a square board over the whole board', () => {
    expect(boardShapeOf(20, 15, 50, GridType.SQUARE)).toEqual({
      box: { x: 0, y: 0, width: 1000, height: 750 },
      hexes: null,
    });
  });

  it('stretches the picture of a hex board past its cells, and cuts it to them', () => {
    const geo = computeHexMaskGeometry(4, 3, 50, GridType.HEX_HORIZONTAL)!;
    const shape = boardShapeOf(4, 3, 50, GridType.HEX_HORIZONTAL);

    expect(shape.box).toEqual({ x: -geo.offsetX, y: -geo.offsetY, width: geo.pixelW, height: geo.pixelH });
    expect(shape.hexes).toHaveLength(12);
    expect(shape.hexes![0]).toHaveLength(6);
    const xs = shape.hexes!.flat().map((corner) => corner.x);
    expect(Math.min(...xs)).toBeCloseTo(shape.box.x - 1, 0);
  });

  describe('the faces of the blocks and of the table', () => {
    const made: Terrain[] = [];
    afterEach(() => made.splice(0).forEach((terrain) => terrain.destroy()));

    function block(wallPicture: string, topPicture = ''): Terrain {
      const terrain = Terrain.create('block', 2, 1, 3, wallPicture, topPicture);
      terrain.location = { name: 'table', x: 100, y: 50 };
      made.push(terrain);
      return terrain;
    }

    const picture = (identifier: string) => (identifier ? `blob:${identifier}` : '');

    it('stands the sides of a block from its foot to its top, wearing its pictures', () => {
      const world = tableWorldOf(table(), picture, [block('stone', 'grass')]);
      const sides = world.walls.filter((wall) => !wall.id.startsWith('table:'));

      expect(sides).toHaveLength(4);
      expect(sides.every((wall) => wall.basePx === 0 && wall.topPx === 180 && wall.pictureUrl === 'blob:stone')).toBe(
        true
      );
      expect(world.caps.find((cap) => cap.facing === 'up')).toMatchObject({ zPx: 180, pictureUrl: 'blob:grass' });
    });

    it('makes a block with no picture on any face glass', () => {
      const world = tableWorldOf(table(), picture, [block('')]);
      expect(world.walls.filter((wall) => !wall.id.startsWith('table:')).every((wall) => wall.glass)).toBe(true);
    });

    it('stands a wall of the table only where it has a picture, as the page does', () => {
      const walled = table();
      walled.wallHeight = 4;
      walled.showNorthWall = true;
      walled.showEastWall = true;
      walled.northWallImageIdentifier = 'brick';
      walled.eastWallImageIdentifier = '';

      const tableWalls = tableWorldOf(walled, picture).walls.filter((wall) => wall.id.startsWith('table:'));

      expect(tableWalls.map((wall) => wall.id)).toEqual(['table:north']);
      expect(tableWalls[0]).toMatchObject({ topPx: 240, pictureUrl: 'blob:brick' });
    });
  });

  describe('whether two scenes draw the same', () => {
    const wall = { id: 'w:1' } as unknown as TableWorld['walls'][number];
    const sprite = {
      id: 'a#picture',
      owner: 'a',
      centre: { x: 1, y: 2, z: 0 },
    } as unknown as TableWorld['sprites'][number];
    const scene: TableWorld = { ...EMPTY_TABLE_WORLD, walls: [wall], sprites: [sprite] };

    it('takes a scene built again with the same faces and pieces of the same values for the same', () => {
      expect(
        sameTableWorld(scene, { ...scene, walls: [wall], sprites: [{ ...sprite, centre: { x: 1, y: 2, z: 0 } }] })
      ).toBe(true);
    });

    it('tells apart a piece moved, and faces built afresh, though they read the same', () => {
      expect(sameTableWorld(scene, { ...scene, sprites: [{ ...sprite, centre: { x: 1, y: 3, z: 0 } }] })).toBe(false);
      expect(sameTableWorld(scene, { ...scene, walls: [{ ...wall }] })).toBe(false);
    });
  });
});

/** The heights of the points of a mesh, every third figure from the third. */
function heightsOf(points: Float32Array): number[] {
  return [...points].filter((_, index) => index % 3 === 2);
}
