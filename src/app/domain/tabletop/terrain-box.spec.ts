import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';

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
