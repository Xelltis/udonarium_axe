import { GridType } from '@axe/domain/tabletop/game-table';
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { drawnSlopeSides, gridSlopeKind, gridSlopeSides } from '@axe/domain/tabletop/terrain-slope';
import {
  buildSlopeRoof,
  slopeHeightAt,
  SlopePlane,
  SlopePoint,
  SlopeRoof,
} from '@axe/domain/tabletop/terrain-slope-roof';

/** How a surface leans under a point: the way it runs down, and how steeply. */
export interface SurfaceLean {
  /** How much the surface climbs to the east, in pixels for each pixel across. */
  eastward: number;
  /** How much it climbs to the south, in pixels for each pixel down. */
  southward: number;
}

/**
 * The slope of a block as it stands on a table, or nothing where the block is flat.
 *
 * The outline is the block's own top: a rectangle on a square board, the hexagon of cells it
 * covers on a hex one, in pixels from the corner the block is drawn from.
 */
export function terrainSlopeRoofOf(terrain: Terrain, gridSize: number, gridType: GridType): SlopeRoof | null {
  const sides = drawnSlopeSides(terrain, gridSlopeSides(gridType));
  if (sides.length < 1) return null;
  return buildSlopeRoof(
    terrainTopOutline(terrain, gridSize, gridType),
    sides,
    terrain.height * gridSize,
    gridSlopeKind(gridType)
  );
}

/** The outline of a block's top, in pixels from the corner the block is drawn from. */
export function terrainTopOutline(terrain: Terrain, gridSize: number, gridType: GridType): SlopePoint[] {
  const width = terrain.width * gridSize;
  const depth = terrain.depth * gridSize;
  if (isHexGrid(gridType)) {
    const size = Math.min(terrain.width, terrain.depth);
    if (size >= 1) {
      const params = calcHexFlowerParams(size, gridSize, isFlatTopGrid(gridType));
      return params.outline.map((corner) => ({ x: width / 2 + corner.x, y: depth / 2 + corner.y }));
    }
  }
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

/**
 * How high the top of a block stands over one point of the table, in pixels above the floor.
 *
 * A flat block stands the same height everywhere; a sloping one is read where it is stood on,
 * so a piece walked up a ramp climbs it rather than stepping onto the high end of it.
 */
export function terrainTopPxAt(terrain: Terrain, gridSize: number, gridType: GridType, x: number, y: number): number {
  const base = terrain.altitude * gridSize + terrain.posZ;
  const roof = terrainSlopeRoofOf(terrain, gridSize, gridType);
  if (!roof) return base + terrain.height * gridSize;
  const local = intoBlock(terrain, gridSize, x, y);
  return base + slopeHeightAt(roof, local.x, local.y);
}

/**
 * Which way the top of a block leans under one point of the table, or nothing where it is flat.
 *
 * Read in the table's own directions rather than the block's, so a piece standing on a turned
 * block leans the way the ground it is on actually runs.
 */
export function terrainLeanAt(
  terrain: Terrain,
  gridSize: number,
  gridType: GridType,
  x: number,
  y: number
): SurfaceLean | null {
  const roof = terrainSlopeRoofOf(terrain, gridSize, gridType);
  if (!roof) return null;
  const local = intoBlock(terrain, gridSize, x, y);
  const plane = planeUnder(roof, local);
  if (!plane) return null;
  const turn = (terrain.rotate * Math.PI) / 180;
  return {
    eastward: plane.a * Math.cos(turn) - plane.b * Math.sin(turn),
    southward: plane.a * Math.sin(turn) + plane.b * Math.cos(turn),
  };
}

/** The flat piece of the slope a point stands on, by the side its surface runs down to there. */
function planeUnder(roof: SlopeRoof, point: SlopePoint): SlopePlane | null {
  let nearest: SlopePlane | null = null;
  let lowest = Infinity;
  for (const face of roof.faces) {
    const height = face.plane.a * point.x + face.plane.b * point.y + face.plane.c;
    if (height < lowest) {
      lowest = height;
      nearest = face.plane;
    }
  }
  return nearest;
}

/** A point of the table, in pixels from the corner the block is drawn from. */
function intoBlock(terrain: Terrain, gridSize: number, x: number, y: number): SlopePoint {
  const width = terrain.width * gridSize;
  const depth = terrain.depth * gridSize;
  const turn = (terrain.rotate * Math.PI) / 180;
  const fromMiddleX = x - (terrain.location.x + width / 2);
  const fromMiddleY = y - (terrain.location.y + depth / 2);
  return {
    x: width / 2 + fromMiddleX * Math.cos(turn) + fromMiddleY * Math.sin(turn),
    y: depth / 2 - fromMiddleX * Math.sin(turn) + fromMiddleY * Math.cos(turn),
  };
}
