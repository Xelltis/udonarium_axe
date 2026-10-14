import type { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { sampleOverSheet, type WaterLightMask } from '@axe/domain/tabletop/water/water-light-mask';

/**
 * How strongly the colour of the depths shows over water this many cells deep, from 0 to 1.
 *
 * Shallow water over sand is nearly clear and the colour gathers as the bottom falls away, which
 * is what lets a shore read as shallows running out into deep water. Murky water gathers it
 * sooner and further, until a hand's depth of it hides the bottom.
 */
export function depthShadeAlpha(depthCells: number, turbidity: number): number {
  const depth = Number.isFinite(depthCells) ? Math.max(depthCells, 0) : 0;
  const murk = clamp01(turbidity);
  const rate = 0.35 + 1.6 * murk;
  const most = 0.55 + 0.37 * murk;
  return round(most * (1 - Math.exp(-rate * depth)));
}

/** How far one sees through the clearest water, in cells, before it hides what is there. */
const CLEAREST_SIGHT_CELLS = 30.8;
/** How far one sees through water nothing can be seen through: less than the cell in front. */
const MURKIEST_SIGHT_CELLS = 0.8;

/**
 * How far one sees through water from inside it, in cells, before the water hides what is there:
 * far in clear water, and less than a cell in water nothing can be seen through.
 */
export function murkSightCells(turbidity: number): number {
  const clear = 1 - clamp01(turbidity);
  return MURKIEST_SIGHT_CELLS + (CLEAREST_SIGHT_CELLS - MURKIEST_SIGHT_CELLS) * clear * clear;
}

/**
 * How much of something this many cells off the water hides from an eye inside it, from 0 to 1.
 * The water thickens with the distance, gone nearly all the way at the distance one sees, and
 * all the way soon after: what lies past it is the colour of the water and nothing else.
 */
export function murkShade(distanceCells: number, turbidity: number): number {
  const distance = Number.isFinite(distanceCells) ? Math.max(distanceCells, 0) : 0;
  const hidden = 1 - Math.exp((-3 * distance) / murkSightCells(turbidity));
  return hidden > 0.995 ? 1 : round(hidden);
}

/** The colour of the depths over a sheet of water: one strength over all of it, or a picture of it cell by cell. */
export type WaterDepthShade = { readonly alpha: number } | WaterLightMask;

/**
 * How strongly the colour of the depths shows over each part of a sheet of water.
 *
 * A pond over a level floor is one depth everywhere and takes one strength. Water over ground
 * that rises and falls under it, such as a beach running out to sea, takes a picture laid over
 * the sheet, read at half a cell and stretched, so the colour deepens smoothly out from the shore.
 */
export function waterDepthShadeOf(
  grid: CellGrid,
  sheet: { left: number; top: number; width: number; height: number; cells: readonly number[] },
  depthCellsOf: (index: number) => number,
  turbidity: number
): WaterDepthShade {
  const shades = sheet.cells.map((index) => depthShadeAlpha(depthCellsOf(index), turbidity));
  const first = shades[0] ?? 0;
  if (shades.every((shade) => Math.abs(shade - first) < 0.004)) return { alpha: first };
  const byCell = new Map(sheet.cells.map((index, at) => [index, shades[at]]));
  const mean = shades.reduce((sum, shade) => sum + shade, 0) / shades.length;
  return sampleOverSheet(grid, sheet, (index) => byCell.get(index) ?? mean, mean);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
