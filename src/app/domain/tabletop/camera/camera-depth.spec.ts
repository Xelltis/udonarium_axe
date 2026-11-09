import { cameraDepthOver } from '@axe/domain/tabletop/camera/camera-depth';

const LEAST = { near: 100, far: 50000 };
const MOST_NEAR = 10000;

describe('how near and how far the table’s camera draws', () => {
  it('draws as it always has over a board of the usual size', () => {
    const board = { x: 0, y: 0, width: 1600, height: 1000 };

    expect(cameraDepthOver({ x: 800, y: 1500, z: 2500 }, board, 2000, LEAST, MOST_NEAR)).toEqual(LEAST);
  });

  it('draws past the furthest corner of a board taken in whole from far back, from half the way to it', () => {
    const board = { x: 0, y: 0, width: 25600, height: 25600 };
    const eye = { x: 12800, y: 40000, z: 120000 };

    const depth = cameraDepthOver(eye, board, 2000, LEAST, MOST_NEAR);

    const furthest = Math.hypot(12800, 40000, 120000);
    expect(depth.far).toBeGreaterThan(furthest);
    expect(depth.near).toBe(MOST_NEAR);
  });

  it('draws from half the way to a board it stands a little further off than the most, short of that most', () => {
    const board = { x: 0, y: 0, width: 1600, height: 1000 };

    expect(cameraDepthOver({ x: 800, y: 500, z: 14000 }, board, 2000, LEAST, MOST_NEAR).near).toBe(6000);
    expect(cameraDepthOver({ x: 800, y: 500, z: 12000 }, board, 2000, LEAST, MOST_NEAR).near).toBe(LEAST.near);
  });

  it('keeps the near distance a camera is given, as the eye of a piece is', () => {
    const board = { x: 0, y: 0, width: 25600, height: 25600 };

    expect(cameraDepthOver({ x: 0, y: 0, z: 120000 }, board, 2000, { near: 5, far: 50000 }, 5).near).toBe(5);
  });
});
