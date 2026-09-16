import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { hexCellCenter, hexCornerOffsets, hexLayoutOf } from '@axe/domain/tabletop/hex-geometry';
import { HEX_CAP_BLEED, HexBlock, hexCapSheetsOf } from '@axe/domain/tabletop/terrain-batch/hex-caps';
import { describe, expect, it } from 'vitest';

const GRID = 50;

function block(identifier: string, col: number, row: number, extra: Partial<HexBlock> = {}): HexBlock {
  return { identifier, cells: [[col, row]], topPx: 100, look: 'stone', ...extra };
}

/** Every point a path names, as numbers. */
function pointsOf(path: string): { x: number; y: number }[] {
  return [...path.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));
}

for (const isFlatTop of [true, false]) {
  describe(`the tops of blocks on ${isFlatTop ? 'flat' : 'pointy'}-topped hexes, gathered onto sheets`, () => {
    const layout = hexLayoutOf(GRID, isFlatTop);
    const corners = hexCornerOffsets(layout.circumradius, isFlatTop);

    it('puts the blocks of one chunk, height and picture on one sheet, each as a path of its own', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 3, 3)[0];
      const sheets = hexCapSheetsOf([block('here', 3, 3), block('there', 3 + dx, 3 + dy)], GRID, isFlatTop);

      expect(sheets).toHaveLength(1);
      const [sheet] = sheets;
      expect(sheet.blocks.map((one) => one.identifier)).toEqual(['here', 'there']);
      expect(sheet.outline).toBe(sheet.blocks.map((one) => one.path).join(''));
      expect(sheet.blocks.map((one) => one.seams)).toEqual(['', '']);
    });

    it('cuts each hex to its six corners, measured from the corner of the sheet', () => {
      const [sheet] = hexCapSheetsOf([block('alone', 2, 2)], GRID, isFlatTop);
      const centre = hexCellCenter(2, 2, layout.colSpacing, layout.rowSpacing, isFlatTop);
      const drawn = pointsOf(sheet.blocks[0].path);

      expect(drawn).toHaveLength(6);
      drawn.forEach((point, i) => {
        expect(point.x + sheet.left).toBeCloseTo(centre.x + corners[i].x, 2);
        expect(point.y + sheet.top).toBeCloseTo(centre.y + corners[i].y, 2);
      });
      const xs = drawn.map((point) => point.x);
      const ys = drawn.map((point) => point.y);
      expect(Math.min(...xs)).toBeCloseTo(HEX_CAP_BLEED, 2);
      expect(Math.min(...ys)).toBeCloseTo(HEX_CAP_BLEED, 2);
      expect(sheet.width).toBeCloseTo(Math.max(...xs) + HEX_CAP_BLEED, 2);
      expect(sheet.height).toBeCloseTo(Math.max(...ys) + HEX_CAP_BLEED, 2);
    });

    it('gives a block of several cells one path over all of them', () => {
      const cells = [[4, 4] as const, ...hexSideStepsAt(isFlatTop, 4, 4).map(([dx, dy]) => [4 + dx, 4 + dy] as const)];
      const [sheet] = hexCapSheetsOf([{ identifier: 'flower', cells, topPx: 100, look: 'stone' }], GRID, isFlatTop);

      expect(pointsOf(sheet.blocks[0].path)).toHaveLength(42);
    });

    it('parts sheets at the edge of a chunk, and gives each the edge they share to stroke across', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 7, 7).find(([x, y]) => (isFlatTop ? 7 + x : 7 + y) >= 8)!;
      const sheets = hexCapSheetsOf([block('inside', 7, 7), block('beyond', 7 + dx, 7 + dy)], GRID, isFlatTop);

      expect(sheets).toHaveLength(2);
      for (const sheet of sheets) expect(pointsOf(sheet.blocks[0].seams)).toHaveLength(2);
      const [a, b] = sheets.map((sheet) =>
        pointsOf(sheet.blocks[0].seams).map((p) => ({ x: p.x + sheet.left, y: p.y + sheet.top }))
      );
      const key = (p: { x: number; y: number }) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      expect(a.map(key).sort()).toEqual(b.map(key).sort());
    });

    it('strokes no join with a sheet standing at another height', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 7, 7).find(([x, y]) => (isFlatTop ? 7 + x : 7 + y) >= 8)!;
      const sheets = hexCapSheetsOf(
        [block('inside', 7, 7), block('beyond', 7 + dx, 7 + dy, { topPx: 150 })],
        GRID,
        isFlatTop
      );

      expect(sheets.map((sheet) => sheet.blocks[0].seams)).toEqual(['', '']);
    });

    it('keeps tops of different pictures on sheets of their own', () => {
      const [dx, dy] = hexSideStepsAt(isFlatTop, 3, 3)[0];
      const sheets = hexCapSheetsOf(
        [block('stone', 3, 3), block('wood', 3 + dx, 3 + dy, { look: 'wood' })],
        GRID,
        isFlatTop
      );

      expect(sheets).toHaveLength(2);
      for (const sheet of sheets) expect(pointsOf(sheet.blocks[0].seams)).toHaveLength(2);
    });
  });
}
