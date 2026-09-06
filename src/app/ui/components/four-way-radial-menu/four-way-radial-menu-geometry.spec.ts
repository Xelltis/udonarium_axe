import {
  angleOnRing,
  annularSectorLabelPoint,
  annularSectorLabelWidth,
  annularSectorPolygon,
  clampRadialCenter,
  nearestCardinalRotation,
  outwardRotationOnRing,
  pointOnRing,
  radialPage,
  radialPageCount,
  seatTextRotation,
} from '@axe/ui/components/four-way-radial-menu/four-way-radial-menu-geometry';

describe('four-way radial menu geometry', () => {
  it('faces labels toward each side of the table', () => {
    expect(seatTextRotation('north')).toBe(180);
    expect(seatTextRotation('east')).toBe(270);
    expect(seatTextRotation('south')).toBe(0);
    expect(seatTextRotation('west')).toBe(90);
  });

  it('places items evenly around the ring', () => {
    const points = Array.from({ length: 4 }, (_, index) => pointOnRing(index, 4, 100));
    expect(points[0]).toEqual({ x: expect.closeTo(0), y: expect.closeTo(-100) });
    expect(points[1]).toEqual({ x: expect.closeTo(100), y: expect.closeTo(0) });
    expect(points[2]).toEqual({ x: expect.closeTo(0), y: expect.closeTo(100) });
    expect(points[3]).toEqual({ x: expect.closeTo(-100), y: expect.closeTo(0) });
  });

  it('faces each item toward the outside of the ring', () => {
    const rotations = Array.from({ length: 4 }, (_, index) => outwardRotationOnRing(index, 4));
    expect(rotations).toEqual([180, 270, 0, 90]);
  });

  it('builds a clipped annular sector with a transparent center and item gap', () => {
    const polygon = annularSectorPolygon(0, 8, 100, 150, 3);

    expect(polygon).toMatch(/^polygon\(/);
    expect(polygon).not.toContain('NaN');
    expect(polygon.split(',')).toHaveLength(10);
  });

  it('places annular labels on the middle radius', () => {
    expect(annularSectorLabelPoint(0, 4, 125)).toEqual({ x: expect.closeTo(0), y: expect.closeTo(-125) });
    expect(annularSectorLabelPoint(1, 4, 125)).toEqual({ x: expect.closeTo(125), y: expect.closeTo(0) });
    expect(annularSectorLabelWidth(125, 8, 3)).toBeGreaterThan(80);
    expect(annularSectorLabelWidth(125, 1, 3)).toBe(150);
  });

  it('inherits the selected item angle as the next ring start angle', () => {
    const eastAngle = angleOnRing(1, 4);
    expect(eastAngle).toBe(0);
    expect(pointOnRing(0, 3, 100, eastAngle)).toEqual({ x: 100, y: 0 });
    expect(outwardRotationOnRing(0, 3, eastAngle)).toBe(270);
  });

  it('snaps a rotating item direction to the nearest panel orientation', () => {
    expect(nearestCardinalRotation(44)).toBe(0);
    expect(nearestCardinalRotation(46)).toBe(90);
    expect(nearestCardinalRotation(181)).toBe(180);
    expect(nearestCardinalRotation(271)).toBe(270);
    expect(nearestCardinalRotation(359)).toBe(0);
  });

  it('keeps the ring inside the viewport', () => {
    expect(clampRadialCenter({ x: 10, y: 590 }, { width: 800, height: 600 }, 180)).toEqual({
      x: 180,
      y: 420,
    });
    expect(clampRadialCenter({ x: 10, y: 10 }, { width: 300, height: 200 }, 180)).toEqual({
      x: 150,
      y: 100,
    });
  });

  it('splits long action lists into pages of eight', () => {
    const items = Array.from({ length: 18 }, (_, index) => index);
    expect(radialPageCount(items.length)).toBe(3);
    expect(radialPage(items, 0)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(radialPage(items, 2)).toEqual([16, 17]);
    expect(radialPage(items, 99)).toEqual([16, 17]);
  });
});
