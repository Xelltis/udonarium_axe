import { seePageFloor } from '@axe/infrastructure/table-3d/page-floor-camera';
import type { EffectOverlayView } from '@axe/infrastructure/table-3d/table-3d-port';
import { PerspectiveCamera, Vector3 } from 'three/webgpu';

const VIEW: EffectOverlayView = {
  width: 800,
  height: 500,
  perspectivePx: 1200,
  originX: 400,
  originY: 360,
  scale: 1.5,
  tiltDeg: 64,
};

/** Where a point of the floor (x east, y up, z south) is drawn on the canvas, from its top left, in pixels. */
function drawnAt(view: EffectOverlayView, x: number, y: number, z: number): number[] {
  const camera = new PerspectiveCamera();
  seePageFloor(camera, view);
  const seen = new Vector3(x, y, z).project(camera);
  return [((seen.x + 1) / 2) * view.width, ((1 - seen.y) / 2) * view.height].map(
    (value) => Math.round(value * 10) / 10
  );
}

/** Where the page draws a point of a floor tipped away about its origin and grown, through the box's perspective. */
function pageDraws(view: EffectOverlayView, x: number, y: number, z: number): number[] {
  const tilt = (view.tiltDeg * Math.PI) / 180;
  const across = x * view.scale;
  const down = (z * Math.cos(tilt) - y * Math.sin(tilt)) * view.scale;
  const towards = (z * Math.sin(tilt) + y * Math.cos(tilt)) * view.scale;
  const grown = view.perspectivePx / (view.perspectivePx - towards);
  const [fromX, fromY] = [view.originX - view.width / 2, view.originY - view.height / 2];
  return [view.width / 2 + (fromX + across) * grown, view.height / 2 + (fromY + down) * grown].map(
    (value) => Math.round(value * 10) / 10
  );
}

describe('seePageFloor', () => {
  it('draws the floor’s origin where the page has it', () => {
    expect(drawnAt(VIEW, 0, 0, 0)).toEqual([400, 360]);
  });

  it('draws points of the floor, and points standing over it, where the page draws them', () => {
    for (const [x, y, z] of [
      [100, 0, 0],
      [-160, 0, 40],
      [0, 0, -70],
      [80, 110, 20],
      [-200, 60, -30],
    ]) {
      const [drawnX, drawnY] = drawnAt(VIEW, x, y, z);
      const [pageX, pageY] = pageDraws(VIEW, x, y, z);
      expect(drawnX).toBeCloseTo(pageX, 0);
      expect(drawnY).toBeCloseTo(pageY, 0);
    }
  });

  it('follows a floor laid off the middle of a box of another shape, grown otherwise', () => {
    const narrow = { ...VIEW, width: 360, height: 640, originX: 180, originY: 460, scale: 0.7 };

    expect(drawnAt(narrow, 0, 0, 0)).toEqual([180, 460]);
    const [drawnX, drawnY] = drawnAt(narrow, 90, 110, 30);
    const [pageX, pageY] = pageDraws(narrow, 90, 110, 30);
    expect([Math.round(drawnX), Math.round(drawnY)]).toEqual([Math.round(pageX), Math.round(pageY)]);
  });
});
