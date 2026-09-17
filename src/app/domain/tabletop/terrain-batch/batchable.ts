import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TerrainFace } from '@axe/domain/tabletop/terrain';

/** The largest hex block drawn together with others: a flower six cells across, as its own drawing goes. */
const LARGEST_HEX_BLOCK = 6;

function wholeCount(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 1 ? number : null;
}

function isZero(value: unknown): boolean {
  return (typeof value === 'number' ? value : Number(value)) === 0;
}

/** Whether a picture has been chosen for a face, directly or through the picture its faces share. */
function drawn(terrain: Terrain, face: TerrainFace, shared: 'wall' | 'floor'): boolean {
  return terrain.faceImageIdentifier(face).length > 0 || terrain.faceImageIdentifier(shared).length > 0;
}

/**
 * Whether a block may be drawn together with the blocks around it rather than on its own.
 *
 * Only a block nobody will move, open, climb or look at by itself, and one that looks the same
 * drawn either way: locked in place on the floor, a plain box standing on the ground, square to
 * the grid, and with a picture on every face. Its picture has to lie the same way too, which a
 * tiled picture does on any block and a stretched one only on a block one cell across; a hex
 * picture is laid from the corner of the block's own outline either way.
 *
 * Whether it is selected, and what the fog leaves of it, are asked separately.
 */
export function isBatchable(terrain: Terrain, grid: CellGrid): boolean {
  if (surfaceOf(terrain) !== 'floor' || grid.sizePx <= 0) return false;
  if (!terrain.isLocked || terrain.isDoor || terrain.isSlope || terrain.isGrid) return false;
  if (!isZero(terrain.rotate) || !isZero(terrain.altitude) || !isZero(terrain.posZ)) return false;
  if (!terrain.hasWall || !terrain.hasFloor) return false;
  const height = typeof terrain.height === 'number' ? terrain.height : Number(terrain.height);
  if (!(height > 0) || !Number.isFinite(height)) return false;
  const width = wholeCount(terrain.width);
  const depth = wholeCount(terrain.depth);
  if (width === null || depth === null) return false;
  if (!drawn(terrain, 'top', 'floor')) return false;

  if (isHexGrid(grid.type)) {
    return width === depth && width <= LARGEST_HEX_BLOCK && terrain.faceImageIdentifier('wall').length > 0;
  }
  const sides = ['north', 'south', 'west', 'east'] as const;
  if (!sides.every((side) => drawn(terrain, side, 'wall'))) return false;
  return terrain.isTiledTexture || (width === 1 && depth === 1);
}
