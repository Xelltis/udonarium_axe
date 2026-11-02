import { movedByDoor, openDoorMotion } from '@axe/domain/tabletop/door-motion';
import { GridType } from '@axe/domain/tabletop/game-table';
import { PickPoint2, PickPrism } from '@axe/domain/tabletop/pick/pick-geometry';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
import { SurfaceDims, SurfaceFrame, surfaceWorldBox } from '@axe/domain/tabletop/surface-space';
import { surfaceKeyOf, surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainSlopeRoofOf, terrainTopOutline, terrainTopPxAt } from '@axe/domain/tabletop/terrain-slope-surface';

/** The layer terrain is picked on. */
export const TERRAIN_PICK_LAYER = 'terrain';

/**
 * A point of a block's outline, from the corner it is drawn from, turned about the block's middle
 * by its turn (clockwise in degrees) and set where the block stands on the table.
 */
function placed(terrain: Terrain, gridSize: number, point: PickPoint2): PickPoint2 {
  const middleX = (terrain.width * gridSize) / 2;
  const middleY = (terrain.depth * gridSize) / 2;
  const turn = (terrain.rotate * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const dx = point.x - middleX;
  const dy = point.y - middleY;
  return {
    x: terrain.location.x + middleX + dx * cos - dy * sin,
    y: terrain.location.y + middleY + dx * sin + dy * cos,
  };
}

/**
 * The solid a block makes: its top's outline (a rectangle on a square board, the hexagon of its
 * cells on a hex one) stood up from where it rests to its top, which may slope.
 */
export function terrainPickShape(terrain: Terrain, gridSize: number, gridType: GridType, groundLiftPx = 0): PickPrism {
  // An open door is picked where it has swung, slid, lifted or sunk to.
  const door = openDoorMotion(terrain, gridSize);
  const base = terrain.altitude * gridSize + terrain.posZ + (door?.lift ?? 0) + groundLiftPx;
  const top = base + terrain.height * gridSize;
  const outline = terrainTopOutline(terrain, gridSize, gridType).map((point) =>
    placed(terrain, gridSize, door ? movedByDoor(door, point.x, point.y) : point)
  );
  const slopes = terrainSlopeRoofOf(terrain, gridSize, gridType) !== null;
  return {
    kind: 'prism',
    outline,
    base,
    top,
    roofAt: slopes ? (x, y) => terrainTopPxAt(terrain, gridSize, gridType, x, y) + groundLiftPx : undefined,
  };
}

/**
 * A block on the floor, or stuck to a white board, as something a press can land on. A board lays
 * out what stands on it as the floor does, so a block on one is the same shape read in the board's
 * frame. A block on the floor stands as far up as the raised ground lifts it.
 */
export function terrainPickTarget(
  terrain: Terrain,
  gridSize: number,
  gridType: GridType,
  boardFrame?: SurfaceFrame,
  groundLiftPx = 0
): PickTarget {
  const shape = terrainPickShape(terrain, gridSize, gridType, groundLiftPx);
  return {
    id: terrain.identifier,
    layer: TERRAIN_PICK_LAYER,
    order: 0,
    surface: surfaceKeyOf(terrain),
    shapes: [boardFrame ? { kind: 'on-face', frame: boardFrame, shape } : shape],
  };
}

/**
 * A block put on a wall of the table, a beam running out from it into the room, as something a
 * press can land on. The walls are square to the table, so the beam is the box it fills.
 */
export function beamPickTarget(terrain: Terrain, gridSize: number, dims: SurfaceDims): PickTarget {
  const surface = surfaceOf(terrain);
  const box = surfaceWorldBox(
    surface,
    terrain.location.x,
    terrain.location.y,
    terrain.width * gridSize,
    terrain.depth * gridSize,
    terrain.altitude * gridSize + terrain.posZ,
    terrain.height * gridSize,
    dims
  );
  return {
    id: terrain.identifier,
    layer: TERRAIN_PICK_LAYER,
    order: 0,
    surface,
    shapes: [
      {
        kind: 'prism',
        outline: [
          { x: box.minX, y: box.minY },
          { x: box.maxX, y: box.minY },
          { x: box.maxX, y: box.maxY },
          { x: box.minX, y: box.maxY },
        ],
        base: box.minZ,
        top: box.maxZ,
      },
    ],
  };
}
