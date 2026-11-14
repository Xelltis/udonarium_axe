import { GridType } from '@axe/domain/tabletop/game-table';
import { hexCircumradius, hexSpacing } from '@axe/domain/tabletop/hex-geometry';
import {
  colsForWidth,
  coversFrame,
  footprintSize,
  rowsForHeight,
  snapAnchor,
} from '@axe/features/tabletop/map-image-grid-adjuster/map-image-grid-region';

const DC = 48;
const S3 = hexCircumradius(DC);

describe('footprintSize / colsForWidth / rowsForHeight', () => {
  it('makes the footprint round trip on every kind of grid', () => {
    for (const type of [GridType.SQUARE, GridType.HEX_VERTICAL, GridType.HEX_HORIZONTAL]) {
      for (const cols of [2, 7, 16]) {
        for (const rows of [2, 5, 12]) {
          const f = footprintSize(type, cols, rows, DC);
          expect(colsForWidth(type, f.w, DC)).toBe(cols);
          expect(rowsForHeight(type, f.h, DC)).toBe(rows);
        }
      }
    }
  });

  it('falls back to the smallest value it allows', () => {
    expect(footprintSize(GridType.SQUARE, 0, 5, DC)).toEqual({ w: 0, h: 0 });
    expect(colsForWidth(GridType.SQUARE, -10, DC)).toBe(1);
    expect(rowsForHeight(GridType.HEX_VERTICAL, 0, DC)).toBe(1);
  });
});

describe('coversFrame', () => {
  it('is true when the picture covers the frame', () => {
    expect(coversFrame(0, 0, 480, 240, 48, 48, 96, 96)).toBe(true);
  });

  it('is true when it falls short within tolerance', () => {
    expect(coversFrame(48.5, 48.5, 96, 96, 48, 48, 96.4, 96.4)).toBe(true);
  });

  it('is false when the frame runs off the picture', () => {
    expect(coversFrame(100, 0, 480, 240, 48, 48, 96, 96)).toBe(false);
    expect(coversFrame(0, 0, 100, 240, 48, 48, 96, 96)).toBe(false);
  });
});

describe('snapAnchor', () => {
  it('snaps squares onto whole cells', () => {
    expect(snapAnchor(GridType.SQUARE, 50, -20, DC)).toEqual({ tx: 48, ty: -0 });
  });

  it('snaps a pointy-topped grid onto an even column', () => {
    const { colSpacing } = hexSpacing(DC, true);
    const snapped = snapAnchor(GridType.HEX_VERTICAL, 100, 100, DC);
    const i = (snapped.tx + S3) / colSpacing;
    expect(i).toBeCloseTo(Math.round(i), 8);
    expect(Math.round(i) % 2).toBe(0);
  });

  it('snaps a flat-topped one onto an even row', () => {
    const { rowSpacing } = hexSpacing(DC, false);
    const snapped = snapAnchor(GridType.HEX_HORIZONTAL, 100, 100, DC);
    const j = (snapped.ty + S3) / rowSpacing;
    expect(j).toBeCloseTo(Math.round(j), 8);
    expect(Math.round(j) % 2).toBe(0);
  });
});
