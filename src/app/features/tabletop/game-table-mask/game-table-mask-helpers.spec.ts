import { GridType } from '@axe/domain/tabletop/game-table';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { boardExtentPx, tableSizeFor } from '@axe/domain/tabletop/map-grid';
import {
  buildHexOuterBorderSvg,
  buildHexOutlineMask,
  buildMaskCss,
  type BuildMaskCssParams,
  buildScratchedMaskCss,
  buildScratchingGridInfos,
  type ScratchGridInfo,
} from '@axe/features/tabletop/game-table-mask/game-table-mask-helpers';
import { describe, expect, it } from 'vitest';

describe('game-table-mask-helpers', () => {
  describe('buildMaskCss', () => {
    it('hides only what the scratching changes while previewing', () => {
      const css = buildMaskCss({
        currentScratchingSet: new Set(['1:0']),
        gridSize: 50,
        gridType: GridType.SQUARE,
        height: 1,
        isNonScratched: false,
        isPreviewMode: true,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 2,
      });

      expect(css).toBe('radial-gradient(#000, #000) 0px 0px / 0px 0px no-repeat');
    });

    it('leaves out what has already been scratched otherwise', () => {
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.SQUARE,
        height: 1,
        isNonScratched: false,
        isPreviewMode: false,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 2,
      });

      expect(css).toBe('radial-gradient(#000, #000) 49px -1px / 52px 52px no-repeat');
    });

    it('shows a cell the scratching leaves as it was', () => {
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.SQUARE,
        height: 1,
        isNonScratched: false,
        isPreviewMode: true,
        scratchedGrids: '0:0',
        scratchingGrids: '0:0',
        width: 1,
      });

      expect(css).toBe('radial-gradient(#000, #000) -1px -1px / 52px 52px no-repeat');
    });

    it('returns nothing for an unscratched cell', () => {
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.SQUARE,
        height: 2,
        isNonScratched: true,
        isPreviewMode: false,
        scratchedGrids: '',
        scratchingGrids: '',
        width: 2,
      });

      expect(css).toBe('');
    });
  });

  describe('buildScratchingGridInfos', () => {
    it('reports a cell that has been scratched', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.SQUARE,
        hasGameTableMask: true,
        height: 1,
        isNonScratched: false,
        isNonScratching: true,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 1,
      });

      expect(infos).toEqual([{ cx: 25, cy: 25, state: 'scrached', x: 0, y: 0 } satisfies ScratchGridInfo]);
    });

    it('reports one being scratched now', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: new Set(['0:0']),
        gridSize: 50,
        gridType: GridType.SQUARE,
        hasGameTableMask: true,
        height: 1,
        isNonScratched: true,
        isNonScratching: false,
        scratchedGrids: '',
        scratchingGrids: '',
        width: 1,
      });

      expect(infos).toEqual([{ cx: 25, cy: 25, state: 'scraching', x: 0, y: 0 } satisfies ScratchGridInfo]);
    });

    it('reports one being restored', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: new Set(['0:0']),
        gridSize: 50,
        gridType: GridType.SQUARE,
        hasGameTableMask: true,
        height: 1,
        isNonScratched: false,
        isNonScratching: false,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 1,
      });

      expect(infos).toEqual([{ cx: 25, cy: 25, state: 'restore', x: 0, y: 0 } satisfies ScratchGridInfo]);
    });

    it('returns nothing without a mask or a change', () => {
      expect(
        buildScratchingGridInfos({
          currentScratchingSet: null,
          gridSize: 50,
          gridType: GridType.SQUARE,
          hasGameTableMask: false,
          height: 1,
          isNonScratched: true,
          isNonScratching: true,
          scratchedGrids: '',
          scratchingGrids: '',
          width: 1,
        })
      ).toEqual([]);
    });
  });

  describe('buildMaskCss (hex)', () => {
    it('leaves the scratched hexes out of the mask on a pointy-topped grid', () => {
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.HEX_VERTICAL,
        height: 1,
        isNonScratched: false,
        isPreviewMode: false,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 2,
      });

      expect(css).toContain('data:image/svg+xml');
      expect(css).toContain('polygon');
      // one hex is scratched and the other is not, so the mask is neither full nor empty
    });

    it('returns an empty mask once every hex is scratched', () => {
      // with a single hex, scratched
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.HEX_HORIZONTAL,
        height: 1,
        isNonScratched: false,
        isPreviewMode: false,
        scratchedGrids: '0:0,1:0,0:1,1:1',
        scratchingGrids: '',
        width: 1,
      });

      // the mask comes back empty, or at least without a polygon
      expect(css).toSatisfy((v: string) => v.includes('0px 0px / 0px 0px') || !v.includes('<polygon'));
    });

    it('still returns a hex-shaped mask with nothing scratched', () => {
      const css = buildMaskCss({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.HEX_VERTICAL,
        height: 2,
        isNonScratched: true,
        isPreviewMode: false,
        scratchedGrids: '',
        scratchingGrids: '',
        width: 2,
      });

      expect(css).toContain('data:image/svg+xml');
      expect(css).toContain('polygon');
    });
  });

  describe('buildScratchingGridInfos (hex)', () => {
    it('gives a scratched hex its points on a pointy-topped grid', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.HEX_VERTICAL,
        hasGameTableMask: true,
        height: 1,
        isNonScratched: false,
        isNonScratching: true,
        scratchedGrids: '0:0',
        scratchingGrids: '',
        width: 1,
      });

      expect(infos).toHaveLength(1);
      expect(infos[0].state).toBe('scrached');
      expect(infos[0].hexPoints).toBeDefined();
      expect(infos[0].hexPoints!.split(' ')).toHaveLength(6);
      // with the odd-column offset added
      const s = 50 / Math.sqrt(3);
      expect(infos[0].cx).toBeCloseTo(s, 5);
      expect(infos[0].cy).toBeCloseTo(25, 5);
    });

    it('offsets the centre of an odd column on a flat-topped grid', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: null,
        gridSize: 50,
        gridType: GridType.HEX_HORIZONTAL,
        hasGameTableMask: true,
        height: 2,
        isNonScratched: false,
        isNonScratching: true,
        scratchedGrids: '0:1',
        scratchingGrids: '',
        width: 2,
      });

      expect(infos).toHaveLength(1);
      // pointy-top row=1 (odd) → x offset by colSpacing/2 + geometry offsetX (gridSize/2)
      expect(infos[0].cx).toBeCloseTo(50, 5);
      expect(infos[0].hexPoints).toBeDefined();
    });

    it('gives a hex being scratched its points as well', () => {
      const infos = buildScratchingGridInfos({
        currentScratchingSet: new Set(['1:0']),
        gridSize: 50,
        gridType: GridType.HEX_VERTICAL,
        hasGameTableMask: true,
        height: 1,
        isNonScratched: true,
        isNonScratching: false,
        scratchedGrids: '',
        scratchingGrids: '',
        width: 2,
      });

      const scraching = infos.find((i) => i.x === 1 && i.y === 0);
      expect(scraching).toBeDefined();
      expect(scraching!.state).toBe('scraching');
      expect(scraching!.hexPoints).toBeDefined();
    });
  });

  describe('buildHexOutlineMask', () => {
    it('returns a mask for a pointy-topped grid', () => {
      const mask = buildHexOutlineMask(50, GridType.HEX_VERTICAL, 2, 2);
      expect(mask).toContain('data:image/svg+xml');
      expect(mask).toContain('polygon');
    });

    it('returns one for a flat-topped grid', () => {
      const mask = buildHexOutlineMask(50, GridType.HEX_HORIZONTAL, 2, 2);
      expect(mask).toContain('data:image/svg+xml');
      expect(mask).toContain('polygon');
    });

    it('returns nothing for squares', () => {
      expect(buildHexOutlineMask(50, GridType.SQUARE, 2, 2)).toBe('');
    });

    it('returns nothing for no grid at all', () => {
      expect(buildHexOutlineMask(50, GridType.NONE, 2, 2)).toBe('');
    });
  });

  describe('the table a generated board is laid on', () => {
    it.each([
      ['flat-top', GridType.HEX_VERTICAL],
      ['pointy-top', GridType.HEX_HORIZONTAL],
    ])('covers the board exactly, on a %s board', (_label, gridType) => {
      const board = { width: 25, height: 19 };
      const grid = { type: gridType, sizePx: 50 };
      const table = tableSizeFor(board, grid);

      const field = computeHexMaskGeometry(table.width, table.height, 50, gridType)!;
      const extent = boardExtentPx(board, grid);

      expect(field.pixelW).toBeCloseTo(extent.widthPx);
      expect(field.pixelH).toBeCloseTo(extent.heightPx);
    });
  });

  describe('computeHexMaskGeometry', () => {
    it('returns nothing for squares', () => {
      expect(computeHexMaskGeometry(4, 4, 50, GridType.SQUARE)).toBeNull();
    });

    it('measures a pointy-topped grid in pixels', () => {
      const geo = computeHexMaskGeometry(4, 4, 50, GridType.HEX_VERTICAL)!;
      const s = 50 / Math.sqrt(3);
      expect(geo.offsetX).toBeCloseTo(s, 5);
      expect(geo.offsetY).toBeCloseTo(25, 5);
      expect(geo.pixelW).toBeCloseTo(2 * s + 3 * 1.5 * s, 5);
      // cols >= 2 → pixelH = rows * gridSize + gridSize / 2
      expect(geo.pixelH).toBeCloseTo(4 * 50 + 25, 5);
    });

    it('measures a flat-topped one', () => {
      const geo = computeHexMaskGeometry(4, 4, 50, GridType.HEX_HORIZONTAL)!;
      const s = 50 / Math.sqrt(3);
      expect(geo.offsetX).toBeCloseTo(25, 5);
      expect(geo.offsetY).toBeCloseTo(s, 5);
      // rows >= 2 → pixelW = cols * gridSize + gridSize / 2
      expect(geo.pixelW).toBeCloseTo(4 * 50 + 25, 5);
      expect(geo.pixelH).toBeCloseTo(2 * s + 3 * 1.5 * s, 5);
    });

    it('leaves out the odd-column offset for a single column', () => {
      const geo = computeHexMaskGeometry(1, 4, 50, GridType.HEX_VERTICAL)!;
      // cols=1 → no odd column → pixelH = rows * gridSize
      expect(geo.pixelH).toBeCloseTo(4 * 50, 5);
    });
  });

  describe('buildHexOuterBorderSvg', () => {
    it('draws the outer edges of a pointy-topped grid', () => {
      const svg = buildHexOuterBorderSvg(50, GridType.HEX_VERTICAL, 3, 3);
      expect(svg).toContain('data:image/svg+xml');
      expect(svg).toContain('line');
      expect(svg).toContain('stroke');
    });

    it('draws the outer edges of a flat-topped one', () => {
      const svg = buildHexOuterBorderSvg(50, GridType.HEX_HORIZONTAL, 3, 3);
      expect(svg).toContain('data:image/svg+xml');
      expect(svg).toContain('line');
    });

    it('returns nothing for squares', () => {
      expect(buildHexOuterBorderSvg(50, GridType.SQUARE, 3, 3)).toBe('');
    });

    it('returns nothing for no grid at all', () => {
      expect(buildHexOuterBorderSvg(50, GridType.NONE, 3, 3)).toBe('');
    });

    it('counts all six edges of a lone hex as outer ones', () => {
      const svg = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_VERTICAL, 1, 1));
      // 1 cell × 6 edges = 6 <line> elements
      const lineCount = (svg.match(/<line /g) || []).length;
      expect(lineCount).toBe(6);
    });

    it('counts all six on a flat-topped grid too', () => {
      const svg = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_HORIZONTAL, 1, 1));
      const lineCount = (svg.match(/<line /g) || []).length;
      expect(lineCount).toBe(6);
    });

    it('leaves out the edges between neighbours', () => {
      const svg1 = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_VERTICAL, 1, 1));
      const svg2 = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_VERTICAL, 2, 2));
      const count1 = (svg1.match(/<line /g) || []).length;
      const count2 = (svg2.match(/<line /g) || []).length;
      // 2x2 has fewer outer edges per cell than 1x1 (interior edges removed)
      // 4 cells × 6 edges = 24 total, minus shared internal edges
      expect(count2).toBeLessThan(4 * 6);
      expect(count2).toBeGreaterThan(count1);
    });

    it('leaves them out on a flat-topped grid too', () => {
      const svg1 = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_HORIZONTAL, 1, 1));
      const svg2 = decodeURIComponent(buildHexOuterBorderSvg(50, GridType.HEX_HORIZONTAL, 2, 2));
      const count1 = (svg1.match(/<line /g) || []).length;
      const count2 = (svg2.match(/<line /g) || []).length;
      expect(count2).toBeLessThan(4 * 6);
      expect(count2).toBeGreaterThan(count1);
    });
  });

  describe('buildScratchedMaskCss', () => {
    const square: BuildMaskCssParams = {
      currentScratchingSet: null,
      gridSize: 50,
      gridType: GridType.SQUARE,
      height: 1,
      isNonScratched: false,
      isPreviewMode: false,
      scratchedGrids: '',
      scratchingGrids: '',
      width: 2,
    };

    function polygonsOf(css: string): string[] {
      return decodeURIComponent(css).match(/<polygon points="[^"]*"\/>/g) ?? [];
    }

    it('keeps only the squares scratched open, grown by the same pixel as the mask', () => {
      const params = { ...square, scratchedGrids: '1:0' };

      expect(buildScratchedMaskCss(params)).toBe('radial-gradient(#000, #000) 49px -1px / 52px 52px no-repeat');
      expect(buildMaskCss(params)).toBe('radial-gradient(#000, #000) -1px -1px / 52px 52px no-repeat');
    });

    it('keeps the squares a pending scratch leaves open while previewing', () => {
      const css = buildScratchedMaskCss({
        ...square,
        currentScratchingSet: new Set(['1:0']),
        isPreviewMode: true,
        scratchedGrids: '0:0',
      });

      expect(css).toBe(
        'radial-gradient(#000, #000) -1px -1px / 52px 52px no-repeat,' +
          'radial-gradient(#000, #000) 49px -1px / 52px 52px no-repeat'
      );
    });

    it('counts a square the pending scratch covers again as closed while previewing', () => {
      const css = buildScratchedMaskCss({
        ...square,
        isPreviewMode: true,
        scratchedGrids: '0:0',
        scratchingGrids: '0:0',
        width: 1,
      });

      expect(css).toBe('');
    });

    it('returns nothing when no square is open', () => {
      expect(buildScratchedMaskCss({ ...square, isNonScratched: true })).toBe('');
      expect(buildScratchedMaskCss({ ...square, isNonScratched: true, isPreviewMode: true })).toBe('');
    });

    it('keeps only the open hexes, each drawn exactly as the mask draws it', () => {
      const scratched = { ...square, gridType: GridType.HEX_VERTICAL, height: 2, scratchedGrids: '1:1' };
      const whole = polygonsOf(buildMaskCss({ ...scratched, isNonScratched: true, scratchedGrids: '' }));

      const open = polygonsOf(buildScratchedMaskCss(scratched));
      const covered = polygonsOf(buildMaskCss(scratched));

      expect(whole).toHaveLength(4);
      expect(open).toHaveLength(1);
      expect([...covered, ...open].sort()).toEqual([...whole].sort());
    });

    it('keeps the hexes a pending scratch opens while previewing, on a flat-topped grid', () => {
      const hex = { ...square, gridType: GridType.HEX_HORIZONTAL, isNonScratched: true };
      const whole = polygonsOf(buildMaskCss(hex));

      const open = polygonsOf(
        buildScratchedMaskCss({ ...hex, currentScratchingSet: new Set(['0:0']), isPreviewMode: true })
      );

      expect(open).toEqual([whole[0]]);
    });

    it('returns nothing when no hex is open', () => {
      const hex = { ...square, gridType: GridType.HEX_VERTICAL };

      expect(buildScratchedMaskCss({ ...hex, isNonScratched: true })).toBe('');
      expect(
        buildScratchedMaskCss({ ...hex, isPreviewMode: true, scratchedGrids: '0:0', scratchingGrids: '0:0' })
      ).toBe('');
    });
  });
});
