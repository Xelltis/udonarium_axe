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

/**
 * How high a block was built to hang, in pixels above the floor of the table.
 *
 * The height it was built at and nothing else. What it came to rest on is left out on
 * purpose: a wall standing on a pedestal has that pedestal under it, and reading the gap as
 * open would let a look pass through solid ground. A block that hangs clear of everything is
 * the only one with a way beneath it, and that is what its altitude says.
 */
export function terrainBasePx(terrain: Terrain, gridSize: number): number {
  return terrain.altitude * gridSize;
}
