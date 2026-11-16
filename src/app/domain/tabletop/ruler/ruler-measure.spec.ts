import { GridType } from '@axe/domain/tabletop/grid-type';
import { hexCellCenter, hexSpacing } from '@axe/domain/tabletop/hex-geometry';
import { DiagonalMove } from '@axe/domain/tabletop/move/diagonal-move';
import { measureBetween, RulerMeasureInput } from '@axe/domain/tabletop/ruler/ruler-measure';

const SQ = 50;

/** The middle of a square, `up` squares off the table. */
function square(col: number, row: number, up = 0) {
  return { x: col * SQ + SQ / 2, y: row * SQ + SQ / 2, z: up * SQ };
}

function measure(more: Partial<RulerMeasureInput>) {
  return measureBetween({
    from: square(0, 0),
    to: square(3, 0, 4),
    squarePx: SQ,
    gridType: GridType.SQUARE,
    diagonal: 'equal',
    ...more,
  });
}

describe('measureBetween', () => {
  it('measures straight, over the table and up, in squares', () => {
    const measured = measure({});
    expect(measured.straight).toBeCloseTo(5);
    expect(measured.level).toBeCloseTo(3);
    expect(measured.rise).toBeCloseTo(4);
    expect(measure({ from: square(3, 0, 4), to: square(0, 0) }).rise).toBeCloseTo(-4);
  });

  it('counts steps up and across together by the room rule for corners', () => {
    const cases: [DiagonalMove, number][] = [
      ['equal', 4],
      ['alternating', 5],
      ['double', 7],
      ['none', 7],
    ];
    for (const [diagonal, steps] of cases) expect(measure({ diagonal }).steps).toBe(steps);
  });

  it('counts a walk across all three ways as one walk', () => {
    const corner = { from: square(0, 0), to: square(2, 2, 2) };
    expect(measure({ ...corner, diagonal: 'equal' }).steps).toBe(2);
    expect(measure({ ...corner, diagonal: 'alternating' }).steps).toBe(3);
    expect(measure({ ...corner, diagonal: 'double' }).steps).toBe(4);
    expect(measure({ ...corner, diagonal: 'none' }).steps).toBe(6);
  });

  it('counts the squares the ends are over, wherever in them the ends lie', () => {
    expect(measure({ from: { x: 1, y: 1, z: 0 }, to: { x: 199, y: 49, z: 0 } }).steps).toBe(3);
  });

  it('counts half a square of height and more as a step', () => {
    expect(measure({ to: { ...square(0, 0), z: 24 } }).steps).toBe(0);
    expect(measure({ to: { ...square(0, 0), z: 25 } }).steps).toBe(1);
  });

  it('counts in the squares movement and range are counted in', () => {
    const measured = measure({ squarePx: SQ * 2, from: { x: 0, y: 0, z: 0 }, to: { x: 400, y: 0, z: 0 } });
    expect(measured.straight).toBeCloseTo(4);
    expect(measured.steps).toBe(4);
  });

  it('gives no steps on a table without a grid', () => {
    expect(measure({ gridType: GridType.NONE }).steps).toBeNull();
    expect(measure({ gridType: GridType.NONE }).straight).toBeCloseTo(5);
  });

  it('walks hexagons over the table, and counts the height with the walk by the room rule', () => {
    for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const flatTop = gridType === GridType.HEX_VERTICAL;
      const { colSpacing, rowSpacing } = hexSpacing(SQ, flatTop);
      const at = (col: number, row: number, up = 0) => ({
        ...hexCellCenter(col, row, colSpacing, rowSpacing, flatTop),
        z: up * SQ,
      });
      expect(measure({ gridType, from: at(0, 0), to: at(3, 0) }).steps).toBe(3);
      expect(measure({ gridType, from: at(0, 0), to: at(0, 3) }).steps).toBe(3);
      expect(measure({ gridType, from: at(1, 1), to: at(2, 2) }).steps).toBe(1);
      expect(measure({ gridType, from: at(0, 0), to: at(3, 0, 2), diagonal: 'equal' }).steps).toBe(3);
      expect(measure({ gridType, from: at(0, 0), to: at(3, 0, 2), diagonal: 'alternating' }).steps).toBe(4);
      expect(measure({ gridType, from: at(0, 0), to: at(3, 0, 2), diagonal: 'none' }).steps).toBe(5);
    }
  });

  it('steps once to each of the six hexagons round one, on either kind of hex table', () => {
    for (const gridType of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const flatTop = gridType === GridType.HEX_VERTICAL;
      const { colSpacing, rowSpacing } = hexSpacing(SQ, flatTop);
      for (const [col, row] of [
        [4, 4],
        [5, 5],
        [4, 5],
        [5, 4],
      ]) {
        const centre = hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
        for (let side = 0; side < 6; side++) {
          const angle = (side * 60 + (flatTop ? 30 : 0)) * (Math.PI / 180);
          const across = flatTop ? colSpacing / Math.cos(Math.PI / 6) : colSpacing;
          const to = { x: centre.x + Math.cos(angle) * across, y: centre.y + Math.sin(angle) * across, z: 0 };
          expect(measure({ gridType, from: { ...centre, z: 0 }, to }).steps).toBe(1);
        }
      }
    }
  });
});
