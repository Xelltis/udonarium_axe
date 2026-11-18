import type { GridType } from '@axe/domain/tabletop/grid-type';
import { groundLiftOfBlock, type GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import { canBeStoodOn } from '@axe/domain/tabletop/move/landing-height';
import type { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainCovers } from '@axe/domain/tabletop/terrain-box';
import { terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

/**
 * How far the raised ground lifts a piece on the floor whose middle is at the point given, in
 * table pixels.
 *
 * A piece standing on the top of a block (its height `z` level with that top under its middle) is
 * lifted as far as the block is, so it stays on the block; anywhere else it is lifted by the ground
 * under its middle. The table draws pieces this way, and the eye looking out of a piece stands where
 * the table draws it. `blocks` are the terrain blocks that may be under the point; nothing is lifted
 * on flat ground.
 */
export function pieceGroundLiftAt(
  ground: GroundSurface,
  gridSize: number,
  gridType: GridType,
  blocks: Iterable<Terrain>,
  middleX: number,
  middleY: number,
  z: number
): number {
  if (ground.isFlat) return 0;
  for (const terrain of blocks) {
    if (!canBeStoodOn(terrain) || !terrainCovers(terrain, gridSize, middleX, middleY)) continue;
    const top = terrainTopPxAt(terrain, gridSize, gridType, middleX, middleY);
    if (Math.abs(top - z) < 1) return groundLiftOfBlock(ground, gridSize, terrain);
  }
  return ground.heightAt(middleX / gridSize, middleY / gridSize) * gridSize;
}

/**
 * How high the highest thing to land on stands under a point, for what comes down on it from
 * `belowPx`, in table pixels: the top of a block over the point that can be stood on, lifted as far
 * as the raised ground lifts the block, or else the ground itself. A block whose top stands over
 * where the thing comes down from is no place to land, as a bridge over a spout. `blocks` are the
 * terrain blocks that may be over the point.
 */
export function standingTopPxAt(
  ground: GroundSurface,
  gridSize: number,
  gridType: GridType,
  blocks: Iterable<Terrain>,
  x: number,
  y: number,
  belowPx: number
): number {
  let highest = ground.heightAt(x / gridSize, y / gridSize) * gridSize;
  for (const terrain of blocks) {
    if (!canBeStoodOn(terrain) || !terrainCovers(terrain, gridSize, x, y)) continue;
    const lift = ground.isFlat ? 0 : groundLiftOfBlock(ground, gridSize, terrain);
    const top = terrainTopPxAt(terrain, gridSize, gridType, x, y) + lift;
    if (top <= belowPx && top > highest) highest = top;
  }
  return highest;
}
