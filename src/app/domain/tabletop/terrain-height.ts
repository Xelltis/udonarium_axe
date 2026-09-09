import { Terrain } from '@axe/domain/tabletop/terrain';

/**
 * How high the top of a block stands, in pixels above the floor of the table.
 *
 * Three numbers say where a block is: the height it was built at, whatever it came to rest
 * on, and how thick it is. Reading only the first and the last puts a block that is standing
 * on something else back down on the floor.
 */
export function terrainTopPx(terrain: Terrain, gridSize: number): number {
  return terrain.altitude * gridSize + terrain.posZ + terrain.height * gridSize;
}
