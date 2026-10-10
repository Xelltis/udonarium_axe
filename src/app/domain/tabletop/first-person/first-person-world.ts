import { CellPoint } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';
import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-flower-geometry';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { terrainTopPx } from '@axe/domain/tabletop/terrain-height';
import { terrainWallFace, WallSide } from '@axe/domain/tabletop/terrain-wall-face';

export interface FirstPersonWall {
  id: string;
  terrain: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  nx: number;
  ny: number;
  basePx: number;
  topPx: number;
  image: string;
  glass: boolean;
  seeThrough: boolean;
  door: boolean;
}

export interface FirstPersonCap {
  id: string;
  terrain: string;
  outline: CellPoint[];
  zPx: number;
  facing: 'up' | 'down';
  image: string;
  glass: boolean;
}

export interface FirstPersonFloor {
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
}

export interface FirstPersonWorld {
  walls: FirstPersonWall[];
  caps: FirstPersonCap[];
  floor: FirstPersonFloor;
}

export interface FirstPersonTableShape {
  width: number;
  height: number;
  gridSize: number;
  gridType: GridType;
  imageIdentifier: string;
  wallHeight?: number;
  showNorthWall?: boolean;
  showEastWall?: boolean;
  showSouthWall?: boolean;
  showWestWall?: boolean;
  northWallImageIdentifier?: string;
  eastWallImageIdentifier?: string;
  southWallImageIdentifier?: string;
  westWallImageIdentifier?: string;
}

const SIDES: readonly WallSide[] = ['north', 'east', 'south', 'west'];

export function firstPersonWorldOf(table: FirstPersonTableShape, terrains: readonly Terrain[]): FirstPersonWorld {
  const walls: FirstPersonWall[] = [];
  const caps: FirstPersonCap[] = [];
  const gridSize = table.gridSize;
  for (const terrain of terrains) {
    if (surfaceOf(terrain) !== 'floor') continue;
    if (terrain.isDoor && terrain.isDoorOpen) continue;
    const topPx = terrainTopPx(terrain, gridSize);
    const basePx = topPx - terrain.height * gridSize;
    const glass = !terrain.hasFaceImage;
    const outline = hexOutlineOf(terrain, table) ?? boxCorners(terrain, gridSize);
    if (terrain.hasWall && topPx > basePx) {
      const shared = {
        terrain: terrain.identifier,
        basePx,
        topPx,
        glass,
        seeThrough: !terrain.blocksSightNow,
        door: terrain.isDoor,
      };
      if (!usesHexOutline(terrain, table)) {
        for (const side of SIDES) {
          const face = terrainWallFace(side, footprintOf(terrain, gridSize));
          walls.push(
            oriented({
              ...shared,
              id: `${terrain.identifier}:${side}`,
              ax: face.ax,
              ay: face.ay,
              bx: face.bx,
              by: face.by,
              nx: face.nx,
              ny: face.ny,
              image: terrain.faceImageIdentifier(side) || terrain.faceImageIdentifier('wall'),
            })
          );
        }
      } else {
        const centre = centreOf(outline);
        outline.forEach((a, index) => {
          const b = outline[(index + 1) % outline.length];
          const normal = outwardNormal(a, b, centre);
          walls.push(
            oriented({
              ...shared,
              id: `${terrain.identifier}:edge${index}`,
              ax: a.x,
              ay: a.y,
              bx: b.x,
              by: b.y,
              nx: normal.x,
              ny: normal.y,
              image: terrain.faceImageIdentifier('wall'),
            })
          );
        });
      }
    }
    if (terrain.hasFloor || terrain.hasWall) {
      caps.push({
        id: `${terrain.identifier}:top`,
        terrain: terrain.identifier,
        outline,
        zPx: topPx,
        facing: 'up',
        image: terrain.faceImageIdentifier('top') || terrain.faceImageIdentifier('floor'),
        glass,
      });
      if (basePx > 0) {
        caps.push({
          id: `${terrain.identifier}:bottom`,
          terrain: terrain.identifier,
          outline,
          zPx: basePx,
          facing: 'down',
          image: terrain.faceImageIdentifier('bottom') || terrain.faceImageIdentifier('floor'),
          glass,
        });
      }
    }
  }
  walls.push(...perimeterWallsOf(table));
  return { walls, caps, floor: floorOf(table) };
}

