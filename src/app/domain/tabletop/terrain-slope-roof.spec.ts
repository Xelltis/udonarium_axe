import { SlopeGridKind, SlopeSide } from '@axe/domain/tabletop/terrain-slope';
import {
  buildSlopeRoof,
  slopeHeightAt,
  SlopePoint,
  slopeProfileAlong,
  SlopeRoof,
} from '@axe/domain/tabletop/terrain-slope-roof';

/** A block 100px across, drawn from its top left corner. */
function square(size = 100): SlopePoint[] {
  return [
    { x: 0, y: 0 },
    { x: size, y: 0 },
    { x: size, y: size },
    { x: 0, y: size },
  ];
}

function rectangle(width: number, depth: number): SlopePoint[] {
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

/** A hexagon with a flat top, 100px from the middle to a corner. */
function hexagon(radius = 100): SlopePoint[] {
  return Array.from({ length: 6 }, (_, corner) => {
    const angle = (corner * Math.PI) / 3;
    return { x: radius + radius * Math.cos(angle), y: radius + radius * Math.sin(angle) };
  });
}

function roofOf(outline: SlopePoint[], sides: SlopeSide[], heightPx = 50, kind: SlopeGridKind = 'square'): SlopeRoof {
  const roof = buildSlopeRoof(outline, sides, heightPx, kind);
  if (!roof) throw new Error('no roof');
  return roof;
}

describe('the slope of a block', () => {
  it('has none where the block slopes to no side, or has no height', () => {
    expect(buildSlopeRoof(square(), [], 50)).toBeNull();
    expect(buildSlopeRoof(square(), ['s'], 0)).toBeNull();
    expect(buildSlopeRoof([{ x: 0, y: 0 }], ['s'], 50)).toBeNull();
  });

  describe('sloping to one side', () => {
    it('runs from the ground at that side to the full height at the far side, as it always has', () => {
      const roof = roofOf(square(), ['s']);

      expect(roof.faces).toHaveLength(1);
      expect(slopeHeightAt(roof, 50, 100)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 50, 50)).toBeCloseTo(25);
      expect(slopeHeightAt(roof, 50, 0)).toBeCloseTo(50);
    });

    it('covers the whole top with the one piece', () => {
      const roof = roofOf(square(), ['w']);

      expect(roof.faces[0].polygon).toHaveLength(4);
      expect(slopeHeightAt(roof, 0, 50)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 100, 50)).toBeCloseTo(50);
    });

    it('reads the height of a point off the piece it stands on', () => {
      const roof = roofOf(square(), ['n']);
      const face = roof.faces[0];

      expect(face.plane.a * 50 + face.plane.b * 25 + face.plane.c).toBeCloseTo(slopeHeightAt(roof, 50, 25));
    });
  });

  describe('sloping to every side', () => {
    it('makes a pyramid of a square block, with its point over the middle', () => {
      const roof = roofOf(square(), ['n', 'e', 's', 'w']);

      expect(roof.faces).toHaveLength(4);
      expect(slopeHeightAt(roof, 50, 50)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 50, 0)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 0, 50)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 25, 50)).toBeCloseTo(25);
    });

    it('gives each piece of the pyramid a corner of the block and the middle', () => {
      const roof = roofOf(square(), ['n', 'e', 's', 'w']);

      for (const face of roof.faces) {
        expect(face.polygon).toHaveLength(3);
        expect(face.polygon.some((point) => Math.hypot(point.x - 50, point.y - 50) < 1e-6)).toBe(true);
      }
    });

    it('makes a hexagonal pyramid of a hex block', () => {
      const roof = roofOf(hexagon(), ['n', 'ne', 'se', 's', 'sw', 'nw'], 50, 'flatTop');

      expect(roof.faces).toHaveLength(6);
      expect(slopeHeightAt(roof, 100, 100)).toBeCloseTo(50);
      // The middle of an edge of the hexagon, which the slope reaches the ground at.
      expect(slopeHeightAt(roof, 100, 100 - 100 * Math.cos(Math.PI / 6))).toBeCloseTo(0);
    });

    it('lays a ridge along a block that is longer than it is wide', () => {
      const roof = roofOf(rectangle(200, 100), ['n', 'e', 's', 'w']);

      expect(slopeHeightAt(roof, 100, 50)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 60, 50)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 50, 50)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 25, 50)).toBeCloseTo(25);
    });
  });

  describe('sloping to some of the sides', () => {
    it('lays a ridge down the middle between two opposite sides', () => {
      const roof = roofOf(square(), ['n', 's']);

      expect(roof.faces).toHaveLength(2);
      expect(slopeHeightAt(roof, 50, 50)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 50, 25)).toBeCloseTo(25);
      expect(slopeHeightAt(roof, 50, 0)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 50, 100)).toBeCloseTo(0);
    });

    it('climbs to the far corner from two sides that meet', () => {
      const roof = roofOf(square(), ['n', 'w']);

      expect(roof.faces).toHaveLength(2);
      expect(slopeHeightAt(roof, 100, 100)).toBeCloseTo(50);
      expect(slopeHeightAt(roof, 0, 100)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 100, 0)).toBeCloseTo(0);
      expect(slopeHeightAt(roof, 40, 60)).toBeCloseTo(20);
    });
  });

  describe('the wall under a side the block does not slope to', () => {
    it('stands the height of the slope over it', () => {
      const roof = roofOf(square(), ['n']);

      const profile = slopeProfileAlong(roof, { x: 0, y: 100 }, { x: 100, y: 100 });

      expect(profile).toEqual([
        { at: 0, heightPx: expect.closeTo(50, 6) },
        { at: 1, heightPx: expect.closeTo(50, 6) },
      ]);
    });

    it('folds where the slope changes the side it runs down to', () => {
      const roof = roofOf(square(), ['w', 'e']);

      const profile = slopeProfileAlong(roof, { x: 0, y: 0 }, { x: 100, y: 0 });

      expect(profile).toEqual([
        { at: 0, heightPx: expect.closeTo(0, 6) },
        { at: expect.closeTo(0.5, 6), heightPx: expect.closeTo(50, 6) },
        { at: 1, heightPx: expect.closeTo(0, 6) },
      ]);
    });
  });
});
