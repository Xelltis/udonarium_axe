import {
  surfaceCrossing,
  surfaceFrame,
  surfaceInwardDirection,
  surfacePointTo3D,
  surfaceWorldBox,
} from '@axe/domain/tabletop/surface-space';

const dims = { widthPx: 1000, depthPx: 800, wallHeightPx: 300 };

describe('surface-space', () => {
  it('leaves a floor in its own coordinates, with the height above as its third axis', () => {
    expect(surfacePointTo3D('floor', 100, 200, dims, 50)).toEqual({ x: 100, y: 200, z: 50 });
  });

  it('maps a north wall onto the wall plane, measuring down from its top', () => {
    expect(surfacePointTo3D('north-wall', 120, 80, dims)).toEqual({ x: 120, y: 0, z: 300 - 80 });
  });

  it('mirrors a south wall across and puts it at the far edge', () => {
    expect(surfacePointTo3D('south-wall', 120, 80, dims)).toEqual({ x: 1000 - 120, y: 800, z: 300 - 80 });
  });

  it('puts a west wall on the near plane, as it is drawn', () => {
    expect(surfacePointTo3D('west-wall', 120, 80, dims)).toEqual({ x: 0, y: 800 - 120, z: 300 - 80 });
  });

  it('puts an east wall on the far plane, as it is drawn', () => {
    expect(surfacePointTo3D('east-wall', 120, 80, dims)).toEqual({ x: 1000, y: 120, z: 300 - 80 });
  });

  it('pushes the height above along the normal, into the room', () => {
    expect(surfacePointTo3D('north-wall', 0, 0, dims, 10)).toEqual({ x: 0, y: 10, z: 300 });
  });

  it('points the inward direction of a wall into the room', () => {
    expect(surfaceInwardDirection('north-wall')).toBeCloseTo(90);
    expect(surfaceInwardDirection('south-wall')).toBeCloseTo(-90);
    expect(surfaceInwardDirection('west-wall')).toBeCloseTo(0);
    expect(surfaceInwardDirection('east-wall')).toBeCloseTo(180);
  });

  describe('surfaceWorldBox', () => {
    it('builds the box of a floor from its own rectangle and its thickness along the normal', () => {
      // a footprint, with a base and a thickness along the normal
      expect(surfaceWorldBox('floor', 10, 20, 50, 50, 100, 50, dims)).toEqual({
        minX: 10,
        maxX: 60,
        minY: 20,
        maxY: 70,
        minZ: 100,
        maxZ: 150,
      });
    });

    it('a north-wall beam juts into the room by its thickness, its top measured down from the wall', () => {
      // a rectangle on the wall, jutting into the room from the wall itself
      expect(surfaceWorldBox('north-wall', 100, 0, 100, 50, 0, 200, dims)).toEqual({
        minX: 100,
        maxX: 200,
        minY: 0,
        maxY: 200,
        minZ: 300 - 50,
        maxZ: 300,
      });
    });

    it('an east-wall beam juts inwards from the far plane', () => {
      // the east wall as it is drawn, with its normal pointing in
      // a rectangle on the wall, with a base and a thickness
      expect(surfaceWorldBox('east-wall', 0, 0, 100, 50, 0, 150, dims)).toEqual({
        minX: 1000 - 150,
        maxX: 1000,
        minY: 0,
        maxY: 100,
        minZ: 300 - 50,
        maxZ: 300,
      });
    });
  });
});

describe('surfaceCrossing', () => {
  const dims = { widthPx: 1000, depthPx: 750, wallHeightPx: 500 };

  it('gives the point of the floor a line looking straight down meets', () => {
    const crossing = surfaceCrossing(surfaceFrame('floor', dims), { x: 30, y: 40, z: 900 }, { x: 0, y: 0, z: -1 })!;
    expect(crossing.t).toBeCloseTo(900, 9);
    expect([crossing.localX, crossing.localY]).toEqual([30, 40]);
  });

  it('gives a point of the north wall across from its left end and down from its top', () => {
    const crossing = surfaceCrossing(
      surfaceFrame('north-wall', dims),
      { x: 200, y: 600, z: 120 },
      { x: 0, y: -1, z: 0 }
    )!;
    expect(crossing.localX).toBeCloseTo(200, 9);
    expect(crossing.localY).toBeCloseTo(380, 9);
  });

  it('has nothing to say of a line running along the face', () => {
    expect(surfaceCrossing(surfaceFrame('floor', dims), { x: 0, y: 0, z: 10 }, { x: 1, y: 0, z: 0 })).toBeNull();
  });
});
