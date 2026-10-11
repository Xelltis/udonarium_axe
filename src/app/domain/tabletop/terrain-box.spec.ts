import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf, terrainCovers, turnedBoxCovers } from '@axe/domain/tabletop/terrain-box';

describe('terrainBoxOf', () => {
  function block(width: number, depth: number, rotate: number): Terrain {
    const terrain = Terrain.create('block', width, depth, 1, '', '');
    terrain.location.x = 100;
    terrain.location.y = 200;
    terrain.rotate = rotate;
    return terrain;
  }

  it('is the block itself while it stands square to the table', () => {
    expect(terrainBoxOf(block(2, 1, 0), 50)).toEqual({ minX: 100, minY: 200, maxX: 200, maxY: 250 });
  });

  it('swaps the sides of a block turned a quarter round', () => {
    const box = terrainBoxOf(block(2, 1, 90), 50);

    expect(box.maxX - box.minX).toBeCloseTo(50, 6);
    expect(box.maxY - box.minY).toBeCloseTo(100, 6);
  });

  it('widens to hold a block turned off the square', () => {
    const box = terrainBoxOf(block(2, 1, 45), 50);

    expect(box.maxX - box.minX).toBeGreaterThan(100);
    expect(box.maxY - box.minY).toBeGreaterThan(50);
  });

  it('turns about the middle of the block, wherever it stands', () => {
    const square = terrainBoxOf(block(2, 2, 0), 50);
    const turned = terrainBoxOf(block(2, 2, 180), 50);

    expect(turned.minX).toBeCloseTo(square.minX, 6);
    expect(turned.minY).toBeCloseTo(square.minY, 6);
  });
});

describe('terrainCovers', () => {
  function block(width: number, depth: number, rotate: number): Terrain {
    const terrain = Terrain.create('block', width, depth, 1, '', '');
    terrain.location.x = 100;
    terrain.location.y = 200;
    terrain.rotate = rotate;
    return terrain;
  }

  it('is the block itself while it stands square to the table, sides included', () => {
    const square = block(2, 1, 0);

    expect(terrainCovers(square, 50, 150, 225)).toBe(true);
    expect(terrainCovers(square, 50, 200, 250)).toBe(true);
    expect(terrainCovers(square, 50, 201, 225)).toBe(false);
  });

  it('covers the ground a block turned a quarter round stands on, and not the ground it left', () => {
    // Middle at 150, 225: turned, it runs 125 to 175 across and 175 to 275 down.
    const turned = block(2, 1, 90);

    expect(terrainCovers(turned, 50, 150, 265)).toBe(true);
    expect(terrainCovers(turned, 50, 110, 225)).toBe(false);
  });

  it('counts a side that falls on a whole pixel once the block is turned', () => {
    expect(terrainCovers(block(2, 1, 90), 50, 175, 225)).toBe(true);
    expect(terrainCovers(block(2, 1, 270), 50, 125, 275)).toBe(true);
  });

  it('leaves out the corners of the box that holds a block turned off the square', () => {
    const turned = block(2, 2, 45);
    const box = terrainBoxOf(turned, 50);

    expect(terrainCovers(turned, 50, box.minX + 2, box.minY + 2)).toBe(false);
    expect(terrainCovers(turned, 50, 150, 250)).toBe(true);
  });
});

describe('turnedBoxCovers', () => {
  it('reads an unturned box as it stands', () => {
    const box = { minX: 0, minY: 0, maxX: 100, maxY: 50 };

    expect(turnedBoxCovers(box, 0, 90, 10)).toBe(true);
    expect(turnedBoxCovers(box, 0, 50, 60)).toBe(false);
  });
});
