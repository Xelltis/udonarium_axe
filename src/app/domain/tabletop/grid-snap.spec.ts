import { GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import {
  calcHexAllSnapPosition,
  calcHexBothSnapPosition,
  calcHexEdgeMidpointSnapPosition,
  calcHexSnapPosition,
  calcHexVertexSnapPosition,
  calcSnapNum,
  gridSnapPosition,
} from '@axe/domain/tabletop/grid-snap';

describe('grid snap', () => {
  describe('calcSnapNum', () => {
    it('returns the value unchanged when the interval is zero or less', () => {
      expect(calcSnapNum(13, 0)).toBe(13);
      expect(calcSnapNum(13, -1)).toBe(13);
    });

    it('rounds a positive number to the grid', () => {
      expect(calcSnapNum(13, 25)).toBe(25);
      expect(calcSnapNum(36, 25)).toBe(25);
    });

    it('rounds a negative number to the grid', () => {
      expect(calcSnapNum(-13, 25)).toBe(-25);
      expect(calcSnapNum(-36, 25)).toBe(-25);
    });
  });

  describe('calcHexSnapPosition', () => {
    const gridSize = 50;
    const s = gridSize / Math.sqrt(3);

    describe('flat-top (HEX_VERTICAL)', () => {
      const colSpacing = 1.5 * s;

      it('snaps a point near the origin to the centre of hex (0,0)', () => {
        const result = calcHexSnapPosition(5, 5, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });

      it('snaps to the centre of column 1, which sits half a row down', () => {
        const cx = colSpacing;
        const cy = gridSize / 2;
        const result = calcHexSnapPosition(cx, cy, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(cx - gridSize / 2);
        expect(result.y).toBeCloseTo(cy - gridSize / 2);
      });

      it('snaps a point between two hexes to the nearer one', () => {
        const cx0 = 0;
        const cx1 = colSpacing;
        const midX = (cx0 + cx1) / 2 - 1;
        const result = calcHexSnapPosition(midX, 0, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(cx0 - gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });
    });

    describe('pointy-top (HEX_HORIZONTAL)', () => {
      const rowSpacing = 1.5 * s;

      it('snaps a point near the origin to the centre of hex (0,0)', () => {
        const result = calcHexSnapPosition(5, 5, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(-gridSize / 2);
      });

      it('snaps to the centre of row 1, which sits half a column across', () => {
        const cx = gridSize / 2;
        const cy = rowSpacing;
        const result = calcHexSnapPosition(cx, cy, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(cx - gridSize / 2);
        expect(result.y).toBeCloseTo(cy - gridSize / 2);
      });

      it('snaps a point between two hexes to the nearer one', () => {
        const cy0 = 0;
        const cy1 = rowSpacing;
        const midY = (cy0 + cy1) / 2 - 1;
        const result = calcHexSnapPosition(0, midY, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(-gridSize / 2);
        expect(result.y).toBeCloseTo(cy0 - gridSize / 2);
      });
    });
  });

  describe('calcHexVertexSnapPosition', () => {
    const gridSize = 50;
    const s = gridSize / Math.sqrt(3);

    describe('flat-top (HEX_VERTICAL)', () => {
      it('snaps a point near the origin to a vertex rather than the cell centre', () => {
        // flat-top (0,0) hex center is at (0,0), vertex at angle 0 is at (s,0)
        const result = calcHexVertexSnapPosition(s, 0, gridSize, GridType.HEX_VERTICAL);
        expect(result.x).toBeCloseTo(s - gridSize / 2);
        expect(result.y).toBeCloseTo(0 - gridSize / 2);
      });

      it('snaps to the nearest vertex even from the cell centre', () => {
        // (0,0) hex center → nearest vertex is at distance s
        const result = calcHexVertexSnapPosition(0, 0, gridSize, GridType.HEX_VERTICAL);
        // Should snap to one of the 6 vertices of (0,0) hex, distance s from center
        const snappedCenterX = result.x + gridSize / 2;
        const snappedCenterY = result.y + gridSize / 2;
        const dist = Math.sqrt(snappedCenterX * snappedCenterX + snappedCenterY * snappedCenterY);
        expect(dist).toBeCloseTo(s);
      });
    });

    describe('pointy-top (HEX_HORIZONTAL)', () => {
      it('snaps a point near the origin to a vertex rather than the cell centre', () => {
        // pointy-top (0,0) hex center is at (0,0), vertex at angle -90° is at (0,-s)
        const result = calcHexVertexSnapPosition(0, -s, gridSize, GridType.HEX_HORIZONTAL);
        expect(result.x).toBeCloseTo(0 - gridSize / 2);
        expect(result.y).toBeCloseTo(-s - gridSize / 2);
      });

      it('snaps to the nearest vertex even from the cell centre', () => {
        const result = calcHexVertexSnapPosition(0, 0, gridSize, GridType.HEX_HORIZONTAL);
        const snappedCenterX = result.x + gridSize / 2;
        const snappedCenterY = result.y + gridSize / 2;
        const dist = Math.sqrt(snappedCenterX * snappedCenterX + snappedCenterY * snappedCenterY);
        expect(dist).toBeCloseTo(s);
      });
    });
  });

  describe('calcHexBothSnapPosition', () => {
    const gridSize = 50;

    it('snaps to the cell centre when nearest to it', () => {
      // (0,0) hex center → should snap to center
      const result = calcHexBothSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      const centerResult = calcHexSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(centerResult.x);
      expect(result.y).toBeCloseTo(centerResult.y);
    });

    it('snaps to a vertex when nearest to one', () => {
      const s = gridSize / Math.sqrt(3);
      // flat-top vertex at (s, 0) — very close to vertex
      const result = calcHexBothSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      const vertexResult = calcHexVertexSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(vertexResult.x);
      expect(result.y).toBeCloseTo(vertexResult.y);
    });
  });

  describe('calcHexEdgeMidpointSnapPosition', () => {
    const gridSize = 50;
    // inradius = gridSize / 2 = 25

    it('flat-top: snaps to the edge midpoint 30 degrees round', () => {
      // flat-top edge midpoint at 30 degrees: (inradius*cos30, inradius*sin30)
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexEdgeMidpointSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      expect(result.x + gridSize / 2).toBeCloseTo(mx);
      expect(result.y + gridSize / 2).toBeCloseTo(my);
    });

    it('pointy-top: snaps to the edge midpoint straight ahead', () => {
      // pointy-top edge midpoint at 0 degrees: (inradius, 0) = (25, 0)
      const inradius = gridSize / 2;
      const result = calcHexEdgeMidpointSnapPosition(inradius - 0.5, 0, gridSize, GridType.HEX_HORIZONTAL);
      expect(result.x + gridSize / 2).toBeCloseTo(inradius);
      expect(result.y + gridSize / 2).toBeCloseTo(0);
    });

    it('an edge midpoint lands one inradius from the cell centre', () => {
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexEdgeMidpointSnapPosition(mx, my, gridSize, GridType.HEX_VERTICAL);
      const cx = result.x + gridSize / 2;
      const cy = result.y + gridSize / 2;
      expect(Math.sqrt(cx * cx + cy * cy)).toBeCloseTo(inradius);
    });
  });

  describe('calcHexAllSnapPosition', () => {
    const gridSize = 50;

    it('snaps to the cell centre when nearest to it', () => {
      const result = calcHexAllSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      const centerResult = calcHexSnapPosition(1, 1, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(centerResult.x);
      expect(result.y).toBeCloseTo(centerResult.y);
    });

    it('snaps to a vertex when nearest to one', () => {
      const s = gridSize / Math.sqrt(3);
      const result = calcHexAllSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      const vertexResult = calcHexVertexSnapPosition(s - 0.1, 0, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(vertexResult.x);
      expect(result.y).toBeCloseTo(vertexResult.y);
    });

    it('snaps to an edge midpoint when nearest to one', () => {
      // near the flat-top edge midpoint at 30 degrees
      const inradius = gridSize / 2;
      const mx = inradius * Math.cos(Math.PI / 6);
      const my = inradius * Math.sin(Math.PI / 6);
      const result = calcHexAllSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      const edgeResult = calcHexEdgeMidpointSnapPosition(mx - 0.5, my, gridSize, GridType.HEX_VERTICAL);
      expect(result.x).toBeCloseTo(edgeResult.x);
      expect(result.y).toBeCloseTo(edgeResult.y);
    });
  });

  describe('gridSnapPosition on squares', () => {
    const piece = { width: 50, height: 50, gridSize: 50, gridType: GridType.SQUARE };

    it('puts the corner on the grid for the middle of a cell', () => {
      expect(gridSnapPosition({ ...piece, x: 60, y: 140, snapStyle: GridSnapStyle.CENTER })).toEqual({ x: 50, y: 150 });
    });

    it('puts the middle on a grid intersection for a corner', () => {
      expect(gridSnapPosition({ ...piece, x: 60, y: 140, snapStyle: GridSnapStyle.VERTEX })).toEqual({ x: 75, y: 125 });
    });

    it('takes whichever of the two is nearer for both', () => {
      expect(gridSnapPosition({ ...piece, x: 55, y: 145, snapStyle: GridSnapStyle.BOTH })).toEqual({ x: 50, y: 150 });
      expect(gridSnapPosition({ ...piece, x: 70, y: 130, snapStyle: GridSnapStyle.BOTH })).toEqual({ x: 75, y: 125 });
    });

    it('takes the middle of an edge as well, for all', () => {
      expect(gridSnapPosition({ ...piece, x: 100, y: 125, snapStyle: GridSnapStyle.ALL })).toEqual({ x: 100, y: 125 });
    });

    it('snaps by the point it is given rather than the corner', () => {
      const origin = { x: 25, y: 25 };
      expect(gridSnapPosition({ ...piece, x: 60, y: 140, snapStyle: GridSnapStyle.CENTER, origin })).toEqual({
        x: 75,
        y: 125,
      });
    });
  });
});
