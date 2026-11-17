import { SolidCaster, solidRangePlace, SolidRangePlaceInput } from '@axe/domain/tabletop/solid/solid-range-place';

const caster: SolidCaster = { x: 100, y: 100, footZ: 0, groundZ: 0, bodyPx: 50 };

function place(more: Partial<SolidRangePlaceInput>) {
  return solidRangePlace({
    kind: 'sphere',
    x: 100,
    y: 100,
    groundZ: 0,
    altitudePx: 0,
    caster,
    reachPx: 300,
    lengthPx: 200,
    ...more,
  });
}

describe('solidRangePlace', () => {
  it('stands a range following nobody over the face under it, lifted by its altitude, with no room round it', () => {
    expect(place({ caster: null, groundZ: 40, altitudePx: 25, x: 7, y: 9 })).toEqual({
      origin: { x: 7, y: 9, z: 65 },
      reach: null,
    });
  });

  it('stands a sphere where it was put round the piece, at its altitude over the feet', () => {
    const placed = place({ x: 200, y: 100, altitudePx: 50 });
    expect(placed.origin).toEqual({ x: 200, y: 100, z: 50 });
    expect(placed.reach).toEqual({ centre: { x: 100, y: 100, z: 0 }, radius: 300, floorZ: 0 });
  });

  it('brings a sphere or a column put too far round the piece back within the dome', () => {
    const placed = place({ kind: 'column', x: 600, y: 100, altitudePx: 0 });
    expect(placed.origin.x).toBeCloseTo(400);
    expect(placed.origin.z).toBeCloseTo(0);
  });

  it('measures the dome from the feet of a piece up in the air, down to what it stands on', () => {
    const aloft = { ...caster, footZ: 150, groundZ: 0 };
    const placed = place({ caster: aloft, x: 100, y: 100, altitudePx: -100 });
    expect(placed.origin).toEqual({ x: 100, y: 100, z: 50 });
    expect(placed.reach?.floorZ).toBe(0);
  });

  it('starts a cone or a beam from the middle of the piece, lifted by its altitude, pointing within its length', () => {
    for (const kind of ['cone', 'beam'] as const) {
      const placed = place({ kind, x: 900, y: 900, altitudePx: 10 });
      expect(placed.origin).toEqual({ x: 100, y: 100, z: 35 });
      expect(placed.reach).toEqual({ centre: { x: 100, y: 100, z: 35 }, radius: 200, floorZ: 0 });
    }
  });
});
