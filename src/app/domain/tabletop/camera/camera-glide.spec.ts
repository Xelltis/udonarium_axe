import { glideToCentre } from '@axe/domain/tabletop/camera/camera-glide';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  type TableCameraView,
  type TableLayout,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { describe, expect, it } from 'vitest';

const LAYOUT: TableLayout = { left: 0, top: 0, width: 1280, height: 720, boardWidth: 2000, boardHeight: 1500 };

/** Where a point of the board lands on the page once the camera has been moved by a glide. */
function landing(view: TableCameraView, point: { x: number; y: number; z?: number }): { x: number; y: number } {
  const moved = glideToCentre(view, LAYOUT, point);
  const after = { ...view, positionX: view.positionX + moved.x, positionY: view.positionY + moved.y };
  const page = pageOfTablePoint(tableSceneMatrix(after, LAYOUT), point.x, point.y, point.z ?? 0);
  return { x: page.x, y: page.y };
}

describe('glideToCentre', () => {
  const middle = { x: LAYOUT.width / 2, y: LAYOUT.height / 2 };

  it('brings a point to the middle of a view looking straight down', () => {
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 0, rotateZ: 0, positionX: -300, positionY: 40 };

    const landed = landing(view, { x: 1500, y: 200 });

    expect(landed.x).toBeCloseTo(middle.x, 3);
    expect(landed.y).toBeCloseTo(middle.y, 3);
  });

  it('brings a point to the middle of a view turned, tilted and pushed back, without nearing it', () => {
    const view = {
      ...DEFAULT_TABLE_CAMERA_VIEW,
      rotateX: 50,
      rotateZ: 10,
      positionX: -465,
      positionY: -65,
      positionZ: -400,
    };

    for (const point of [
      { x: 300, y: 1200 },
      { x: 1800, y: 100 },
      { x: 1000, y: 750, z: 120 },
    ]) {
      const landed = landing(view, point);
      expect(landed.x).toBeCloseTo(middle.x, 3);
      expect(landed.y).toBeCloseTo(middle.y, 3);
    }
  });

  it('brings a point to the middle of a view drawn without perspective', () => {
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, orthographic: true, rotateX: 30, rotateZ: -20, positionZ: 600 };

    const landed = landing(view, { x: 400, y: 900 });

    expect(landed.x).toBeCloseTo(middle.x, 3);
    expect(landed.y).toBeCloseTo(middle.y, 3);
  });
});
