import { ObjectStore } from '@axe/core/sync/object-store';
import { Terrain, TerrainViewState } from '@axe/domain/tabletop/terrain';
import { terrainCostOf } from '@axe/testing/terrain-cost';

describe('terrainCostOf', () => {
  function wall(name: string): Terrain {
    const terrain = Terrain.create(name, 2, 1, 3, 'wall-image', 'floor-image');
    terrain.mode = TerrainViewState.ALL;
    return terrain;
  }

  afterEach(() => {
    for (const terrain of ObjectStore.instance.getObjects(Terrain)) terrain.destroy();
  });

  it('counts nothing for a table with no terrain on it', () => {
    expect(terrainCostOf([])).toEqual({ terrains: 0, syncObjects: 0, xmlBytes: 0 });
  });

  it('counts a box as the twelve objects a joining peer is sent', () => {
    const cost = terrainCostOf([wall('a wall')]);

    expect(cost.terrains).toBe(1);
    expect(cost.syncObjects).toBe(12);
  });

  it('counts every box on the table', () => {
    const cost = terrainCostOf([wall('one'), wall('two'), wall('three')]);

    expect(cost.terrains).toBe(3);
    expect(cost.syncObjects).toBe(36);
  });

  it('says how much of a saved room the terrain takes up', () => {
    const one = terrainCostOf([wall('one')]);
    const three = terrainCostOf([wall('one'), wall('two'), wall('three')]);

    expect(one.xmlBytes).toBeGreaterThan(0);
    expect(three.xmlBytes).toBeGreaterThan(one.xmlBytes * 2);
  });
});
