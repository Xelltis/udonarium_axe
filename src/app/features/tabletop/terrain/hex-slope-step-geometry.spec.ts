import { calcHexFlowerParams } from '@axe/domain/tabletop/hex-pedestal-geometry';
import { SlopeDirection } from '@axe/domain/tabletop/terrain';
import { computeHexSlopeSteps } from '@axe/features/tabletop/terrain/hex-slope-step-geometry';

describe('computeHexSlopeSteps', () => {
  const gridSize = 50;

  describe('comes back empty for input it cannot use', () => {
    const bbox = { minX: -50, minY: -50, maxX: 50, maxY: 50 };

    it('comes back empty for no slope', () => {
      const result = computeHexSlopeSteps(2, gridSize, true, SlopeDirection.NONE, 2, true, 100, 100, bbox);
      expect(result).toEqual({ floors: [], walls: [] });
    });

    it('comes back empty below a size of two', () => {
      const result = computeHexSlopeSteps(1, gridSize, true, SlopeDirection.BOTTOM, 2, true, 100, 100, bbox);
      expect(result).toEqual({ floors: [], walls: [] });
    });

    it('comes back empty for a fractional size', () => {
      const result = computeHexSlopeSteps(2.5, gridSize, true, SlopeDirection.BOTTOM, 2, true, 100, 100, bbox);
      expect(result).toEqual({ floors: [], walls: [] });
    });
  });

  describe('a seven-cell flat-topped rosette', () => {
    const size = 2;
    const isFlatTop = true;
    const containerW = size * gridSize;
    const containerH = size * gridSize;
    const params = calcHexFlowerParams(size, gridSize, isFlatTop);
    const { bbox } = params;

    it('steps the floor down in every direction', () => {
      for (const dir of [SlopeDirection.TOP, SlopeDirection.BOTTOM, SlopeDirection.LEFT, SlopeDirection.RIGHT]) {
        const result = computeHexSlopeSteps(size, gridSize, isFlatTop, dir, 2, true, containerW, containerH, bbox);
        expect(result.floors.length).toBeGreaterThan(1);
      }
    });

    it('raises walls in every direction', () => {
      for (const dir of [SlopeDirection.TOP, SlopeDirection.BOTTOM, SlopeDirection.LEFT, SlopeDirection.RIGHT]) {
        const result = computeHexSlopeSteps(size, gridSize, isFlatTop, dir, 2, true, containerW, containerH, bbox);
        expect(result.walls.length).toBeGreaterThan(0);
      }
    });

    it('steps the floor down from the top', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        3,
        true,
        containerW,
        containerH,
        bbox
      );
      for (let i = 1; i < result.floors.length; i++) {
        expect(result.floors[i].heightPx).toBeLessThan(result.floors[i - 1].heightPx);
      }
    });

    it('gives each step a usable mask', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      for (const floor of result.floors) {
        expect(floor.mask).toContain('data:image/svg+xml');
        const svgPart = floor.mask.match(/charset=utf-8,(.+?)\)/);
        expect(svgPart).not.toBeNull();
        const decoded = decodeURIComponent(svgPart![1]);
        expect(decoded).toContain('<polygon');
        expect(decoded).toContain('<svg');
      }
    });

    it('gives every wall a height', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.TOP,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      for (const wall of result.walls) {
        expect(wall.wallHeightPx).toBeGreaterThan(0);
      }
    });

    it('keeps every wall base at or above zero', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.LEFT,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      for (const wall of result.walls) {
        expect(wall.basePx).toBeGreaterThanOrEqual(0);
      }
    });

    it('leaves every wall at full brightness with shading off', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        false,
        containerW,
        containerH,
        bbox
      );
      for (const wall of result.walls) {
        expect(wall.brightness).toBe(1.0);
      }
    });

    it('shades the walls between a third and full brightness with it on', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      for (const wall of result.walls) {
        expect(wall.brightness).toBeGreaterThanOrEqual(0.3);
        expect(wall.brightness).toBeLessThanOrEqual(1.0);
      }
    });
  });

  describe('a pointy-topped rosette', () => {
    const size = 2;
    const isFlatTop = false;
    const containerW = size * gridSize;
    const containerH = size * gridSize;
    const params = calcHexFlowerParams(size, gridSize, isFlatTop);
    const { bbox } = params;

    it('steps the floor down', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      expect(result.floors.length).toBeGreaterThan(1);
    });

    it('raises walls', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.RIGHT,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      expect(result.walls.length).toBeGreaterThan(0);
    });
  });

  describe('a nineteen-cell flat-topped rosette', () => {
    const size = 3;
    const isFlatTop = true;
    const containerW = size * gridSize;
    const containerH = size * gridSize;
    const params = calcHexFlowerParams(size, gridSize, isFlatTop);
    const { bbox } = params;

    it('takes more steps than the smaller rosette', () => {
      const r2 = computeHexSlopeSteps(
        2,
        gridSize,
        true,
        SlopeDirection.BOTTOM,
        2,
        true,
        2 * gridSize,
        2 * gridSize,
        calcHexFlowerParams(2, gridSize, true).bbox
      );
      const r3 = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      expect(r3.floors.length).toBeGreaterThan(r2.floors.length);
    });

    it('gives every mask a polygon', () => {
      const result = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.TOP,
        3,
        true,
        containerW,
        containerH,
        bbox
      );
      for (const floor of result.floors) {
        const svgPart = floor.mask.match(/charset=utf-8,(.+?)\)/);
        const decoded = decodeURIComponent(svgPart![1]);
        expect(decoded).toContain('<polygon');
      }
    });
  });

  describe('symmetry', () => {
    const size = 2;
    const isFlatTop = true;
    const containerW = size * gridSize;
    const containerH = size * gridSize;
    const params = calcHexFlowerParams(size, gridSize, isFlatTop);
    const { bbox } = params;

    it('makes as many steps and walls uphill as down', () => {
      const top = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.TOP,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      const bottom = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.BOTTOM,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      expect(top.floors.length).toBe(bottom.floors.length);
      expect(top.walls.length).toBe(bottom.walls.length);
    });

    it('makes as many to the left as to the right', () => {
      const left = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.LEFT,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      const right = computeHexSlopeSteps(
        size,
        gridSize,
        isFlatTop,
        SlopeDirection.RIGHT,
        2,
        true,
        containerW,
        containerH,
        bbox
      );
      expect(left.floors.length).toBe(right.floors.length);
      expect(left.walls.length).toBe(right.walls.length);
    });
  });
});
