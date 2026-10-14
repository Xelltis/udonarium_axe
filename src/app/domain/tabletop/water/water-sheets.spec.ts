import { cellGridOf, cellIndexOf, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/grid-type';
import { type WaterArea, waterCellsOf, waterSurfaceLookOf } from '@axe/domain/tabletop/water/water-cells';
import { WATER_CHUNK_CELLS, waterSheetsOf } from '@axe/domain/tabletop/water/water-sheets';

const G = 50;

function area(partial: Partial<WaterArea>): WaterArea {
  return {
    identifier: 'pond',
    left: 0,
    top: 0,
    width: G,
    height: G,
    floorPx: 0,
    surfacePx: 25,
    color: '#3399cc',
    density: 0.6,
    turbidity: 0.15,
    dirt: 0,
    leaves: 0,
    flowSpeed: 0,
    flowDirection: 0,
    ...partial,
  };
}

describe('waterSheetsOf()', () => {
  it('draws a pond on a square board as one sheet cut row by row', () => {
    const grid = cellGridOf(10, 10, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ left: G, top: G, width: 3 * G, height: 2 * G })]);

    const sheets = waterSheetsOf(grid, cells.values(), waterSurfaceLookOf);

    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ left: G, top: G, width: 3 * G, height: 2 * G, surfacePx: 25 });
    expect(sheets[0].path).toBe('M0 0L150 0L150 50L0 50ZM0 50L150 50L150 100L0 100Z');
    expect(sheets[0].cells).toHaveLength(6);
  });

  it('keeps water of different heights apart', () => {
    const grid = cellGridOf(10, 10, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [
      area({ identifier: 'a', width: 2 * G }),
      area({ identifier: 'b', left: 2 * G, width: 2 * G, surfacePx: 50 }),
    ]);
    expect(waterSheetsOf(grid, cells.values(), waterSurfaceLookOf)).toHaveLength(2);
  });

  it('cuts a wide lake into chunks', () => {
    const grid = cellGridOf(40, 4, G, GridType.SQUARE);
    const cells = waterCellsOf(grid, [area({ width: (WATER_CHUNK_CELLS + 2) * G })]);

    const sheets = waterSheetsOf(grid, cells.values(), waterSurfaceLookOf);

    expect(sheets).toHaveLength(2);
    expect(sheets.map((sheet) => sheet.cells.length).sort((a, b) => a - b)).toEqual([2, WATER_CHUNK_CELLS]);
  });

  it('draws each hex of a pond on a hex board inside the sheet box', () => {
    for (const type of [GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      const grid = cellGridOf(10, 10, G, type);
      const cells = waterCellsOf(grid, [area({ left: 2 * G, top: 2 * G, width: 3 * G, height: 3 * G })]);

      const sheets = waterSheetsOf(grid, cells.values(), waterSurfaceLookOf);

      expect(sheets).toHaveLength(1);
      const sheet = sheets[0];
      expect(sheet.path.split('Z').filter((part) => part.length > 0)).toHaveLength(cells.size);
      for (const index of sheet.cells) {
        for (const corner of cellPolygonOf(grid, index)) {
          expect(corner.x).toBeGreaterThanOrEqual(sheet.left - 1e-6);
          expect(corner.y).toBeGreaterThanOrEqual(sheet.top - 1e-6);
          expect(corner.x).toBeLessThanOrEqual(sheet.left + sheet.width + 1e-6);
          expect(corner.y).toBeLessThanOrEqual(sheet.top + sheet.height + 1e-6);
        }
      }
      expect(sheet.cells).toContain(cellIndexOf(grid, 3, 3));
    }
  });
});
