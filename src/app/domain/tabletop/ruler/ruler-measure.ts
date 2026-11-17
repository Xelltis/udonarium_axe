import { GridType } from '@axe/domain/tabletop/grid-type';
import { isFlatTopGrid, isHexGrid, pixelToHexCell } from '@axe/domain/tabletop/hex-geometry';
import { DiagonalMove } from '@axe/domain/tabletop/move/diagonal-move';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/** What a measurement is taken over. */
export interface RulerMeasureInput {
  /** The two ends, in table pixels: x east, y south and z up off the table. */
  readonly from: Vec3;
  readonly to: Vec3;
  /** How wide one of the table's squares for movement and range is, in table pixels. */
  readonly squarePx: number;
  readonly gridType: GridType;
  /** How the room counts a step across a corner, which it counts a step up and across by too. */
  readonly diagonal: DiagonalMove;
}

/** A measurement, in the table's squares for movement and range. */
export interface RulerMeasurement {
  /** Straight from one end to the other. */
  readonly straight: number;
  /** Over the table, leaving the height out. */
  readonly level: number;
  /** How much higher the far end is than the near one; below it, less than nought. */
  readonly rise: number;
  /**
   * How many steps it is from the square one end is over to the square the other is over, counting
   * steps up and down as steps; null on a table without a grid, which has no squares to step on.
   */
  readonly steps: number | null;
}

/** Measures between two points. */
export function measureBetween(input: RulerMeasureInput): RulerMeasurement {
  const sq = input.squarePx > 0 ? input.squarePx : 1;
  const dx = input.to.x - input.from.x;
  const dy = input.to.y - input.from.y;
  const dz = input.to.z - input.from.z;
  return {
    straight: Math.hypot(dx, dy, dz) / sq,
    level: Math.hypot(dx, dy) / sq,
    rise: dz / sq,
    steps: stepsBetween(input, sq),
  };
}

/**
 * The steps between the squares the ends are over. The height is counted in whole squares, half a
 * square and more counting as one.
 *
 * On squares the three ways are counted together as one walk: with corners counted as one apiece,
 * the longest of the three; counted one and two by turns, the longest and half the next, rounded
 * down; counted two apiece, the longest and the next; with no corners at all, the three together.
 * On hexagons the steps over the table are walked first, and that walk and the height are counted as
 * the two ways of a corner by the same rule.
 */
function stepsBetween(input: RulerMeasureInput, sq: number): number | null {
  if (input.gridType === GridType.NONE) return null;
  const up = Math.floor(Math.abs(input.to.z - input.from.z) / sq + 0.5 + 1e-9);
  if (isHexGrid(input.gridType)) {
    return combined(hexStepsBetween(input.from, input.to, sq, isFlatTopGrid(input.gridType)), up, input.diagonal);
  }
  const across = Math.abs(Math.floor(input.to.x / sq) - Math.floor(input.from.x / sq));
  const down = Math.abs(Math.floor(input.to.y / sq) - Math.floor(input.from.y / sq));
  const [most, next, least] = [across, down, up].sort((a, b) => b - a);
  switch (input.diagonal) {
    case 'alternating':
      return most + Math.floor(next / 2);
    case 'double':
      return most + next;
    case 'none':
      return most + next + least;
    case 'equal':
    default:
      return most;
  }
}

/** Two ways of a corner counted together by the room's rule. */
function combined(a: number, b: number, diagonal: DiagonalMove): number {
  const most = Math.max(a, b);
  const least = Math.min(a, b);
  switch (diagonal) {
    case 'alternating':
      return most + Math.floor(least / 2);
    case 'double':
    case 'none':
      return most + least;
    case 'equal':
    default:
      return most;
  }
}

/**
 * The steps between the hexagons two points lie over. The hexagons are counted as the table lays
 * them: columns standing on a side with every other one pushed down, or rows standing on a point with
 * every other one pushed right.
 */
function hexStepsBetween(from: Vec3, to: Vec3, gridSize: number, flatTop: boolean): number {
  const a = cubeOf(pixelToHexCell(from.x, from.y, gridSize, flatTop), flatTop);
  const b = cubeOf(pixelToHexCell(to.x, to.y, gridSize, flatTop), flatTop);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
}

function cubeOf(cell: { col: number; row: number }, flatTop: boolean): Vec3 {
  if (flatTop) {
    const x = cell.col;
    const z = cell.row - (cell.col - (cell.col & 1)) / 2;
    return { x, y: -x - z, z };
  }
  const x = cell.col - (cell.row - (cell.row & 1)) / 2;
  const z = cell.row;
  return { x, y: -x - z, z };
}
