import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  boardOffset,
  DEFAULT_TABLE_CAMERA_VIEW,
  drawnScaleAt,
  matrixColumns,
  pageOfTablePoint,
  tableCameraAttribute,
  tableCameraTransform,
  tableEyeMatrix,
  TableLayout,
  tablePointOfPage,
  tableRayOfPage,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { MEASURED_CAMERA_CASES } from '@axe/domain/tabletop/camera/table-camera.fixture';
import { TABLE_PERSPECTIVE_PX, viewPositionZToZoom } from '@axe/domain/tabletop/physical-scale';

const screen: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 750 };

describe('table camera', () => {
  it('puts points of the board where a browser drew them, for every view and board measured', () => {
    let worst = 0;
    for (const measured of MEASURED_CAMERA_CASES) {
      const scene = tableSceneMatrix(measured.view, measured.layout);
      measured.points.forEach(([x, y, z], i) => {
        const shown = pageOfTablePoint(scene, x, y, z);
        const [pageX, pageY] = measured.page[i];
        worst = Math.max(worst, Math.hypot(shown.x - pageX, shown.y - pageY));
      });
    }
    expect(MEASURED_CAMERA_CASES.length).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.02);
  });

  it('writes the transform the board has always been drawn with', () => {
    expect(tableCameraTransform(DEFAULT_TABLE_CAMERA_VIEW)).toBe(
      'translateZ(0.0000px) translateY(0.0000px) translateX(100.0000px) rotateY(0.0000deg) rotateX(50.0000deg) rotateZ(10.0000deg)'
    );
    expect(tableCameraTransform({ ...DEFAULT_TABLE_CAMERA_VIEW, positionZ: -3000, orthographic: true })).toBe(
      'scale(0.500000) translateZ(-3000.0000px) translateY(0.0000px) translateX(100.0000px) rotateY(0.0000deg) rotateX(50.0000deg) rotateZ(10.0000deg)'
    );
  });

  it('writes the view for tests to read, as position, turn and projection', () => {
    expect(tableCameraAttribute({ ...DEFAULT_TABLE_CAMERA_VIEW, positionX: 140 })).toBe(
      '140.0000,0.0000,0.0000,50.0000,0.0000,10.0000,0'
    );
    expect(tableCameraAttribute({ ...DEFAULT_TABLE_CAMERA_VIEW, orthographic: true })).toContain(',1');
  });

  it('centres the board, but starts one wider than the screen at the left edge', () => {
    expect(boardOffset(screen)).toEqual({ x: 140, y: 25 });
    expect(boardOffset({ ...screen, boardWidth: 3000 })).toEqual({ x: 0, y: 25 });
    expect(boardOffset({ ...screen, boardHeight: 2400 })).toEqual({ x: 140, y: -800 });
  });

  it('draws a square at the zoom the real size is worked out from, looking straight down', () => {
    const flat = { ...DEFAULT_TABLE_CAMERA_VIEW, positionX: 0, rotateX: 0, rotateZ: 0 };
    for (const positionZ of [-2000, 0, 1200]) {
      for (const orthographic of [false, true]) {
        const scene = tableSceneMatrix({ ...flat, positionZ, orthographic }, screen);
        const left = pageOfTablePoint(scene, 475, 350, 0);
        const right = pageOfTablePoint(scene, 525, 350, 0);
        // The orthographic scale is written to six places, which is as near as the drawn board comes.
        expect(right.x - left.x).toBeCloseTo(50 * viewPositionZToZoom(positionZ), 3);
      }
    }
  });

  it('draws a thing smaller the further off it stands, by the scale it works out', () => {
    // Tilted only, the board's x axis runs along the page's at every point, so a short piece of it is
    // drawn as long as the scale says, times one length for the whole view.
    const tilted = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateZ: 0, positionZ: -300 };
    const scene = tableSceneMatrix(tilted, screen);
    const drawnLength = (x: number, y: number) =>
      pageOfTablePoint(scene, x + 1, y, 0).x - pageOfTablePoint(scene, x, y, 0).x;
    const near = drawnScaleAt(scene, 500, 700, 0);
    const far = drawnScaleAt(scene, 500, 50, 0);

    expect(far).toBeLessThan(near);
    expect(drawnLength(500, 50) / far).toBeCloseTo(drawnLength(500, 700) / near, 6);

    const flat = tableSceneMatrix({ ...tilted, orthographic: true }, screen);
    expect(drawnScaleAt(flat, 500, 700, 0)).toBeCloseTo(drawnScaleAt(flat, 500, 50, 120), 9);
  });

  it('puts a point of the board where the eye sees it, which the perspective then carries onto the page', () => {
    const layout = { ...screen, left: 12, top: 40 };
    for (const orthographic of [false, true]) {
      const view = { ...DEFAULT_TABLE_CAMERA_VIEW, positionZ: -400, rotateZ: 37, orthographic };
      const eye = tableEyeMatrix(view, layout);
      const scene = tableSceneMatrix(view, layout);
      for (const [x, y, z] of [
        [100, 100, 0],
        [500, 375, 80],
        [930, 640, 0],
      ]) {
        const seen = eye.project({ x, y, z, w: 1 });
        const depth =
          (eye.m13 * x + eye.m23 * y + eye.m33 * z + eye.m43) / (eye.m14 * x + eye.m24 * y + eye.m34 * z + eye.m44);
        const shrink = orthographic ? 1 : TABLE_PERSPECTIVE_PX / (TABLE_PERSPECTIVE_PX - depth);
        const page = pageOfTablePoint(scene, x, y, z);
        expect(layout.left + layout.width / 2 + seen.x * shrink).toBeCloseTo(page.x, 6);
        expect(layout.top + layout.height / 2 + seen.y * shrink).toBeCloseTo(page.y, 6);
      }
    }
  });

  it('gives a matrix a column at a time', () => {
    const columns = matrixColumns(new Matrix3D().appendPosition(10, 20, 30));
    expect(columns.slice(12, 15)).toEqual([10, 20, 30]);
    expect(columns).toHaveLength(16);
  });

  it('runs the line of sight through a page point from the eye into the board', () => {
    for (const orthographic of [false, true]) {
      const view = { ...DEFAULT_TABLE_CAMERA_VIEW, positionZ: -600, rotateZ: 37, orthographic };
      const scene = tableSceneMatrix(view, screen);
      const inverse = new Matrix3D();
      scene.invert(inverse);
      const raised = pageOfTablePoint(scene, 420, 260, 120);

      const ray = tableRayOfPage(inverse, raised.x, raised.y);

      // The raised point lies on the line, and the floor under it is further from the eye.
      const along = (raised.z - ray.origin.z) / ray.direction.z;
      expect(ray.origin.x + ray.direction.x * along).toBeCloseTo(420, 4);
      expect(ray.origin.y + ray.direction.y * along).toBeCloseTo(260, 4);
      const toFloor = -ray.origin.z / ray.direction.z;
      expect(toFloor).toBeGreaterThan(along);
      expect(Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z)).toBeCloseTo(1, 9);
    }
  });

  it('brings a point of the page back to the place on the board it was drawn from', () => {
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, positionZ: -600, rotateZ: 37 };
    const scene = tableSceneMatrix(view, { ...screen, left: 12, top: 40 });
    const inverse = new Matrix3D();
    scene.invert(inverse);
    for (const [x, y] of [
      [100, 100],
      [500, 375],
      [930, 640],
    ]) {
      const shown = pageOfTablePoint(scene, x, y, 0);
      const back = tablePointOfPage(inverse, shown.x, shown.y);
      expect(back.x).toBeCloseTo(x, 6);
      expect(back.y).toBeCloseTo(y, 6);
    }
  });
});
