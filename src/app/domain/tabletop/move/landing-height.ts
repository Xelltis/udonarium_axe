import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';
import { terrainTopPx } from '@axe/domain/tabletop/terrain-height';

/**
 * How high the ground stands at a point on the table.
 *
 * The floor unless something is standing there to be stood on. A face too sheer to climb is
 * not: a piece that cannot get up it cannot be put down on top of it either.
 */
export function landingHeightAt(terrains: readonly Terrain[], gridSize: number, x: number, y: number): number {
  let highest = 0;
  for (const terrain of terrains) {
    if (surfaceOf(terrain) !== 'floor') continue;
    if (terrain.blocksClimb) continue;
    if (terrain.isDoor && terrain.isDoorOpen) continue;
    const box = terrainBoxOf(terrain, gridSize);
    if (x < box.minX || x > box.maxX || y < box.minY || y > box.maxY) continue;
    const top = terrainTopPx(terrain, gridSize);
    if (top > highest) highest = top;
  }
  return highest;
}

/**
 * How high a piece is, part way through a hop from one height to another.
 *
 * Read at a fraction of the way across. The rise is walked evenly and an arch is laid over
 * it, so the piece leaves the ground before the face it is getting over and comes down on the
 * far side of it rather than climbing the wall on the way past.
 */
export function hopHeightAt(progress: number, fromZ: number, toZ: number, liftPx: number): number {
  const along = Math.min(1, Math.max(0, progress));
  const arch = 4 * along * (1 - along);
  return fromZ + (toZ - fromZ) * along + liftPx * arch;
}

/**
 * How high a piece throws itself to clear the face it is getting over.
 *
 * Enough that it is over the ledge before it is above it, or the piece would be drawn walking
 * up through the wall and stepping out at the top. Going down wants no such throw: a piece
 * leaving a ledge steps off it and falls.
 */
export function hopLiftFor(fromZ: number, toZ: number, gridSize: number): number {
  return Math.max(gridSize * 0.3, Math.max(0, toZ - fromZ) * 0.8);
}
