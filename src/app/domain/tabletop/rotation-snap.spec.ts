import { GridType } from '@axe/domain/tabletop/game-table';
import {
  HEX_GRID_SNAP_DEGREES,
  rotationSnapStep,
  shownAngle,
  snapAngle,
  SQUARE_GRID_SNAP_DEGREES,
} from '@axe/domain/tabletop/rotation-snap';

describe('rotation-snap', () => {
  it('steps by the sides and diagonals on a square grid, and by faces and corners on a hex grid', () => {
    expect(rotationSnapStep(GridType.SQUARE)).toBe(SQUARE_GRID_SNAP_DEGREES);
    expect(rotationSnapStep(GridType.HEX_VERTICAL)).toBe(HEX_GRID_SNAP_DEGREES);
    expect(rotationSnapStep(GridType.HEX_HORIZONTAL)).toBe(HEX_GRID_SNAP_DEGREES);
  });

  it('brings an angle to the nearest step, either way round', () => {
    expect(snapAngle(22, 45)).toBe(0);
    expect(snapAngle(23, 45)).toBe(45);
    expect(snapAngle(-100, 45)).toBe(-90);
    expect(snapAngle(-10, 45)).toBe(0);
    expect(snapAngle(44, 30)).toBe(30);
    expect(snapAngle(46, 30)).toBe(60);
  });

  it('leaves the angle alone with no step to snap to', () => {
    expect(snapAngle(17.5, 0)).toBe(17.5);
  });

  it('reads an angle out in whole degrees from 0 to 359', () => {
    expect(shownAngle(-90)).toBe(270);
    expect(shownAngle(359.6)).toBe(0);
    expect(shownAngle(405)).toBe(45);
    expect(shownAngle(-0.2)).toBe(0);
  });
});
