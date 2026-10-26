import {
  DUNGEON_PROP_BASE_COLOR,
  TEXTURE_BASE_COLOR,
  TextureId,
  WALL_TEXTURE_BASE_COLOR,
  WallTextureId,
} from '@axe/domain/media/texture-catalog';
import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { MapBlock, MapBlocks, MapPaint, MapRect, MapSize } from '@axe/domain/tabletop/map-blocks';
import { blockOrigin, MapGrid } from '@axe/domain/tabletop/map-grid';

export interface PreviewRect {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
}

export interface MapPreview {
  viewBox: string;
  rects: PreviewRect[];
}

export interface PreviewColors {
  wall: string;
  floor: string;
  hazard: string;
  prop: string;
}

export const TORCH_FILL = '#ffce6a';
const DOOR_FILL = DUNGEON_PROP_BASE_COLOR.door_wood;
const STAIR_FILL = DUNGEON_PROP_BASE_COLOR.stair_up;
const UNKNOWN_WALL = '#6b6b6b';
const UNKNOWN_FLOOR = '#3a3a3a';

/** Pull a colour towards black, which is what tells the rock from the floor at this size. */
function darken(hex: string, keep: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return hex;
  const channel = (at: number) =>
    Math.round(parseInt(value.slice(at, at + 2), 16) * keep)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(0)}${channel(2)}${channel(4)}`;
}

/**
 * A wall and the floor beside it are often near enough the same colour to read as one field,
 * and a plan nobody can read is not worth drawing. The rock is sunk well below the floor.
 */
export function previewColors(wall: string, floor: string, hazard: string): PreviewColors {
  return {
    wall: darken(WALL_TEXTURE_BASE_COLOR[wall as WallTextureId] ?? UNKNOWN_WALL, 0.34),
    floor: TEXTURE_BASE_COLOR[floor as TextureId] ?? UNKNOWN_FLOOR,
    hazard: TEXTURE_BASE_COLOR[hazard as TextureId] ?? UNKNOWN_FLOOR,
    prop: darken(WALL_TEXTURE_BASE_COLOR[wall as WallTextureId] ?? UNKNOWN_WALL, 0.55),
  };
}

/**
 * The colour of what a piece wears on top, where it wears a picture of its own.
 *
 * Seen from above a tree is its crown and a building its roof, and a town drawn in one colour
 * for both would show a square of trees as another block of offices.
 */
function topFill(block: MapBlock): string | undefined {
  const top = block.skin?.top;
  if (top?.kind !== 'texture') return undefined;
  return TEXTURE_BASE_COLOR[top.id as TextureId] ?? WALL_TEXTURE_BASE_COLOR[top.id as WallTextureId];
}

function fillFor(block: MapBlock, colors: PreviewColors): string {
  switch (block.kind) {
    case 'wall':
      return colors.wall;
    case 'door':
      return DOOR_FILL;
    case 'prop':
      return topFill(block) ?? colors.prop;
    default:
      return STAIR_FILL;
  }
}

function paintFill(patch: MapPaint, colors: PreviewColors): string {
  if (patch.material?.kind === 'texture') return TEXTURE_BASE_COLOR[patch.material.id as TextureId] ?? UNKNOWN_FLOOR;
  if (patch.material) return UNKNOWN_FLOOR;
  return patch.kind === 'hazard' ? colors.hazard : colors.floor;
}

/**
 * Draw the blocks that would be built, not the cells they came from.
 *
 * Rolling again here costs nothing, while rolling again after the fact means a thousand
 * objects made and unmade. Showing the merged blocks also makes the count honest.
 */
export function buildMapPreview(
  size: MapSize,
  blocks: MapBlocks,
  colors: PreviewColors,
  gridType: GridType = GridType.SQUARE
): MapPreview {
  // Measured in cells rather than pixels: the preview draws the board, not the table.
  const grid: MapGrid = { type: gridType, sizePx: 1 };
  const rects = [
    ...blocks.paint.map((patch) => ({ ...laidOut(patch.rect, grid), fill: paintFill(patch, colors) })),
    ...blocks.blocks.map((block) => ({ ...laidOut(block.rect, grid), fill: fillFor(block, colors) })),
    ...blocks.torchSpots.map((light) => ({
      ...laidOut({ x: light.x, y: light.y, w: 1, h: 1 }, grid),
      fill: TORCH_FILL,
    })),
  ];
  return { viewBox: viewBoxFor(size, grid, rects), rects };
}

/** Where a cell sits on the board it is laid on, so a hex board previews as the hexes it is. */
function laidOut(rect: MapRect, grid: MapGrid): MapRect {
  const at = blockOrigin(rect, grid);
  return { x: at.x, y: at.y, w: rect.w, h: rect.h };
}

/**
 * The box the preview is drawn in.
 *
 * A square board is exactly as wide as it has cells. A hex board is not - its columns overlap
 * and its rows are staggered - so the box is taken from what was actually laid out, with the
 * board's own size as the floor so an empty board is still the shape of a board.
 */
function viewBoxFor(size: MapSize, grid: MapGrid, rects: readonly PreviewRect[]): string {
  if (!isHexGrid(grid.type) || rects.length === 0) return `0 0 ${size.width} ${size.height}`;
  let right = 0;
  let bottom = 0;
  for (const rect of rects) {
    right = Math.max(right, rect.x + rect.w);
    bottom = Math.max(bottom, rect.y + rect.h);
  }
  const corner = blockOrigin({ x: 0, y: 0, w: 1, h: 1 }, grid);
  return `${corner.x} ${corner.y} ${right - corner.x} ${bottom - corner.y}`;
}
