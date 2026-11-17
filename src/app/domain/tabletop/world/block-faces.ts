import { movedByDoor, openDoorMotion } from '@axe/domain/tabletop/door-motion';
import { GridType } from '@axe/domain/tabletop/game-table';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TerrainImageSlot } from '@axe/domain/tabletop/terrain';
import { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { terrainTopPx } from '@axe/domain/tabletop/terrain-height';
import { SlopePoint, slopeProfileAlong, SlopeRoof } from '@axe/domain/tabletop/terrain-slope-roof';
import { terrainSlopeRoofOf, terrainTopOutline } from '@axe/domain/tabletop/terrain-slope-surface';
import type {
  TableWorldCap,
  TableWorldPoint,
  TableWorldSheet,
  TableWorldWall,
} from '@axe/domain/tabletop/world/table-world';

/** The sides of a rectangular block, in the order its top's outline runs round them. */
const BOX_SIDES: readonly TerrainImageSlot[] = ['north', 'east', 'south', 'west'];

/**
 * How far off the face it lies against a block with no thickness is drawn, in table pixels: a sheet
 * stood against a wall, a picture put flat on a wall, or a block as high as nothing lying on the top
 * of another. Laid in the same plane, the depth could not tell the two faces apart and showed them
 * through each other in a flickering pattern; a hair off it, the sheet is in front. It is far less
 * than shows, and from far off less than the depth tells apart, so the faces of such a block are
 * marked as a sheet's as well, for a renderer to draw ahead of the face they lie against.
 */
export const SHEET_LIFT_PX = 0.5;

/**
 * How much further off its face the top of a block as high as nothing is drawn for each such block
 * under it at the same height, and how many it counts at most. Two lying one over the other at one
 * height could not be told apart by the depth and showed through each other; the one laid later is
 * drawn a step higher, so it lies over the earlier. A step is far less than shows and still more than
 * the depth tells apart from any distance the table is seen from, and the most they reach stays under
 * where things lying on a face are drawn (`LYING_LIFT_PX`), so a card laid on them lies over them.
 */
const FLAT_LEVEL_STEP_PX = 0.1;
const FLAT_LEVELS = 4;

/** Where the top of a block as high as nothing lies on the board, for telling which others it lies over. */
interface FlatTop {
  readonly basePx: number;
  readonly box: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly level: number;
}

/** The box round the points of an outline laid on the board. */
function boxOf(points: readonly { ax: number; ay: number }[]): FlatTop['box'] {
  const xs = points.map((point) => point.ax);
  const ys = points.map((point) => point.ay);
  return { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) };
}

/** Whether two boxes share some of the board, more than an edge. */
function overlapping(a: FlatTop['box'], b: FlatTop['box']): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The faces of the blocks standing on the floor: each block's sides standing from its foot to its
 * top, and its top, with its underside where it hangs above the floor.
 *
 * A block is laid out as its top's outline, a rectangle or the hex cells it covers, moved where an
 * open door has gone and turned about its middle. A sloping top is made of the flat pieces of its
 * slope, each corner at its own height, and the sides under it fold where the slope does. The sides
 * run from left to right as they are seen from outside, so a picture on one reads the right way, and
 * a stretched picture is laid in the block's own frame, so it turns with the block.
 *
 * `coverOf` says which of a block's cells the seat has reached through the fog. A rectangular block
 * with a flat top is cut back to those cells, as the page cuts it; a hex or sloping one is drawn
 * whole once any of it has been reached, as the page draws it, and a block none of which has been
 * reached is not drawn at all.
 *
 * The faces of a block with no thickness one way are marked as a sheet's: its sides where it is as
 * wide or as deep as nothing, drawn from outside only, as they stand a hair apart back to back; and
 * its top and underside where it is as high as nothing, from outside only where it hangs above the
 * floor and so has both, and from both sides where it lies on the floor with a top alone.
 */
