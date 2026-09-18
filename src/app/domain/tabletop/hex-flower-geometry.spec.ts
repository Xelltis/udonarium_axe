import { PERF_HEX_PEDESTAL_OUTLINE, perfCounters } from '@axe/core/util/perf-counters';
import {
  buildHexFlowerOutline,
  buildHexRingClipPath,
  buildVertexClusterOutline,
  calcHexFlowerParams,
  insetPolygon,
} from '@axe/domain/tabletop/hex-flower-geometry';

describe('hex-flower-geometry', () => {
  describe('buildHexFlowerOutline', () => {
    it('returns the six vertices of a single hex at size one', () => {
      const outline = buildHexFlowerOutline(1, 50, true);
      expect(outline).toHaveLength(6);
    });

    it('makes a regular hexagon at size one, flat-top', () => {
      const gridSize = 50;
      const s = gridSize / Math.sqrt(3);
      const outline = buildHexFlowerOutline(1, gridSize, true);
      // every vertex sits the same distance from the centre
      for (const v of outline) {
        const dist = Math.sqrt(v.x * v.x + v.y * v.y);
        expect(dist).toBeCloseTo(s, 5);
      }
    });

    it('makes a regular hexagon at size one, pointy-top', () => {
      const gridSize = 50;
      const s = gridSize / Math.sqrt(3);
      const outline = buildHexFlowerOutline(1, gridSize, false);
      expect(outline).toHaveLength(6);
      for (const v of outline) {
        const dist = Math.sqrt(v.x * v.x + v.y * v.y);
        expect(dist).toBeCloseTo(s, 5);
      }
    });

    it('returns a closed path at size two, flat-top: seven cells, eighteen edges', () => {
      const outline = buildHexFlowerOutline(2, 50, true);
      // the seven-cell flower has eighteen outer edges, not the twelve the naive formula suggests
      expect(outline.length).toBe(18);
    });

    it('returns a closed path at size two, pointy-top', () => {
      const outline = buildHexFlowerOutline(2, 50, false);
      expect(outline.length).toBe(18);
    });

    it('traces thirty vertices around the outside at size three', () => {
      const outline = buildHexFlowerOutline(3, 50, true);
      expect(outline.length).toBe(30);
    });

    it('counts the same vertices flat-top and pointy-top', () => {
      for (const size of [1, 2, 3, 4]) {
        const flat = buildHexFlowerOutline(size, 50, true);
        const pointy = buildHexFlowerOutline(size, 50, false);
        expect(flat.length).toBe(pointy.length);
      }
    });

    it('keeps the outline symmetric about the origin', () => {
      const outline = buildHexFlowerOutline(2, 50, true);
      const cx = outline.reduce((s, v) => s + v.x, 0) / outline.length;
      const cy = outline.reduce((s, v) => s + v.y, 0) / outline.length;
      expect(cx).toBeCloseTo(0, 3);
      expect(cy).toBeCloseTo(0, 3);
    });
  });

  describe('insetPolygon', () => {
    it('insets a square inward', () => {
      const square = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const inset = insetPolygon(square, 1);
      expect(inset).toHaveLength(4);
      // insetting a clockwise square by one moves every edge a pixel inward
      expect(inset[0].x).toBeCloseTo(1, 5);
      expect(inset[0].y).toBeCloseTo(1, 5);
      expect(inset[1].x).toBeCloseTo(9, 5);
      expect(inset[1].y).toBeCloseTo(1, 5);
      expect(inset[2].x).toBeCloseTo(9, 5);
      expect(inset[2].y).toBeCloseTo(9, 5);
      expect(inset[3].x).toBeCloseTo(1, 5);
      expect(inset[3].y).toBeCloseTo(9, 5);
    });

    it('returns the polygon unchanged at zero width', () => {
      const triangle = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 8 },
      ];
      const inset = insetPolygon(triangle, 0);
      for (let i = 0; i < triangle.length; i++) {
        expect(inset[i].x).toBeCloseTo(triangle[i].x, 10);
        expect(inset[i].y).toBeCloseTo(triangle[i].y, 10);
      }
    });

    it('survives being applied to a hex outline', () => {
      const outline = buildHexFlowerOutline(2, 50, true);
      const inset = insetPolygon(outline, 3);
      expect(inset).toHaveLength(outline.length);
      // the inset polygon is smaller than the original
      const origMinX = Math.min(...outline.map((v) => v.x));
      const origMaxX = Math.max(...outline.map((v) => v.x));
      const insetMinX = Math.min(...inset.map((v) => v.x));
      const insetMaxX = Math.max(...inset.map((v) => v.x));
      expect(insetMinX).toBeGreaterThan(origMinX);
      expect(insetMaxX).toBeLessThan(origMaxX);
    });
  });

  describe('buildHexRingClipPath', () => {
    it('returns an even-odd path string', () => {
      const outline = buildHexFlowerOutline(1, 50, true);
      const bbox = {
        minX: Math.min(...outline.map((v) => v.x)),
        minY: Math.min(...outline.map((v) => v.y)),
        maxX: Math.max(...outline.map((v) => v.x)),
        maxY: Math.max(...outline.map((v) => v.y)),
      };
      const clipPath = buildHexRingClipPath(outline, bbox, 2);
      expect(clipPath).toContain('path(evenodd,');
      expect(clipPath).toContain('M ');
      expect(clipPath).toContain(' Z');
    });

    it('carries an outer and an inner subpath', () => {
      const outline = buildHexFlowerOutline(1, 50, true);
      const bbox = {
        minX: Math.min(...outline.map((v) => v.x)),
        minY: Math.min(...outline.map((v) => v.y)),
        maxX: Math.max(...outline.map((v) => v.x)),
        maxY: Math.max(...outline.map((v) => v.y)),
      };
      const clipPath = buildHexRingClipPath(outline, bbox, 2);
      // two move commands, outer and inner
      const mCount = (clipPath.match(/M /g) ?? []).length;
      expect(mCount).toBe(2);
      // two close commands
      const zCount = (clipPath.match(/ Z/g) ?? []).length;
      expect(zCount).toBe(2);
    });
  });

  describe('calcHexFlowerParams', () => {
    it('clamps the size between one and six', () => {
      const p0 = calcHexFlowerParams(0, 50, true);
      // size=0 → clamp to 1
      expect(p0.outline).toHaveLength(6);

      const p7 = calcHexFlowerParams(7, 50, true);
      // size=7 → clamp to 6
      expect(p7.outline.length).toBe(calcHexFlowerParams(6, 50, true).outline.length);
    });

    it('uses the vertex cluster outline for a fractional size', () => {
      const p = calcHexFlowerParams(1.5, 50, true);
      const cluster = buildVertexClusterOutline(1.5, 50, true);
      expect(p.outline.length).toBe(cluster.length);
    });

    it('uses the six-cell cluster outline at size 2.5', () => {
      const p = calcHexFlowerParams(2.5, 50, true);
      const cluster = buildVertexClusterOutline(2.5, 50, true);
      expect(p.outline.length).toBe(cluster.length);
    });

    it('L = size * gridSize', () => {
      const p = calcHexFlowerParams(3, 50, true);
      expect(p.L).toBe(3 * 50);
    });

    it('g = gridSize', () => {
      const p = calcHexFlowerParams(2, 60, false);
      expect(p.g).toBe(60);
    });

    it('keeps the outline inside its bounding box', () => {
      const p = calcHexFlowerParams(3, 50, true);
      for (const v of p.outline) {
        expect(v.x).toBeGreaterThanOrEqual(p.bbox.minX - 1e-9);
        expect(v.x).toBeLessThanOrEqual(p.bbox.maxX + 1e-9);
        expect(v.y).toBeGreaterThanOrEqual(p.bbox.minY - 1e-9);
        expect(v.y).toBeLessThanOrEqual(p.bbox.maxY + 1e-9);
      }
    });

    it('gives flat-top and pointy-top bounding boxes of the same size', () => {
      const flat = calcHexFlowerParams(2, 50, true);
      const pointy = calcHexFlowerParams(2, 50, false);
      const flatW = flat.bbox.maxX - flat.bbox.minX;
      const flatH = flat.bbox.maxY - flat.bbox.minY;
      const pointyW = pointy.bbox.maxX - pointy.bbox.minX;
      const pointyH = pointy.bbox.maxY - pointy.bbox.minY;
      // the flat-top width matches the pointy-top height, and the other way round
      expect(flatW).toBeCloseTo(pointyH, 5);
      expect(flatH).toBeCloseTo(pointyW, 5);
    });
  });

  describe('buildVertexClusterOutline', () => {
    it('size 1.5 traces three hexes in twelve vertices', () => {
      const outline = buildVertexClusterOutline(1.5, 50, true);
      // 3 hexes sharing a vertex: 3*6=18 edges - 3*2=6 shared edges = 12 boundary edges
      expect(outline).toHaveLength(12);
    });

    it('size 2.5 traces six hexes in eighteen vertices', () => {
      const flat = buildVertexClusterOutline(2.5, 50, true);
      // 6 cells: 6*6=36 edges - 2*9=18 shared = 18 boundary edges
      expect(flat).toHaveLength(18);
      const pointy = buildVertexClusterOutline(2.5, 50, false);
      expect(pointy).toHaveLength(18);
    });

    it('size 3.5 traces twelve hexes in twenty-four vertices', () => {
      const flat = buildVertexClusterOutline(3.5, 50, true);
      // 12 cells: 12*6=72 edges - 2*24=48 shared = 24 boundary edges
      expect(flat).toHaveLength(24);
      const pointy = buildVertexClusterOutline(3.5, 50, false);
      expect(pointy).toHaveLength(24);
    });

    it('counts the same vertices flat-top and pointy-top', () => {
      for (const size of [1.5, 2.5, 3.5, 4.5]) {
        const flat = buildVertexClusterOutline(size, 50, true);
        const pointy = buildVertexClusterOutline(size, 50, false);
        expect(flat.length).toBe(pointy.length);
      }
    });

    it('centres the outline on the origin', () => {
      for (const size of [1.5, 2.5, 3.5]) {
        const outline = buildVertexClusterOutline(size, 50, true);
        const cx = outline.reduce((s, v) => s + v.x, 0) / outline.length;
        const cy = outline.reduce((s, v) => s + v.y, 0) / outline.length;
        expect(Math.abs(cx)).toBeLessThan(5);
        expect(Math.abs(cy)).toBeLessThan(5);
      }
    });

    it('adds vertices as the size grows', () => {
      const v15 = buildVertexClusterOutline(1.5, 50, true).length;
      const v25 = buildVertexClusterOutline(2.5, 50, true).length;
      const v35 = buildVertexClusterOutline(3.5, 50, true).length;
      expect(v25).toBeGreaterThan(v15);
      expect(v35).toBeGreaterThan(v25);
    });
  });

  describe('the outlines already cut', () => {
    afterEach(() => {
      perfCounters.enabled = false;
      perfCounters.clear();
    });

    it('hands the same outline back for a piece of the same size on the same grid', () => {
      perfCounters.enabled = true;
      perfCounters.clear();

      const first = calcHexFlowerParams(5, 61, true);
      const second = calcHexFlowerParams(5, 61, true);

      expect(second).toBe(first);
      expect(perfCounters.drain().get(PERF_HEX_PEDESTAL_OUTLINE)).toBe(1);
    });

    it('cuts one for each size, cell size and way up', () => {
      calcHexFlowerParams(4, 61, true);
      calcHexFlowerParams(4, 61, false);
      calcHexFlowerParams(4, 59, true);
      perfCounters.enabled = true;
      perfCounters.clear();

      const flat = calcHexFlowerParams(4, 61, true);
      const pointy = calcHexFlowerParams(4, 61, false);
      const smaller = calcHexFlowerParams(4, 59, true);

      expect(flat).not.toBe(pointy);
      expect(flat).not.toBe(smaller);
      expect(perfCounters.drain().get(PERF_HEX_PEDESTAL_OUTLINE) ?? 0).toBe(0);
    });
  });
});
