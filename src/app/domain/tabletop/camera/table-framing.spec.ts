import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  pageOfTablePoint,
  type TableCameraView,
  type TableLayout,
  type TablePoint,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { type FrameInset, framingView } from '@axe/domain/tabletop/camera/table-framing';

const LAYOUT: TableLayout = { left: 0, top: 40, width: 1280, height: 680, boardWidth: 1600, boardHeight: 1000 };
const INSET: FrameInset = { top: 24, right: 24, bottom: 24, left: 24 };
const DEPTHS = { furthest: -6000, nearest: 0 };

/** The corners of a board 1600 by 1000 and of a sign 500 high standing along its north edge. */
const BOARD_AND_SIGN: TablePoint[] = [
  { x: 0, y: 0, z: 0 },
  { x: 1600, y: 0, z: 0 },
  { x: 0, y: 1000, z: 0 },
  { x: 1600, y: 1000, z: 0 },
  { x: 0, y: 0, z: 500 },
  { x: 1600, y: 0, z: 500 },
];

function drawnBox(view: TableCameraView, points: readonly TablePoint[]) {
  const scene = tableSceneMatrix(view, LAYOUT, new Matrix3D());
  const drawn = points.map((point) => pageOfTablePoint(scene, point.x, point.y, point.z));
  return {
    left: Math.min(...drawn.map((at) => at.x)),
    right: Math.max(...drawn.map((at) => at.x)),
    top: Math.min(...drawn.map((at) => at.y)),
    bottom: Math.max(...drawn.map((at) => at.y)),
  };
}

function inside(view: TableCameraView, points: readonly TablePoint[]): boolean {
  const box = drawnBox(view, points);
  return (
    box.left >= LAYOUT.left + INSET.left - 0.5 &&
    box.right <= LAYOUT.left + LAYOUT.width - INSET.right + 0.5 &&
    box.top >= LAYOUT.top + INSET.top - 0.5 &&
    box.bottom <= LAYOUT.top + LAYOUT.height - INSET.bottom + 0.5
  );
}

describe('framing points of the board in the camera', () => {
  it('draws every point inside the box, kept in from its edges, where the view it starts from cuts them off', () => {
    expect(inside(DEFAULT_TABLE_CAMERA_VIEW, BOARD_AND_SIGN)).toBe(false);

    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, BOARD_AND_SIGN, INSET, DEPTHS);

    expect(inside(framed, BOARD_AND_SIGN)).toBe(true);
  });

  it('stands no further back than it has to', () => {
    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, BOARD_AND_SIGN, INSET, DEPTHS);

    expect(inside({ ...framed, positionZ: framed.positionZ + 30 }, BOARD_AND_SIGN)).toBe(false);
  });

  it('puts what it frames in the middle of the room left inside the edges', () => {
    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, BOARD_AND_SIGN, INSET, DEPTHS);
    const box = drawnBox(framed, BOARD_AND_SIGN);

    expect((box.left + box.right) / 2).toBeCloseTo(LAYOUT.left + LAYOUT.width / 2, 0);
    expect((box.top + box.bottom) / 2).toBeCloseTo(LAYOUT.top + LAYOUT.height / 2, 0);
  });

  it('keeps facing the way the view faced', () => {
    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, BOARD_AND_SIGN, INSET, DEPTHS);

    expect([framed.rotateX, framed.rotateY, framed.rotateZ, framed.orthographic]).toEqual([
      DEFAULT_TABLE_CAMERA_VIEW.rotateX,
      DEFAULT_TABLE_CAMERA_VIEW.rotateY,
      DEFAULT_TABLE_CAMERA_VIEW.rotateZ,
      DEFAULT_TABLE_CAMERA_VIEW.orthographic,
    ]);
  });

  it('comes no nearer than the nearest depth allowed, where the points fit with room to spare', () => {
    const small: TablePoint[] = [
      { x: 700, y: 400, z: 0 },
      { x: 900, y: 600, z: 0 },
    ];

    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, small, INSET, DEPTHS);

    expect(framed.positionZ).toBe(DEPTHS.nearest);
    expect(inside(framed, small)).toBe(true);
  });

  it('stops at the furthest depth allowed, where even that cannot take everything in', () => {
    const framed = framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, BOARD_AND_SIGN, INSET, {
      furthest: -500,
      nearest: 0,
    });

    expect(framed.positionZ).toBe(-500);
  });

  it('frames a view drawn without perspective as well', () => {
    const flat = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 0, rotateZ: 0, orthographic: true };

    const framed = framingView(flat, LAYOUT, BOARD_AND_SIGN, INSET, DEPTHS);

    expect(inside(framed, BOARD_AND_SIGN)).toBe(true);
    expect(inside({ ...framed, positionZ: framed.positionZ + 30 }, BOARD_AND_SIGN)).toBe(false);
  });

  it('leaves the view as it is with nothing to frame', () => {
    expect(framingView(DEFAULT_TABLE_CAMERA_VIEW, LAYOUT, [], INSET, DEPTHS)).toBe(DEFAULT_TABLE_CAMERA_VIEW);
  });

  it('leaves the view as it is in a box with no room inside its edges, as one not laid out yet', () => {
    const unmeasured = { ...LAYOUT, width: 0, height: 0 };

    expect(framingView(DEFAULT_TABLE_CAMERA_VIEW, unmeasured, BOARD_AND_SIGN, INSET, DEPTHS)).toBe(
      DEFAULT_TABLE_CAMERA_VIEW
    );
  });
});
