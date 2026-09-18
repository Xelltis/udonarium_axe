import { Terrain } from '@axe/domain/tabletop/terrain';
import { BlockSide } from '@axe/domain/tabletop/terrain-shade';

/**
 * One upright face of a block on a square board, drawn as a surface of its own.
 *
 * Faces lying end to end along a line are not joined into one surface. The browser works out which
 * surface of a table is in front of which by cutting them along each other's planes, and faces
 * joined across a room crossed so many of those planes that the floor was drawn over part of them.
 * One to a face, they are cut as the faces of a block drawn alone are.
 */
export interface SquareWall {
  readonly key: string;
  readonly identifier: string;
  readonly side: BlockSide;
  /**
   * Where the face starts on the table, at the end its picture is laid from: the west end of a north
   * or south face, the south end of a west or east face.
   */
  readonly startX: number;
  readonly startY: number;
  readonly lengthPx: number;
  readonly heightPx: number;
}

/** One side of a block standing square on the board, placed on the table. */
export function squareWallOf(terrain: Terrain, side: BlockSide, gridSize: number): SquareWall {
  const { x, y } = terrain.location;
  const widthPx = terrain.width * gridSize;
  const depthPx = terrain.depth * gridSize;
  const base = {
    key: `${terrain.identifier}:${side}`,
    identifier: terrain.identifier,
    side,
    heightPx: terrain.height * gridSize,
  };
  switch (side) {
    case 'north':
      return { ...base, startX: x, startY: y, lengthPx: widthPx };
    case 'south':
      return { ...base, startX: x, startY: y + depthPx, lengthPx: widthPx };
    case 'west':
      return { ...base, startX: x, startY: y + depthPx, lengthPx: depthPx };
    default:
      return { ...base, startX: x + widthPx, startY: y + depthPx, lengthPx: depthPx };
  }
}
