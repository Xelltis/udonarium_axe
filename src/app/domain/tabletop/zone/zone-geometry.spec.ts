import { gatheredAbout, midpointOf, zoneCovers } from '@axe/domain/tabletop/zone/zone-geometry';

describe('zone-geometry', () => {
  it('counts the edge of a circle and of a square as inside', () => {
    expect(zoneCovers({ centre: { x: 0, y: 0 }, square: false, reach: 5 }, { x: 3, y: 4 })).toBe(true);
    expect(zoneCovers({ centre: { x: 0, y: 0 }, square: false, reach: 5 }, { x: 4, y: 4 })).toBe(false);
    expect(zoneCovers({ centre: { x: 0, y: 0 }, square: true, reach: 5 }, { x: 5, y: -5 })).toBe(true);
    expect(zoneCovers({ centre: { x: 0, y: 0 }, square: true, reach: 5 }, { x: 5.1, y: 0 })).toBe(false);
  });

  it('finds the point half way between two', () => {
    expect(midpointOf({ x: 0, y: 10 }, { x: 4, y: 20 })).toEqual({ x: 2, y: 15 });
  });

  it('stands one token on the centre and more round a ring, the first at the top', () => {
    expect(gatheredAbout({ x: 10, y: 10 }, 1, 5)).toEqual([{ x: 10, y: 10 }]);
    const four = gatheredAbout({ x: 10, y: 10 }, 4, 5);
    expect(four).toHaveLength(4);
    expect(four[0].x).toBeCloseTo(10);
    expect(four[0].y).toBeCloseTo(5);
    expect(four[1].x).toBeCloseTo(15);
    expect(gatheredAbout({ x: 0, y: 0 }, 0, 5)).toEqual([]);
  });
});
