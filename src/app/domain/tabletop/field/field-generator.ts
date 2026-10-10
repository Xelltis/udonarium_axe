import {
  clampFieldDensity,
  clampFieldSize,
  FieldAtmosphere,
  fieldAtmosphereById,
  FieldAtmosphereId,
} from '@axe/domain/tabletop/field/field-atmosphere';
import { FIELD_MERGE_SPAN, fieldToBlocks } from '@axe/domain/tabletop/field/field-blocks';
import { FieldLayout, generateField } from '@axe/domain/tabletop/field/field-layout';
import { GridType } from '@axe/domain/tabletop/game-table';
import { MapBlocks } from '@axe/domain/tabletop/map-blocks';
import { boardSizeOn, MapGrid, mergeSpanFor } from '@axe/domain/tabletop/map-grid';

export interface FieldRequest {
  atmosphere: FieldAtmosphereId;
  /** What shape the cells are. Left out, squares. */
  gridType?: GridType;
  /** How many cells across. The board is laid out three deep for every four across. */
  size: number;
  density: number;
  seed: number;
}

export interface FieldPlan {
  atmosphere: FieldAtmosphere;
  layout: FieldLayout;
  blocks: MapBlocks;
}

/**
 * The board size in cells for a requested width: clamped, three deep for every four across and at
 * least 12 deep, then fitted to the grid shape.
 */
export function fieldBoardSize(size: number, gridType: GridType = GridType.SQUARE): { width: number; height: number } {
  const width = clampFieldSize(size);
  const square = { width, height: Math.max(12, Math.round(width * 0.75)) };
  return boardSizeOn(square, { type: gridType, sizePx: 1 });
}

/**
 * Plans a whole field from a request: the mood, the ground and props laid out from the seed at the
 * requested density, and the map blocks built from them for the grid shape.
 */
export function planField(request: FieldRequest): FieldPlan {
  const atmosphere = fieldAtmosphereById(request.atmosphere);
  const grid: MapGrid = { type: request.gridType ?? GridType.SQUARE, sizePx: 1 };
  const { width, height } = fieldBoardSize(request.size, grid.type);
  const density = clampFieldDensity(request.density);
  const layout = generateField(atmosphere, width, height, request.seed, density);
  const span = mergeSpanFor(grid, FIELD_MERGE_SPAN);
  return { atmosphere, layout, blocks: fieldToBlocks(layout, atmosphere, request.seed, span) };
}
