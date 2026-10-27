import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import {
  ClipAreaCorn,
  ClipAreaSquare,
  RangeRenderSetting,
} from '@axe/infrastructure/tabletop/range/range-render-types';
import {
  calcGridOffsets,
  chkInCircle,
  chkOuterProduct,
  clipAreaToPolygonCss,
  clipCircleCss,
  fillSquare,
  generateCalcGridPositionFunc,
  makeBrush,
} from '@axe/infrastructure/tabletop/range/range-render-util';

function makeDefaultSetting(overrides: Partial<RangeRenderSetting> = {}): RangeRenderSetting {
  return {
    areaWidth: 10,
    areaHeight: 10,
    range: 3,
    width: 1,
    centerX: 0,
    centerY: 0,
    gridSize: 50,
    type: 'CIRCLE',
    gridColor: '#ff0000',
    rangeColor: '#0000ff',
    fanDegree: 360,
    degree: 0,
    offSetX: false,
    offSetY: false,
    fillOutLine: false,
    gridType: GridType.SQUARE,
    isDocking: false,
    ...overrides,
  };
}

describe('range-render-util', () => {
  describe('isHexGrid', () => {
    it('is true for a pointy-topped grid', () => {
      expect(isHexGrid(GridType.HEX_VERTICAL)).toBe(true);
    });

    it('is true for a flat-topped one', () => {
      expect(isHexGrid(GridType.HEX_HORIZONTAL)).toBe(true);
    });

    it('is false for squares', () => {
      expect(isHexGrid(GridType.SQUARE)).toBe(false);
    });

    it('is false for no grid at all', () => {
      expect(isHexGrid(GridType.NONE)).toBe(false);
    });
  });

  describe('calcGridOffsets', () => {
    it('keeps the offset at or below zero at the origin', () => {
      const setting = makeDefaultSetting({ centerX: 0, centerY: 0, gridSize: 50, areaWidth: 10, areaHeight: 10 });
      const offsets = calcGridOffsets(setting);
      expect(offsets.gridSize).toBe(50);
      expect(offsets.offSetX_px).toBe(250); // (10*50)/2
      expect(offsets.offSetY_px).toBe(250);
      expect(offsets.gridOffX).toBeLessThanOrEqual(0);
      expect(offsets.gridOffY).toBeLessThanOrEqual(0);
    });

    it('works the offset out from the centre', () => {
      const setting = makeDefaultSetting({ centerX: 75, centerY: 0, gridSize: 50 });
      const offsets = calcGridOffsets(setting);
      // centerX % gridSize = 75 % 50 = 25 → gridOffX = -25
      expect(offsets.gridOffX).toBe(-25);
    });

    it('shifts the offset by half a cell across', () => {
      const setting = makeDefaultSetting({ centerX: 0, centerY: 0, gridSize: 50, offSetX: true });
      const offsets = calcGridOffsets(setting);
      // an offset of zero is not below the threshold, so half a cell comes off
      expect(offsets.gridOffX).toBe(-25);
    });

    it('shifts it by half a cell down', () => {
      const setting = makeDefaultSetting({ centerX: 0, centerY: 0, gridSize: 50, offSetY: true });
      const offsets = calcGridOffsets(setting);
      expect(offsets.gridOffY).toBe(-25);
    });
  });

  describe('generateCalcGridPositionFunc', () => {
    it('sizes a square area by its cells', () => {
      const fn = generateCalcGridPositionFunc(GridType.SQUARE, 0, 0, 10, 10, 50);
      const pos = fn(3, 5);
      expect(pos.gx).toBe(150);
      expect(pos.gy).toBe(250);
    });

    it('offsets an odd column by half a row on a pointy-topped grid', () => {
      const fn = generateCalcGridPositionFunc(GridType.HEX_VERTICAL, 0, 0, 10, 10, 50);
      // The grid position is a shared mutable object, so the numbers are taken out at once.
      const evenGy = fn(0, 2).gy;
      const oddGy = fn(1, 2).gy;
      // puts half a cell between an even column and an odd one
      expect(Math.abs(evenGy - oddGy)).toBe(25);
    });

    it('offsets an odd row by half a column on a flat-topped grid', () => {
      const fn = generateCalcGridPositionFunc(GridType.HEX_HORIZONTAL, 0, 0, 10, 10, 50);
      const evenGx = fn(2, 0).gx;
      const oddGx = fn(2, 1).gx;
      // puts half a cell between an even row and an odd one
      expect(Math.abs(evenGx - oddGx)).toBe(25);
    });
  });

  describe('chkOuterProduct', () => {
    it('is true inside a clockwise polygon', () => {
      // a point inside a clockwise square
      expect(chkOuterProduct(0, 0, 10, 0, 5, 5)).toBe(true);
    });

    it('is false outside one', () => {
      // a point outside it
      expect(chkOuterProduct(0, 0, 10, 0, 5, -5)).toBe(false);
    });

    it('is true on an edge, within rounding', () => {
      expect(chkOuterProduct(0, 0, 10, 0, 5, 0)).toBe(true);
    });
  });

  describe('clipAreaToPolygonCss', () => {
    it('turns a four-point square into a polygon', () => {
      const square: ClipAreaSquare = {
        clip01x: 0,
        clip01y: 0,
        clip02x: 100,
        clip02y: 0,
        clip03x: 100,
        clip03y: 100,
        clip04x: 0,
        clip04y: 100,
      };
      expect(clipAreaToPolygonCss(square)).toBe('polygon(0px 0px, 100px 0px, 100px 100px, 0px 100px)');
    });

    it('turns a nine-point cone into one', () => {
      const corn: ClipAreaCorn = {
        clip01x: 1,
        clip01y: 2,
        clip02x: 3,
        clip02y: 4,
        clip03x: 5,
        clip03y: 6,
        clip04x: 7,
        clip04y: 8,
        clip05x: 9,
        clip05y: 10,
        clip06x: 11,
        clip06y: 12,
        clip07x: 13,
        clip07y: 14,
        clip08x: 15,
        clip08y: 16,
        clip09x: 17,
        clip09y: 18,
      };
      expect(clipAreaToPolygonCss(corn)).toBe(
        'polygon(1px 2px, 3px 4px, 5px 6px, 7px 8px, 9px 10px, 11px 12px, 13px 14px, 15px 16px, 17px 18px)'
      );
    });

    it('stops at the first gap in the numbering', () => {
      // with the third point missing
      const partial = { clip01x: 1, clip01y: 2, clip02x: 3, clip02y: 4 } as unknown as ClipAreaSquare;
      expect(clipAreaToPolygonCss(partial)).toBe('polygon(1px 2px, 3px 4px)');
    });
  });

  describe('clipCircleCss', () => {
    it('gives the circle its length plus a cell and a half', () => {
      // length=3, gridSize=50 → (3+1.5)*50 = 225
      expect(clipCircleCss(3, 50)).toBe('circle(225px)');
    });

    it('keeps that much radius at no length at all', () => {
      expect(clipCircleCss(0, 50)).toBe('circle(75px)');
    });
  });

  describe('chkInCircle', () => {
    it('is true inside a circle', () => {
      expect(chkInCircle(10, 3, 4)).toBe(true);
    });

    it('is false outside one', () => {
      expect(chkInCircle(5, 4, 4)).toBe(false);
    });

    it('is true on the rim', () => {
      expect(chkInCircle(5, 3, 4)).toBe(true);
    });

    it('is true at the centre', () => {
      expect(chkInCircle(1, 0, 0)).toBe(true);
    });
  });

  describe('fillSquare', () => {
    it('fills the rectangle', () => {
      const ctx = {
        fillRect: vi.fn(),
      } as unknown as CanvasRenderingContext2D;
      fillSquare(ctx, 10, 20, 50);
      expect(ctx.fillRect).toHaveBeenCalledWith(10, 20, 50, 50);
    });
  });

  describe('makeBrush', () => {
    it('sets the drawing style', () => {
      const ctx = {
        strokeStyle: '',
        fillStyle: '',
        lineWidth: 0,
        font: '',
        textBaseline: '',
        textAlign: '',
      } as unknown as CanvasRenderingContext2D;
      const result = makeBrush(ctx, 50, '#ff0000');
      expect(result).toBe(ctx);
      expect(ctx.strokeStyle).toBe('#ff0000');
      expect(ctx.fillStyle).toBe('#ff0000');
      expect(ctx.lineWidth).toBe(1);
      expect(ctx.font).toContain('bold');
      expect(ctx.font).toContain('sans-serif');
      expect(ctx.textBaseline).toBe('top');
      expect(ctx.textAlign).toBe('center');
    });
  });
});
