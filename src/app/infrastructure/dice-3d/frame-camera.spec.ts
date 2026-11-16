import { frameCameraDistance, placeFrameCamera } from '@axe/infrastructure/dice-3d/frame-camera';
import { PerspectiveCamera, Vector3 } from 'three';

/** Whether every corner of the tray's floor and of a die's height above it projects into the camera's frame. */
function fits(camera: PerspectiveCamera, tray: { halfWidth: number; halfDepth: number }): boolean {
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const z of [0, 2]) {
        const p = new Vector3(sx * tray.halfWidth, sy * tray.halfDepth, z).project(camera);
        if (Math.abs(p.x) > 1 || Math.abs(p.y) > 1) return false;
      }
    }
  }
  return true;
}

describe('the frame camera', () => {
  it('stands back as far as the search has always found, for a tray of each shape', () => {
    expect(frameCameraDistance({ halfWidth: 4, halfDepth: 2 }, 2)).toBeCloseTo(17.195661117156305, 9);
    expect(frameCameraDistance({ halfWidth: 6, halfDepth: 6 }, 1)).toBeCloseTo(41.63872408689167, 9);
    expect(frameCameraDistance({ halfWidth: 3, halfDepth: 5 }, 0.6)).toBeCloseTo(35.015955578032845, 9);
    expect(frameCameraDistance({ halfWidth: 10, halfDepth: 4 }, 2.5)).toBeCloseTo(28.587096169056167, 9);
  });

  it('places the camera where it was always placed, and no nearer than the tray fits', () => {
    const camera = new PerspectiveCamera(30, 2, 0.5, 400);
    camera.up.set(0, 0, 1);
    const tray = { halfWidth: 4, halfDepth: 2 };

    placeFrameCamera(camera, tray, 2);

    expect(camera.position.toArray()).toEqual([
      0,
      expect.closeTo(-5.313751514713792, 9),
      expect.closeTo(16.354045557474702, 9),
    ]);
    expect(camera.near).toBeCloseTo(3.4391322234312613, 9);
    expect(camera.far).toBeCloseTo(51.586983351468916, 9);
    expect(fits(camera, tray)).toBe(true);

    camera.position.multiplyScalar(0.99);
    camera.updateMatrixWorld();
    expect(fits(camera, tray)).toBe(false);
  });

  it('gives the same distance again for the same tray and aspect', () => {
    const first = frameCameraDistance({ halfWidth: 5, halfDepth: 3 }, 1.5);
    expect(frameCameraDistance({ halfWidth: 5, halfDepth: 3 }, 1.5)).toBe(first);
    expect(frameCameraDistance({ halfWidth: 5, halfDepth: 3 }, 1.6)).not.toBe(first);
  });
});