export function blockFacesOf(
  terrains: readonly Terrain[],
  gridSize: number,
  gridType: GridType,
  pictureOf: (identifier: string) => string,
  coverOf: (terrain: Terrain) => TerrainFogCover | null = () => null,
  liftOf: (terrain: Terrain) => number = () => 0
): { walls: TableWorldWall[]; caps: TableWorldCap[] } {
  const walls: TableWorldWall[] = [];
  const caps: TableWorldCap[] = [];
  const flatTops: FlatTop[] = [];
  for (const terrain of terrains) {
    if (surfaceOf(terrain) !== 'floor') continue;
    const cover = coverOf(terrain);
    if (cover && !cover.cleared.some((cell) => cell)) continue;
    const block = laidOut(terrain, gridSize, gridType, liftOf(terrain));
    const boxSides = block.outline.length === 4 && !block.hex;
    const cut = cover && !cover.cleared.every((cell) => cell) && boxSides && !block.roof ? cover : null;
    const tilePx = terrain.isTiledTexture ? gridSize : 0;
    const look = { tilePx, glass: !terrain.hasFaceImage };
    const sideSheet: { sheet?: TableWorldSheet } = block.thin ? { sheet: 'outside' } : {};
    const capSheet: { sheet?: TableWorldSheet } = block.flat
      ? { sheet: block.basePx > 0 ? 'outside' : 'both' }
      : block.thin
        ? { sheet: 'both' }
        : {};
    const picture = (slot: TerrainImageSlot, fallback: TerrainImageSlot) => {
      const identifier = terrain.faceImageIdentifier(slot) || terrain.faceImageIdentifier(fallback);
      return identifier ? pictureOf(identifier) : '';
    };
    const capOf = (id: string, outline: readonly SlopePoint[], zPx: number, facing: 'up' | 'down', url: string) => {
      const onBoard = outline.map((point) => toPoint(block.onBoard(point)));
      caps.push({
        id: `${terrain.identifier}:${id}`,
        outline: onBoard,
        zPx,
        uvs:
          tilePx > 0
            ? onBoard.map((point) => ({ x: point.x / tilePx, y: -point.y / tilePx }))
            : block.stretched(outline),
        facing,
        pictureUrl: url,
        ...look,
        ...capSheet,
        ...(facing === 'up' && terrain.isGrid ? { gridded: true } : {}),
      });
    };
    if (terrain.hasWall && block.topPx > block.basePx) {
      block.outline.forEach((from, index) => {
        const to = block.outline[(index + 1) % block.outline.length];
        const side = boxSides ? BOX_SIDES[index] : 'wall';
        const face = {
          basePx: block.basePx,
          topPx: block.topPx,
          ...(block.roof ? { profile: block.profileUnder(to, from) } : {}),
          pictureUrl: picture(side, 'wall'),
          ...look,
          ...sideSheet,
        };
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const spans = cut ? clearedAlong(cut, index) : [{ from: 0, to: 1, cell: '' }];
        for (const span of spans) {
          const start = along(to, from, span.from);
          const end = along(to, from, span.to);
          walls.push({
            id: `${terrain.identifier}:${boxSides ? side : `edge${index}`}${span.cell}`,
            ...block.onBoard(start),
            ...renamed(block.onBoard(end)),
            ...face,
            ...(cut
              ? {
                  uFrom: tilePx > 0 ? (span.from * length) / tilePx : span.from,
                  uTo: tilePx > 0 ? (span.to * length) / tilePx : span.to,
                }
              : {}),
          });
        }
      });
    }
    if (terrain.hasFloor || terrain.hasWall) {
      const top = picture('top', 'floor');
      const topPx = block.topPx + (block.flat && !block.roof ? flatLiftOf(block, flatTops) : 0);
      const pieces = cut ? clearedCells(cut, block.width, block.depth) : [{ cell: '', outline: block.outline }];
      if (block.roof) {
        block.roof.faces.forEach((face, index) => {
          capOf(`slope${index}`, face.polygon, block.topPx, 'up', top);
          caps[caps.length - 1] = {
            ...caps[caps.length - 1],
            heights: face.polygon.map(
              (point) => block.basePx + face.plane.a * point.x + face.plane.b * point.y + face.plane.c
            ),
          };
        });
      } else {
        for (const piece of pieces) capOf(`top${piece.cell}`, piece.outline, topPx, 'up', top);
      }
      if (block.basePx > 0) {
        const bottom = picture('bottom', 'floor');
        for (const piece of pieces) capOf(`bottom${piece.cell}`, piece.outline, block.basePx, 'down', bottom);
      }
    }
  }
  return { walls, caps };
}

/**
 * How far off its face the top of a block as high as nothing is drawn: a hair, and a step more for
 * each of those laid before it at the same height whose tops it overlaps, counted to the most. It is
 * noted down for the blocks laid after it.
 */
function flatLiftOf(block: LaidOutBlock, laidBefore: FlatTop[]): number {
  const box = boxOf(block.outline.map((point) => block.onBoard(point)));
  const under = laidBefore.filter(
    (other) => Math.abs(other.basePx - block.basePx) < SHEET_LIFT_PX && overlapping(other.box, box)
  );
  const level = Math.min(
    FLAT_LEVELS,
    under.reduce((highest, other) => Math.max(highest, other.level + 1), 0)
  );
  laidBefore.push({ basePx: block.basePx, box, level });
  return SHEET_LIFT_PX + level * FLAT_LEVEL_STEP_PX;
}

/**
 * The parts of a rectangular block's side the seat has reached, as the stretches of the side from
 * its first point to its second, one to a reached cell standing along it. The sides run from left
 * to right as they are seen from outside, which takes the north and east sides back along the
 * cells' rows and columns and the south and west sides forwards.
 */
function clearedAlong(cover: TerrainFogCover, side: number): { from: number; to: number; cell: string }[] {
  const { cols, rows, cleared } = cover;
  const count = side % 2 === 0 ? cols : rows;
  const indexOf = (step: number) => {
    switch (side) {
      case 0:
        return step;
      case 1:
        return step * cols + cols - 1;
      case 2:
        return (rows - 1) * cols + step;
      default:
        return step * cols;
    }
  };
  const spans: { from: number; to: number; cell: string }[] = [];
  for (let step = 0; step < count; step++) {
    if (!cleared[indexOf(step)]) continue;
    const backwards = side === 0 || side === 1;
    const lo = step / count;
    const hi = (step + 1) / count;
    spans.push(backwards ? { from: 1 - hi, to: 1 - lo, cell: `@${step}` } : { from: lo, to: hi, cell: `@${step}` });
  }
  return spans;
}

