import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import {
  cellCenterOf,
  cellColRow,
  type CellGrid,
  cellIndexAt,
  cellIndexOf,
  cellPolygonOf,
} from '@axe/domain/tabletop/fog/cell-grid';
import { ICE_BEARS_AT } from '@axe/domain/tabletop/ground/ground-over-ice';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { standsWet, type WaterCell } from '@axe/domain/tabletop/water/water-cells';
import { flowVectorOf } from '@axe/domain/tabletop/water/water-flow';
import { inwardOf, SQUARE_SIDE_STEPS } from '@axe/domain/tabletop/water/water-sides';

/** How much lower the water beyond an edge must stand before the water going over it falls, in cells. */
export const FALL_DROP_CELLS = 0.25;
/**
 * How squarely the water must flow at an edge to go over it, as the share of its flow that runs
 * out across the edge: a flow along the edge, or one a little off it, slides past.
 */
export const FALL_FLOW_SHARE = 0.38;
/** How far out from a spout its water lands, in cells. */
export const SPOUT_THROW_CELLS = 0.3;
/** The colour of water falling from a spout onto dry ground, where there is no water below to take the colour of. */
export const SPOUT_WATER_COLOUR = '#7d8f86';

/** What the water going over a fall, or pouring from a spout, looks like. */
export interface FallingWater {
  readonly color: string;
  readonly dirt: number;
  readonly turbidity: number;
  readonly density: number;
}

/**
 * One edge of a cell the water goes over and falls from, onto lower water beyond: the edge itself,
 * which way out of the cell the water goes, and the heights it falls between.
 */
export interface WaterFall extends FallingWater {
  /** The same key as the side of the water along this edge, which the fall is drawn in place of. */
  readonly key: string;
  /** The cell the water leaves, and the cell it falls into. */
  readonly index: number;
  readonly across: number;
  /** Where the edge starts and ends, in table pixels, going round the cell the water leaves clockwise. */
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** The way out of the cell across the edge, one pixel long. */
  readonly outX: number;
  readonly outY: number;
  /** The surface the water leaves and the surface it lands on. */
  readonly topPx: number;
  readonly bottomPx: number;
}

/** The mouth of a pipe water pours from: where it is, how high, which way it faces and how wide it is. */
export interface WaterSpout {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly mouthPx: number;
  /** The way the mouth faces, one pixel long. */
  readonly outX: number;
  readonly outY: number;
  readonly widthPx: number;
}

/** The water pouring from a spout: a column from the mouth down to where it lands, a little way out. */
export interface WaterColumn extends FallingWater {
  readonly key: string;
  /** Where it leaves the mouth and where it lands, in table pixels. */
  readonly fromX: number;
  readonly fromY: number;
  readonly x: number;
  readonly y: number;
  readonly topPx: number;
  readonly bottomPx: number;
  readonly halfPx: number;
  /** Whether it lands on water, which rings spread over, or on the ground. */
  readonly onWater: boolean;
}

/**
 * The edges the water falls over.
 *
 * Water falls where it flows out across an edge onto water standing lower beyond it. Still water
 * held beside lower water, as a pond drawn beside a deeper one, stands as it did; so does water
 * over an edge of the board, or over ground, as a cell of the lower water whose ground has risen
 * through its surface, or over water the seat cannot see. Ice hard enough to stand on does not fall.
 */
export function waterFallsOf(grid: CellGrid, cells: ReadonlyMap<number, WaterCell>): WaterFall[] {
  const hex = isHexGrid(grid.type);
  const flatTop = isFlatTopGrid(grid.type);
  const drop = FALL_DROP_CELLS * Math.max(grid.sizePx, 1);
  const falls: WaterFall[] = [];
  const ordered = [...cells.values()].sort((a, b) => a.index - b.index);
  for (const cell of ordered) {
    if (!(cell.flowSpeed > 0) || (cell.ice ?? 0) >= ICE_BEARS_AT || !standsWet(cell)) continue;
    const flow = flowVectorOf(cell.flowDirection);
    const { col, row } = cellColRow(grid, cell.index);
    const centre = cellCenterOf(grid, cell.index);
    const corners = cellPolygonOf(grid, cell.index);
    const steps = hex ? hexSideStepsAt(flatTop, col, row) : SQUARE_SIDE_STEPS;
    for (let side = 0; side < corners.length; side++) {
      const [dx, dy] = steps[side];
      const across = cellIndexOf(grid, col + dx, row + dy);
      const below = cells.get(across);
      if (!below || !standsWet(below) || cell.surfacePx - below.surfacePx < drop) continue;
      const from = corners[side];
      const to = corners[(side + 1) % corners.length];
      const inward = inwardOf(from, to, centre);
      if (-(flow.x * inward.x + flow.y * inward.y) < FALL_FLOW_SHARE) continue;
      falls.push({
        key: `${cell.index}:${side}`,
        index: cell.index,
        across,
        x0: from.x,
        y0: from.y,
        x1: to.x,
        y1: to.y,
        outX: -inward.x || 0,
        outY: -inward.y || 0,
        topPx: cell.surfacePx,
        bottomPx: below.surfacePx,
        color: cell.color,
        dirt: cell.dirt,
        turbidity: cell.turbidity,
        density: cell.density,
      });
    }
  }
  return falls;
}

/**
 * The water pouring from each spout, down to the first thing under where it lands: what can be
 * landed on there, the ground or a block on it, which `landingAt` gives the height of for water
 * coming down from the height of the mouth, or the water standing over that. A block standing out of
 * the water takes it before the water does. It takes the look of the water it pours into. A spout no
 * higher than what lies below it pours nothing.
 */
export function waterColumnsOf(
  grid: CellGrid,
  cells: ReadonlyMap<number, WaterCell>,
  spouts: readonly WaterSpout[],
  landingAt: (x: number, y: number, belowPx: number) => number
): WaterColumn[] {
  const throwPx = SPOUT_THROW_CELLS * Math.max(grid.sizePx, 1);
  const columns: WaterColumn[] = [];
  for (const spout of spouts) {
    const x = spout.x + spout.outX * throwPx;
    const y = spout.y + spout.outY * throwPx;
    const under = cells.get(cellIndexAt(grid, x, y));
    const landing = landingAt(x, y, spout.mouthPx);
    const water = under && standsWet(under) && under.surfacePx >= landing ? under : undefined;
    const bottomPx = water ? water.surfacePx : landing;
    if (spout.mouthPx - bottomPx < 1) continue;
    columns.push({
      key: spout.key,
      fromX: spout.x,
      fromY: spout.y,
      x,
      y,
      topPx: spout.mouthPx,
      bottomPx,
      halfPx: spout.widthPx / 2,
      onWater: !!water,
      color: under?.color ?? SPOUT_WATER_COLOUR,
      dirt: under?.dirt ?? 0,
      turbidity: under?.turbidity ?? 0.5,
      density: under?.density ?? 0.6,
    });
  }
  return columns;
}
