import { terrainWallFace, type WallSide } from '@axe/domain/tabletop/terrain-wall-face';

const SIDES: WallSide[] = ['north', 'south', 'west', 'east'];

function footprintOf(rotateDeg: number, widthPx = 100, depthPx = 100) {
  return { x: 550, y: 300, widthPx, depthPx, heightPx: 100, rotateDeg };
}

describe('terrainWallFace()', () => {
  it('returns axis-aligned faces for terrain that has not been turned', () => {
    expect(terrainWallFace('north', footprintOf(0))).toEqual({
      ax: 550,
      ay: 300,
      bx: 650,
      by: 300,
      nx: 0,
      ny: -1,
      heightPx: 100,
    });
    expect(terrainWallFace('east', footprintOf(0))).toEqual({
      ax: 650,
      ay: 300,
      bx: 650,
      by: 400,
      nx: 1,
      ny: 0,
      heightPx: 100,
    });
  });

  it('returns faces for terrain that has', () => {
    // Without a face no light or shadow reaches the wall, which stays black even inside a light.
    for (const side of SIDES) {
      for (const rotate of [15, 45, 90, 180, 270]) {
        const face = terrainWallFace(side, footprintOf(rotate));
        expect(Number.isFinite(face.ax) && Number.isFinite(face.ay)).toBe(true);
        expect(Math.hypot(face.bx - face.ax, face.by - face.ay)).toBeCloseTo(100);
        expect(Math.hypot(face.nx, face.ny)).toBeCloseTo(1);
      }
    }
  });

  it('keeps the normal square to the face and pointing out', () => {
    for (const side of SIDES) {
      for (const rotate of [0, 30, 90, 210]) {
        const face = terrainWallFace(side, footprintOf(rotate));
        const alongX = face.bx - face.ax;
        const alongY = face.by - face.ay;

        expect(alongX * face.nx + alongY * face.ny).toBeCloseTo(0);

        // The normal points the same way as the line from the centre to the face.
        const midX = (face.ax + face.bx) / 2 - 600;
        const midY = (face.ay + face.by) / 2 - 350;
        expect(midX * face.nx + midY * face.ny).toBeGreaterThan(0);
      }
    }
  });

  it('turns the north face onto what was the east one at a right angle', () => {
    const north = terrainWallFace('north', footprintOf(90));
    const east = terrainWallFace('east', footprintOf(0));

    // A square covers the same ground however it is turned; only which face is which changes.
    expect(north.ax).toBeCloseTo(east.ax);
    expect(north.ay).toBeCloseTo(east.ay);
    expect(north.bx).toBeCloseTo(east.bx);
    expect(north.by).toBeCloseTo(east.by);
    expect(north.nx).toBeCloseTo(east.nx);
    expect(north.ny).toBeCloseTo(east.ny);
  });

  it('swaps the side lengths of a rectangle as it turns', () => {
    const north = terrainWallFace('north', footprintOf(0, 200, 100));
    const west = terrainWallFace('west', footprintOf(0, 200, 100));

    expect(Math.hypot(north.bx - north.ax, north.by - north.ay)).toBeCloseTo(200);
    expect(Math.hypot(west.bx - west.ax, west.by - west.ay)).toBeCloseTo(100);
  });
});
