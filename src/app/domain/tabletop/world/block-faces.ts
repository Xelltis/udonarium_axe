import { movedByDoor, openDoorMotion } from '@axe/domain/tabletop/door-motion';
import { GridType } from '@axe/domain/tabletop/game-table';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TerrainImageSlot } from '@axe/domain/tabletop/terrain';
import { terrainTopPx } from '@axe/domain/tabletop/terrain-height';
import { SlopePoint, slopeProfileAlong, SlopeRoof } from '@axe/domain/tabletop/terrain-slope-roof';
import { terrainSlopeRoofOf, terrainTopOutline } from '@axe/domain/tabletop/terrain-slope-surface';
import type { TableWorldCap, TableWorldPoint, TableWorldWall } from '@axe/domain/tabletop/world/table-world';

/** The sides of a rectangular block, in the order its top's outline runs round them. */
const BOX_SIDES: readonly TerrainImageSlot[] = ['north', 'east', 'south', 'west'];

/**
 * The faces of the blocks standing on the floor: each block's sides standing from its foot to its
 * top, and its top, with its underside where it hangs above the floor.
 *
 * A block is laid out as its top's outline, a rectangle or the hex cells it covers, moved where an
 * open door has gone and turned about its middle. A sloping top is made of the flat pieces of its
 * slope, each corner at its own height, and the sides under it fold where the slope does. The sides
 * run from left to right as they are seen from outside, so a picture on one reads the right way.
 */
export function blockFacesOf(
  terrains: readonly Terrain[],
  gridSize: number,
  gridType: GridType,
  pictureOf: (identifier: string) => string
): { walls: TableWorldWall[]; caps: TableWorldCap[] } {
  const walls: TableWorldWall[] = [];
  const caps: TableWorldCap[] = [];
  for (const terrain of terrains) {
    if (surfaceOf(terrain) !== 'floor') continue;
    const block = laidOut(terrain, gridSize, gridType);
    const look = {
      tilePx: terrain.isTiledTexture ? gridSize : 0,
      glass: !terrain.hasFaceImage,
    };
    const picture = (slot: TerrainImageSlot, fallback: TerrainImageSlot) => {
      const identifier = terrain.faceImageIdentifier(slot) || terrain.faceImageIdentifier(fallback);
      return identifier ? pictureOf(identifier) : '';
    };
    if (terrain.hasWall && block.topPx > block.basePx) {
      const boxSides = block.outline.length === 4 && !block.hex;
      block.outline.forEach((from, index) => {
        const to = block.outline[(index + 1) % block.outline.length];
        const side = boxSides ? BOX_SIDES[index] : 'wall';
        walls.push({
          id: `${terrain.identifier}:${boxSides ? side : `edge${index}`}`,
          ...block.onBoard(to),
          ...renamed(block.onBoard(from)),
          basePx: block.basePx,
          topPx: block.topPx,
          ...(block.roof ? { profile: block.profileUnder(to, from) } : {}),
          pictureUrl: picture(side, 'wall'),
          ...look,
        });
      });
    }
    if (terrain.hasFloor || terrain.hasWall) {
      const top = picture('top', 'floor');
      if (block.roof) {
        block.roof.faces.forEach((face, index) =>
          caps.push({
            id: `${terrain.identifier}:slope${index}`,
            outline: face.polygon.map((point) => toPoint(block.onBoard(point))),
            zPx: block.topPx,
            heights: face.polygon.map(
              (point) => block.basePx + face.plane.a * point.x + face.plane.b * point.y + face.plane.c
            ),
            facing: 'up',
            pictureUrl: top,
            ...look,
          })
        );
      } else {
        caps.push({
          id: `${terrain.identifier}:top`,
          outline: block.outline.map((point) => toPoint(block.onBoard(point))),
          zPx: block.topPx,
          facing: 'up',
          pictureUrl: top,
          ...look,
        });
      }
      if (block.basePx > 0) {
        caps.push({
          id: `${terrain.identifier}:bottom`,
          outline: block.outline.map((point) => toPoint(block.onBoard(point))),
          zPx: block.basePx,
          facing: 'down',
          pictureUrl: picture('bottom', 'floor'),
          ...look,
        });
      }
    }
  }
  return { walls, caps };
}

interface LaidOutBlock {
  /** The top's outline in the block's own frame, in pixels from the corner it is drawn from. */
  readonly outline: readonly SlopePoint[];
  readonly hex: boolean;
  readonly basePx: number;
  readonly topPx: number;
  readonly roof: SlopeRoof | null;
  /** A point of the block's own frame, where it stands on the board as `ax`/`ay`. */
  onBoard(point: SlopePoint): { ax: number; ay: number };
  /** The heights of the slope over a side running from one point of the block's frame to another. */
  profileUnder(from: SlopePoint, to: SlopePoint): { at: number; heightPx: number }[];
}

function laidOut(terrain: Terrain, gridSize: number, gridType: GridType): LaidOutBlock {
  const width = terrain.width * gridSize;
  const depth = terrain.depth * gridSize;
  const outline = terrainTopOutline(terrain, gridSize, gridType);
  const door = openDoorMotion(terrain, gridSize);
  const lift = door?.lift ?? 0;
  const topPx = terrainTopPx(terrain, gridSize) + lift;
  const basePx = topPx - terrain.height * gridSize;
  const roof = terrainSlopeRoofOf(terrain, gridSize, gridType);
  const turn = (terrain.rotate * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const middleX = terrain.location.x + width / 2;
  const middleY = terrain.location.y + depth / 2;
  return {
    outline,
    hex: outline.length !== 4,
    basePx,
    topPx,
    roof,
    onBoard(point) {
      const moved = door ? movedByDoor(door, point.x, point.y) : point;
      const x = moved.x - width / 2;
      const y = moved.y - depth / 2;
      return { ax: middleX + x * cos - y * sin, ay: middleY + x * sin + y * cos };
    },
    profileUnder(from, to) {
      return roof
        ? slopeProfileAlong(roof, from, to).map(({ at, heightPx }) => ({ at, heightPx: basePx + heightPx }))
        : [];
    },
  };
}

function renamed(point: { ax: number; ay: number }): { bx: number; by: number } {
  return { bx: point.ax, by: point.ay };
}

function toPoint(point: { ax: number; ay: number }): TableWorldPoint {
  return { x: point.ax, y: point.ay };
}
