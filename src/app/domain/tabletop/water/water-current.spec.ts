import type { WaterCell } from '@axe/domain/tabletop/water/water-cells';
import { currentOf } from '@axe/domain/tabletop/water/water-current';

/** A cell of water a cell deep, its surface at 40, flowing as given. */
function cell(flowDirection: number, flowSpeed: number, overrides: Partial<WaterCell> = {}): WaterCell {
  return {
    index: 0,
    cx: 25,
    cy: 25,
    floorPx: -10,
    surfacePx: 40,
    flat: true,
    areaFloorPx: -10,
    color: '#4a8a96',
    density: 0.5,
    turbidity: 0,
    dirt: 0,
    leaves: 0,
    flowSpeed,
    flowDirection,
    ice: 0,
    area: 'stream',
    ...overrides,
  };
}

describe('the current under a block', () => {
  it('runs the way its cells flow, clockwise from the top of the table', () => {
    const north = currentOf([cell(0, 0.5), cell(0, 0.5)]);
    expect(north?.towardX).toBeCloseTo(0);
    expect(north?.towardY).toBeCloseTo(-1);
    const east = currentOf([cell(90, 0.2)]);
    expect(east?.towardX).toBeCloseTo(1);
    expect(east?.towardY).toBeCloseTo(0);
  });

  it('runs the way the faster of its cells flows, its surface the highest of theirs', () => {
    const current = currentOf([cell(180, 0.8, { surfacePx: 30 }), cell(0, 0.2, { surfacePx: 45 })]);
    expect(current?.towardY).toBeCloseTo(1);
    expect(current?.surfacePx).toBe(45);
  });

  it('is none over still water, ground risen to the surface, or flows that cancel out', () => {
    expect(currentOf([])).toBeNull();
    expect(currentOf([cell(90, 0)])).toBeNull();
    expect(currentOf([cell(90, 0.5, { floorPx: 40 })])).toBeNull();
    expect(currentOf([cell(90, 0.5), cell(270, 0.5)])).toBeNull();
  });

  it('leaves out still cells and dry ones from its surface', () => {
    const current = currentOf([
      cell(90, 0.5),
      cell(0, 0, { surfacePx: 90 }),
      cell(0, 0.5, { surfacePx: 80, floorPx: 80 }),
    ]);
    expect(current?.surfacePx).toBe(40);
    expect(current?.towardX).toBeCloseTo(1);
  });
});