function perimeterWallsOf(table: FirstPersonTableShape): FirstPersonWall[] {
  const heightPx = (table.wallHeight ?? 0) * table.gridSize;
  if (heightPx <= 0) return [];
  const right = table.width * table.gridSize;
  const bottom = table.height * table.gridSize;
  const sides = [
    { side: 'north', shown: table.showNorthWall, image: table.northWallImageIdentifier, a: [right, 0], b: [0, 0] },
    {
      side: 'east',
      shown: table.showEastWall,
      image: table.eastWallImageIdentifier,
      a: [right, bottom],
      b: [right, 0],
    },
    {
      side: 'south',
      shown: table.showSouthWall,
      image: table.southWallImageIdentifier,
      a: [0, bottom],
      b: [right, bottom],
    },
    { side: 'west', shown: table.showWestWall, image: table.westWallImageIdentifier, a: [0, 0], b: [0, bottom] },
  ] as const;
  const inward: Record<string, CellPoint> = {
    north: { x: 0, y: 1 },
    east: { x: -1, y: 0 },
    south: { x: 0, y: -1 },
    west: { x: 1, y: 0 },
  };
  return sides
    .filter((entry) => entry.shown === true)
    .map((entry) =>
      oriented({
        id: `table:${entry.side}`,
        terrain: '',
        ax: entry.a[0],
        ay: entry.a[1],
        bx: entry.b[0],
        by: entry.b[1],
        nx: inward[entry.side].x,
        ny: inward[entry.side].y,
        basePx: 0,
        topPx: heightPx,
        image: entry.image ?? '',
        glass: false,
        seeThrough: false,
        door: false,
      })
    );
}

function usesHexOutline(terrain: Terrain, table: FirstPersonTableShape): boolean {
  return isHexGrid(table.gridType) && Math.min(terrain.width, terrain.depth) >= 1;
}

function hexOutlineOf(terrain: Terrain, table: FirstPersonTableShape): CellPoint[] | null {
  if (!usesHexOutline(terrain, table)) return null;
  const size = Math.min(terrain.width, terrain.depth);
  const params = calcHexFlowerParams(size, table.gridSize, isFlatTopGrid(table.gridType));
  const centre = {
    x: terrain.location.x + (terrain.width * table.gridSize) / 2,
    y: terrain.location.y + (terrain.depth * table.gridSize) / 2,
  };
  return params.outline.map((vertex) => turned(centre, vertex.x, vertex.y, terrain.rotate));
}

function footprintOf(terrain: Terrain, gridSize: number) {
  return {
    x: terrain.location.x,
    y: terrain.location.y,
    widthPx: terrain.width * gridSize,
    depthPx: terrain.depth * gridSize,
    heightPx: terrain.height * gridSize,
    rotateDeg: terrain.rotate,
  };
}

function boxCorners(terrain: Terrain, gridSize: number): CellPoint[] {
  const halfWidth = (terrain.width * gridSize) / 2;
  const halfDepth = (terrain.depth * gridSize) / 2;
  const centre = { x: terrain.location.x + halfWidth, y: terrain.location.y + halfDepth };
  return [
    turned(centre, -halfWidth, -halfDepth, terrain.rotate),
    turned(centre, halfWidth, -halfDepth, terrain.rotate),
    turned(centre, halfWidth, halfDepth, terrain.rotate),
    turned(centre, -halfWidth, halfDepth, terrain.rotate),
  ];
}

function turned(centre: CellPoint, localX: number, localY: number, rotateDeg: number): CellPoint {
  const radians = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: centre.x + localX * cos - localY * sin, y: centre.y + localX * sin + localY * cos };
}

function centreOf(points: readonly CellPoint[]): CellPoint {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

function outwardNormal(a: CellPoint, b: CellPoint, centre: CellPoint): CellPoint {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const normal = { x: (b.y - a.y) / length, y: -(b.x - a.x) / length };
  const midX = (a.x + b.x) / 2 - centre.x;
  const midY = (a.y + b.y) / 2 - centre.y;
  return normal.x * midX + normal.y * midY >= 0 ? normal : { x: -normal.x, y: -normal.y };
}

function oriented(wall: FirstPersonWall): FirstPersonWall {
  const rightX = wall.ny;
  const rightY = -wall.nx;
  if ((wall.bx - wall.ax) * rightX + (wall.by - wall.ay) * rightY >= 0) return wall;
  return { ...wall, ax: wall.bx, ay: wall.by, bx: wall.ax, by: wall.ay };
}

function floorOf(table: FirstPersonTableShape): FirstPersonFloor {
  const hex = computeHexMaskGeometry(table.width, table.height, table.gridSize, table.gridType);
  if (hex) {
    return { x: -hex.offsetX, y: -hex.offsetY, width: hex.pixelW, height: hex.pixelH, image: table.imageIdentifier };
  }
  return {
    x: 0,
    y: 0,
    width: table.width * table.gridSize,
    height: table.height * table.gridSize,
    image: table.imageIdentifier,
  };
}
