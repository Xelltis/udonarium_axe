import { movedByDoor, openDoorMotion } from '@axe/domain/tabletop/door-motion';
import { GridType } from '@axe/domain/tabletop/game-table';
import { PickPoint2, PickPrism } from '@axe/domain/tabletop/pick/pick-geometry';
import { PickTarget } from '@axe/domain/tabletop/pick/pick-index';
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
export function terrainPickShape(terrain: Terrain, gridSize: number, gridType: GridType): PickPrism {
  // An open door is picked where it has swung, slid, lifted or sunk to.
  const door = openDoorMotion(terrain, gridSize);
  const base = terrain.altitude * gridSize + terrain.posZ + (door?.lift ?? 0);
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
    roofAt: slopes ? (x, y) => terrainTopPxAt(terrain, gridSize, gridType, x, y) : undefined,
  };
}

/** A block as something a press can land on. */
export function terrainPickTarget(terrain: Terrain, gridSize: number, gridType: GridType): PickTarget {
  return {
    id: terrain.identifier,
    layer: TERRAIN_PICK_LAYER,
    order: 0,
    shapes: [terrainPickShape(terrain, gridSize, gridType)],
  };
}
