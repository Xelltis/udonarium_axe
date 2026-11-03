import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { boardOffset, type TableCameraView, type TableLayout } from '@axe/domain/tabletop/camera/table-camera';

/** A point of the board, in table pixels: x to the east, y to the south and z up. */
export interface BoardPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * How the camera that follows a piece about stands off it: turned round it from behind, looking
 * down at it, and standing back from it.
 */
export interface ThirdPersonOrbit {
  /** How far the camera is turned round the piece from straight behind it, clockwise, in degrees. */
  readonly turnDeg: number;
  /** How far below level the camera looks at the piece, in degrees. */
  readonly downDeg: number;
  /** How far the camera stands back from what it looks at, in cells. */
  readonly boomCells: number;
}

/** Over the shoulder, looking a little down, a few cells back. */
export const DEFAULT_THIRD_PERSON_ORBIT: ThirdPersonOrbit = { turnDeg: 0, downDeg: 25, boomCells: 4 };

/** How far the camera may look up at the piece and down on it. */
export const MIN_THIRD_PERSON_DOWN_DEG = -10;
export const MAX_THIRD_PERSON_DOWN_DEG = 80;

/** How near the camera may come to the piece and how far it may stand back, in cells. */
export const MIN_THIRD_PERSON_BOOM_CELLS = 1.5;
export const MAX_THIRD_PERSON_BOOM_CELLS = 12;

/** How tall the camera that follows a piece sees, in degrees. */
export const THIRD_PERSON_FOV_DEG = 60;

/** An orbit turned round the piece and tipped up or down, held between how far it may look up and down. */
export function orbitTurned(orbit: ThirdPersonOrbit, turnDeg: number, downDeg: number): ThirdPersonOrbit {
  const down = Math.min(MAX_THIRD_PERSON_DOWN_DEG, Math.max(MIN_THIRD_PERSON_DOWN_DEG, orbit.downDeg + downDeg));
  return { ...orbit, turnDeg: (((orbit.turnDeg + turnDeg) % 360) + 360) % 360, downDeg: down };
}

/** An orbit brought nearer the piece, or taken further back, held between how near and far it may stand. */
export function orbitPushed(orbit: ThirdPersonOrbit, boomCells: number): ThirdPersonOrbit {
  const boom = Math.min(
    MAX_THIRD_PERSON_BOOM_CELLS,
    Math.max(MIN_THIRD_PERSON_BOOM_CELLS, orbit.boomCells + boomCells)
  );
  return { ...orbit, boomCells: boom };
}

/** The way the camera looks for a heading and a look down, as a direction on the board of length one. */
export function lookDirection(yawDeg: number, downDeg: number): BoardPoint {
  const yaw = (yawDeg * Math.PI) / 180;
  const down = (downDeg * Math.PI) / 180;
  return { x: Math.sin(yaw) * Math.cos(down), y: -Math.cos(yaw) * Math.cos(down), z: -Math.sin(down) };
}

/** Where the camera stands to look at a point the way given, `boomPx` back from it. */
export function eyeBackFrom(target: BoardPoint, yawDeg: number, downDeg: number, boomPx: number): BoardPoint {
  const way = lookDirection(yawDeg, downDeg);
  return { x: target.x - way.x * boomPx, y: target.y - way.y * boomPx, z: target.z - way.z * boomPx };
}

/** How far in front of the box the camera looks through its eye stands, for it to see as tall as `fovDeg`. */
export function perspectiveForFov(heightPx: number, fovDeg: number): number {
  return Math.max(1, heightPx) / 2 / Math.tan((Math.min(Math.max(fovDeg, 1), 179) * Math.PI) / 360);
}

/**
 * The table's camera with its eye standing at a point of the board, facing a heading (0 to the north,
 * clockwise) and looking down as far as given: turned as the table's camera turns, and slid so that
 * the point lands where the eye stands, `perspectivePx` in front of the middle of the box.
 */
export function thirdPersonCameraView(
  eye: BoardPoint,
  yawDeg: number,
  downDeg: number,
  layout: TableLayout,
  perspectivePx: number
): TableCameraView {
  const rotateZ = -yawDeg;
  const rotateX = 90 - downDeg;
  const turn = new Matrix3D();
  const z = (rotateZ * Math.PI) / 180;
  const x = (rotateX * Math.PI) / 180;
  turn.setData([Math.cos(z), Math.sin(z), 0, 0, -Math.sin(z), Math.cos(z), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  turn.append(
    new Matrix3D().setData([1, 0, 0, 0, 0, Math.cos(x), Math.sin(x), 0, 0, -Math.sin(x), Math.cos(x), 0, 0, 0, 0, 1])
  );
  const middle = { x: layout.boardWidth / 2, y: layout.boardHeight / 2 };
  const offset = boardOffset(layout);
  const from = { x: middle.x - eye.x, y: middle.y - eye.y, z: -eye.z };
  const turned = {
    x: from.x * turn.m11 + from.y * turn.m21 + from.z * turn.m31,
    y: from.x * turn.m12 + from.y * turn.m22 + from.z * turn.m32,
    z: from.x * turn.m13 + from.y * turn.m23 + from.z * turn.m33,
  };
  return {
    positionX: turned.x - (middle.x + offset.x - layout.width / 2),
    positionY: turned.y - (middle.y + offset.y - layout.height / 2),
    positionZ: turned.z + perspectivePx,
    rotateX,
    rotateY: 0,
    rotateZ,
    orthographic: false,
    perspectivePx,
  };
}
