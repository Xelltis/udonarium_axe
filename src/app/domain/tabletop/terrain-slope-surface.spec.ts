import { ObjectStore } from '@axe/core/sync/object-store';
import { GridType } from '@axe/domain/tabletop/game-table';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { SlopeSide } from '@axe/domain/tabletop/terrain-slope';
import { terrainLeanAt, terrainTopOutline, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

const GRID = 50;

describe('the surface of a sloping block', () => {
  const blocks: Terrain[] = [];

  function block(sides: SlopeSide[], at = { x: 0, y: 0 }, cells = 2, height = 2): Terrain {
    const terrain = Terrain.create('slope', cells, cells, height, '', '');
    terrain.location.x = at.x;
    terrain.location.y = at.y;
    terrain.slopeSides = sides;
    blocks.push(terrain);
    return terrain;
  }

  afterEach(() => {
    for (const terrain of blocks) ObjectStore.instance.remove(terrain);
    blocks.length = 0;
  });

  describe('how high it stands over a point', () => {
    it('stands its full height everywhere while it is flat', () => {
      const terrain = block([]);

      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 0, 0)).toBe(100);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 100, 100)).toBe(100);
    });

    it('climbs a ramp along it, from the ground at the side it runs down to', () => {
      const terrain = block(['s']);

      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 100)).toBeCloseTo(0);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 50)).toBeCloseTo(50);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 0)).toBeCloseTo(100);
    });

    it('rises to a point over the middle of a pyramid', () => {
      const terrain = block(['n', 'e', 's', 'w']);

      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 50)).toBeCloseTo(100);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 0)).toBeCloseTo(0);
    });

    it('carries the height a block was built at, and whatever it came to rest on', () => {
      const terrain = block(['s']);
      terrain.altitude = 1;
      terrain.posZ = 10;

      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 50, 0)).toBeCloseTo(50 + 10 + 100);
    });

    it('reads the slope where it stands after the block is turned', () => {
      const terrain = block(['s']);
      terrain.rotate = 90;

      // Turned a quarter, the slope runs down to the west instead.
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 0, 50)).toBeCloseTo(0);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 100, 50)).toBeCloseTo(100);
    });

    it('reads it where the block stands on the table, not at the corner of the table', () => {
      const terrain = block(['s'], { x: 300, y: 200 });

      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 350, 300)).toBeCloseTo(0);
      expect(terrainTopPxAt(terrain, GRID, GridType.SQUARE, 350, 200)).toBeCloseTo(100);
    });
  });

  describe('the outline of its top', () => {
    it('is the block itself on a square board', () => {
      const terrain = block([]);

      expect(terrainTopOutline(terrain, GRID, GridType.SQUARE)).toEqual([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ]);
    });

    it('is the hexagon of cells it covers on a hex board', () => {
      const terrain = block([]);

      const outline = terrainTopOutline(terrain, GRID, GridType.HEX_VERTICAL);

      expect(outline.length).toBeGreaterThan(4);
      expect(outline.every((corner) => Number.isFinite(corner.x) && Number.isFinite(corner.y))).toBe(true);
    });
  });

  describe('which way it leans', () => {
    it('leans nowhere while it is flat', () => {
      expect(terrainLeanAt(block([]), GRID, GridType.SQUARE, 50, 50)).toBeNull();
    });

    it('climbs to the north on a block running down to the south', () => {
      const lean = terrainLeanAt(block(['s']), GRID, GridType.SQUARE, 50, 50)!;

      expect(lean.eastward).toBeCloseTo(0);
      expect(lean.southward).toBeCloseTo(-1);
    });

    it('leans the way the ground runs, whichever way the block is turned', () => {
      const terrain = block(['s']);
      terrain.rotate = 90;

      const lean = terrainLeanAt(terrain, GRID, GridType.SQUARE, 50, 50)!;

      expect(lean.eastward).toBeCloseTo(1);
      expect(lean.southward).toBeCloseTo(0);
    });

    it('leans away from the middle on each side of a pyramid', () => {
      const terrain = block(['n', 'e', 's', 'w']);

      expect(terrainLeanAt(terrain, GRID, GridType.SQUARE, 50, 20)!.southward).toBeCloseTo(2);
      expect(terrainLeanAt(terrain, GRID, GridType.SQUARE, 50, 80)!.southward).toBeCloseTo(-2);
      expect(terrainLeanAt(terrain, GRID, GridType.SQUARE, 20, 50)!.eastward).toBeCloseTo(2);
    });
  });
});