/** The cells of a rectangular block's top the seat has reached, each as its own outline in the block's frame. */
function clearedCells(cover: TerrainFogCover, width: number, depth: number): { cell: string; outline: SlopePoint[] }[] {
  const cellWidth = width / cover.cols;
  const cellDepth = depth / cover.rows;
  const cells: { cell: string; outline: SlopePoint[] }[] = [];
  cover.cleared.forEach((reached, index) => {
    if (!reached) return;
    const x = (index % cover.cols) * cellWidth;
    const y = Math.floor(index / cover.cols) * cellDepth;
    cells.push({
      cell: `@${index}`,
      outline: [
        { x, y },
        { x: x + cellWidth, y },
        { x: x + cellWidth, y: y + cellDepth },
        { x, y: y + cellDepth },
      ],
    });
  });
  return cells;
}

/** The point a part of the way from one point to another. */
function along(from: SlopePoint, to: SlopePoint, part: number): SlopePoint {
  return { x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part };
}

interface LaidOutBlock {
  /** The top's outline in the block's own frame, in pixels from the corner it is drawn from. */
  readonly outline: readonly SlopePoint[];
  readonly hex: boolean;
  /** How wide and deep the block's own frame is, in pixels. */
  readonly width: number;
  readonly depth: number;
  readonly basePx: number;
  readonly topPx: number;
  /** Whether it is as high as nothing, its top lying on whatever it lies on. */
  readonly flat: boolean;
  /** Whether it is a rectangular block as wide or as deep as nothing, its sides standing back to back. */
  readonly thin: boolean;
  readonly roof: SlopeRoof | null;
  /** A point of the block's own frame, where it stands on the board as `ax`/`ay`. */
  onBoard(point: SlopePoint): { ax: number; ay: number };
  /** The heights of the slope over a side running from one point of the block's frame to another. */
  profileUnder(from: SlopePoint, to: SlopePoint): { at: number; heightPx: number }[];
  /** Where points of the block's frame stand on a picture stretched over its top, across and up. */
  stretched(points: readonly SlopePoint[]): TableWorldPoint[];
}

function laidOut(terrain: Terrain, gridSize: number, gridType: GridType, groundLiftPx: number): LaidOutBlock {
  const width = terrain.width * gridSize;
  const depth = terrain.depth * gridSize;
  const outline = sheetOutline(terrainTopOutline(terrain, gridSize, gridType), width, depth);
  const door = openDoorMotion(terrain, gridSize);
  const lift = (door?.lift ?? 0) + groundLiftPx;
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
    width,
    depth,
    basePx,
    topPx,
    flat: terrain.height * gridSize < SHEET_LIFT_PX,
    thin: outline.length === 4 && (width < SHEET_LIFT_PX * 2 || depth < SHEET_LIFT_PX * 2),
    roof,
    onBoard(point) {
      const moved = door ? movedByDoor(door, point.x, point.y) : point;
      const x = moved.x - width / 2;
      const y = moved.y - depth / 2;
      return { ax: middleX + x * cos - y * sin, ay: middleY + x * sin + y * cos };
    },
    stretched(points) {
      return points.map((point) => ({ x: point.x / (width || 1), y: 1 - point.y / (depth || 1) }));
    },
    profileUnder(from, to) {
      return roof
        ? slopeProfileAlong(roof, from, to).map(({ at, heightPx }) => ({ at, heightPx: basePx + heightPx }))
        : [];
    },
  };
}

/**
 * The outline of a rectangular block, its sides with no thickness between them stood apart by a hair
 * either way, so each faces out from the line it stands on rather than lying on the other; any other
 * outline as it is.
 */
function sheetOutline(outline: SlopePoint[], width: number, depth: number): SlopePoint[] {
  if (outline.length !== 4) return outline;
  const thinAcross = width < SHEET_LIFT_PX * 2;
  const thinDeep = depth < SHEET_LIFT_PX * 2;
  if (!thinAcross && !thinDeep) return outline;
  // The corners run north-west, north-east, south-east and south-west.
  const east = [false, true, true, false];
  const south = [false, false, true, true];
  return outline.map((point, index) => ({
    x: thinAcross ? width / 2 + (east[index] ? 1 : -1) * (width / 2 + SHEET_LIFT_PX) : point.x,
    y: thinDeep ? depth / 2 + (south[index] ? 1 : -1) * (depth / 2 + SHEET_LIFT_PX) : point.y,
  }));
}

function renamed(point: { ax: number; ay: number }): { bx: number; by: number } {
  return { bx: point.ax, by: point.ay };
}

function toPoint(point: { ax: number; ay: number }): TableWorldPoint {
  return { x: point.ax, y: point.ay };
}
