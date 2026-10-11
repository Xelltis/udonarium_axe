import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/** The turn a held snap steps by on a square grid: the four sides and the four diagonals. */
export const SQUARE_GRID_SNAP_DEGREES = 45;
/** The turn a held snap steps by on a hex grid: each face and each corner of a hex. */
export const HEX_GRID_SNAP_DEGREES = 30;

/** The turn a held snap steps by for a shape that only ever lies at quarter turns, whatever the grid. */
export const QUARTER_TURN_DEGREES = 90;

/** The turn a held snap steps by on a table of this grid. */
export function rotationSnapStep(gridType: GridType): number {
  return isHexGrid(gridType) ? HEX_GRID_SNAP_DEGREES : SQUARE_GRID_SNAP_DEGREES;
}

/** The angle brought to the nearest whole number of steps. */
export function snapAngle(angle: number, step: number): number {
  if (!(step > 0)) return angle;
  const snapped = Math.round(angle / step) * step;
  return snapped === 0 ? 0 : snapped;
}

/** An angle as it is read out: whole degrees, from 0 up to but not including 360. */
export function shownAngle(angle: number): number {
  const whole = Math.round(angle) % 360;
  return whole < 0 ? whole + 360 : whole === 0 ? 0 : whole;
}
