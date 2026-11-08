import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import { tableEyeMatrix, type TableLayout } from '@axe/domain/tabletop/camera/table-camera';
import {
  DEFAULT_THIRD_PERSON_ORBIT,
  eyeBackFrom,
  MAX_THIRD_PERSON_BOOM_CELLS,
  MAX_THIRD_PERSON_DOWN_DEG,
  MIN_THIRD_PERSON_BOOM_CELLS,
  orbitPushed,
  orbitTurned,
  perspectiveForFov,
  thirdPersonCameraView,
} from '@axe/domain/tabletop/camera/third-person-camera';

/** Where a point of the board lands in the eye's space. */
function carried(eye: Matrix3D, x: number, y: number, z: number) {
  return {
    x: x * eye.m11 + y * eye.m21 + z * eye.m31 + eye.m41,
    y: x * eye.m12 + y * eye.m22 + z * eye.m32 + eye.m42,
    z: x * eye.m13 + y * eye.m23 + z * eye.m33 + eye.m43,
  };
}

describe('the camera that follows a piece', () => {
  const layout: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1500, boardHeight: 1000 };
  const target = { x: 600, y: 400, z: 45 };
  const perspective = perspectiveForFov(layout.height, 60);

  it('stands the eye where it is put and looks straight at what it follows, as the table’s camera draws it', () => {
    for (const [yaw, down] of [
      [0, 25],
      [90, 40],
      [215, -5],
    ]) {
      const eye = eyeBackFrom(target, yaw, down, 200);
      const matrix = tableEyeMatrix(thirdPersonCameraView(eye, yaw, down, layout, perspective), layout);
      const at = carried(matrix, eye.x, eye.y, eye.z);
      expect(at.x).toBeCloseTo(0, 1);
      expect(at.y).toBeCloseTo(0, 1);
      expect(at.z).toBeCloseTo(perspective, 1);
      const seen = carried(matrix, target.x, target.y, target.z);
      expect(seen.x).toBeCloseTo(0, 1);
      expect(seen.y).toBeCloseTo(0, 1);
      expect(seen.z).toBeCloseTo(perspective - 200, 1);
    }
  });

  it('keeps north up the view and east to the right for a camera behind a piece facing north', () => {
    const eye = eyeBackFrom(target, 0, 0, 200);
    const matrix = tableEyeMatrix(thirdPersonCameraView(eye, 0, 0, layout, perspective), layout);
    expect(carried(matrix, target.x + 50, target.y, target.z).x).toBeGreaterThan(0);
    expect(carried(matrix, target.x, target.y, target.z + 50).y).toBeLessThan(0);
  });

  it('stands back behind and above for a look down', () => {
    expect(eyeBackFrom(target, 0, 30, 200)).toEqual({
      x: expect.closeTo(600, 6),
      y: expect.closeTo(400 + 200 * Math.cos(Math.PI / 6), 6),
      z: expect.closeTo(45 + 100, 6),
    });
  });

  it('sees as tall as asked', () => {
    expect(perspectiveForFov(800, 90)).toBeCloseTo(400, 6);
  });

  it('turns round and tips, held short of looking straight down, and comes no nearer or further than it may', () => {
    expect(orbitTurned(DEFAULT_THIRD_PERSON_ORBIT, -30, 100)).toMatchObject({
      turnDeg: 330,
      downDeg: MAX_THIRD_PERSON_DOWN_DEG,
    });
    expect(orbitPushed(DEFAULT_THIRD_PERSON_ORBIT, -10).boomCells).toBe(MIN_THIRD_PERSON_BOOM_CELLS);
    expect(orbitPushed(DEFAULT_THIRD_PERSON_ORBIT, 100).boomCells).toBe(MAX_THIRD_PERSON_BOOM_CELLS);
  });
});
