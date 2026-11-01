import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  DEFAULT_TABLE_CAMERA_VIEW,
  tableEyeMatrix,
  TableLayout,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { surfaceFrame } from '@axe/domain/tabletop/surface-space';
import {
  eyeAxesOf,
  pointOnFace,
  spriteCorners,
  TableWorldSprite,
  turnedOnFace,
} from '@axe/domain/tabletop/world/table-sprites';

const layout: TableLayout = { left: 0, top: 0, width: 1280, height: 800, boardWidth: 1000, boardHeight: 1000 };

const sprite: TableWorldSprite = {
  id: 'piece#picture',
  owner: 'piece',
  kind: 'dice-symbol',
  centre: { x: 100, y: 200, z: 30 },
  widthPx: 40,
  heightPx: 60,
  facing: 'eye',
  look: { kind: 'picture', url: 'blob:picture' },
  brightness: 1,
  twoSided: true,
};

/** A point carried through a matrix, all four of its numbers. */
function carried(m: Matrix3D, p: { x: number; y: number; z: number }) {
  return {
    x: p.x * m.m11 + p.y * m.m21 + p.z * m.m31 + m.m41,
    y: p.x * m.m12 + p.y * m.m22 + p.z * m.m32 + m.m42,
    z: p.x * m.m13 + p.y * m.m23 + p.z * m.m33 + m.m43,
    w: p.x * m.m14 + p.y * m.m24 + p.z * m.m34 + m.m44,
  };
}

describe('the sprites pieces are drawn with', () => {
  it('reads the eye’s right and up off the board as the camera turns it', () => {
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 0, rotateY: 0, rotateZ: 90 };

    const axes = eyeAxesOf(tableEyeMatrix(view, layout));

    // Turned a quarter clockwise, the board's south runs to the left of the page and its east down it.
    expect(axes.right.x).toBeCloseTo(0, 9);
    expect(axes.right.y).toBeCloseTo(-1, 9);
    expect(axes.up.x).toBeCloseTo(-1, 9);
    expect(axes.up.y).toBeCloseTo(0, 9);
  });

  it('stands a sprite turned to the eye square to the page, however the camera is turned', () => {
    for (const view of [
      DEFAULT_TABLE_CAMERA_VIEW,
      { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 70, rotateZ: -40 },
      { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 30, rotateY: 15, rotateZ: 135, orthographic: true },
    ]) {
      const eye = tableEyeMatrix(view, layout);
      const corners = spriteCorners(sprite, eyeAxesOf(eye)).map((corner) => carried(eye, corner));

      // All four corners stand as far off the eye, and run straight across and down the page.
      for (const corner of corners) expect(corner.z).toBeCloseTo(corners[0].z, 6);
      expect(corners[1].y).toBeCloseTo(corners[0].y, 6);
      expect(corners[3].x).toBeCloseTo(corners[0].x, 6);
      expect(corners[1].x).toBeGreaterThan(corners[0].x);
      expect(corners[3].y).toBeGreaterThan(corners[0].y);
    }
  });

  it('draws a sprite turned to the eye as big as it is, at the depth the page is drawn at', () => {
    const view = { ...DEFAULT_TABLE_CAMERA_VIEW, rotateX: 0, rotateY: 0, rotateZ: 0, positionZ: 0 };
    const scene = tableSceneMatrix(view, layout);
    const flat = { ...sprite, centre: { x: 100, y: 200, z: 0 } };

    const [topLeft, topRight, , bottomLeft] = spriteCorners(flat, eyeAxesOf(tableEyeMatrix(view, layout))).map(
      (corner) => scene.project({ ...corner, w: 1 })
    );

    expect(topRight.x - topLeft.x).toBeCloseTo(40, 6);
    expect(bottomLeft.y - topLeft.y).toBeCloseTo(60, 6);
  });

  it('lays a sprite along the directions it is given', () => {
    const corners = spriteCorners(
      { ...sprite, facing: { across: { x: 1, y: 0, z: 0 }, down: { x: 0, y: 0, z: -1 } } },
      eyeAxesOf(new Matrix3D())
    );

    expect(corners).toEqual([
      { x: 80, y: 200, z: 60 },
      { x: 120, y: 200, z: 60 },
      { x: 120, y: 200, z: 0 },
      { x: 80, y: 200, z: 0 },
    ]);
  });

  it('carries a point of a wall into the board’s space, and turns the wall’s directions clockwise as seen from the room', () => {
    const north = surfaceFrame('north-wall', { widthPx: 1000, depthPx: 800, wallHeightPx: 300 });

    expect(pointOnFace(north, 100, 50, 2)).toEqual({ x: 100, y: 2, z: 250 });
    const turned = turnedOnFace(north, 90);
    expect(turned.across.x).toBeCloseTo(0, 9);
    expect(turned.across.z).toBeCloseTo(-1, 9);
    expect(turned.down.x).toBeCloseTo(-1, 9);
    expect(turned.down.z).toBeCloseTo(0, 9);
  });
});
