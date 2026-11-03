import type { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  CEILING_COLOUR,
  firstPersonCeilings,
  firstPersonEyeMatrix,
} from '@axe/domain/tabletop/first-person/first-person-eye';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';

/** Where a point of the board lands in the eye's space, z and all. */
function carried(eye: Matrix3D, x: number, y: number, z: number) {
  return {
    x: x * eye.m11 + y * eye.m21 + z * eye.m31 + eye.m41,
    y: x * eye.m12 + y * eye.m22 + z * eye.m32 + eye.m42,
    z: x * eye.m13 + y * eye.m23 + z * eye.m33 + eye.m43,
  };
}

/** Where a point of the board is seen on the view, from its middle, for an eye `focal` out along z. */
function seen(eye: Matrix3D, focal: number, x: number, y: number, z: number) {
  const point = carried(eye, x, y, z);
  const ahead = focal - point.z;
  return { x: (point.x * focal) / ahead, y: (point.y * focal) / ahead, ahead };
}

describe('firstPersonEyeMatrix', () => {
  const focal = 640;
  const eye = { x: 200, y: 300, z: 40, yaw: 0 };

  it('stands the eye where the camera stands, out along z', () => {
    const at = carried(firstPersonEyeMatrix(eye, focal), 200, 300, 40);
    expect(at.x).toBeCloseTo(0);
    expect(at.y).toBeCloseTo(0);
    expect(at.z).toBeCloseTo(focal);
  });

  it('looks north at a yaw of nought, east to the right and up the board up the view', () => {
    const matrix = firstPersonEyeMatrix(eye, focal);
    const ahead = seen(matrix, focal, 200, 200, 40);
    expect(ahead.x).toBeCloseTo(0);
    expect(ahead.y).toBeCloseTo(0);
    expect(ahead.ahead).toBeCloseTo(100);
    expect(seen(matrix, focal, 300, 200, 40).x).toBeCloseTo(focal);
    expect(seen(matrix, focal, 200, 200, 140).y).toBeCloseTo(-focal);
    expect(seen(matrix, focal, 200, 400, 40).ahead).toBeCloseTo(-100);
  });

  it('turns clockwise with the yaw, so a yaw of 90 looks east', () => {
    const matrix = firstPersonEyeMatrix({ ...eye, yaw: 90 }, focal);
    const ahead = seen(matrix, focal, 300, 300, 40);
    expect(ahead.x).toBeCloseTo(0);
    expect(ahead.ahead).toBeCloseTo(100);
    expect(seen(matrix, focal, 300, 400, 40).x).toBeCloseTo(focal);
  });

  it('tips the view up by its pitch, so a point that far above what lies ahead stands in the middle', () => {
    const matrix = firstPersonEyeMatrix({ ...eye, pitch: 30 }, focal);
    const up = seen(matrix, focal, 200, 200, 40 + 100 * Math.tan(Math.PI / 6));
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(0);
  });
});

describe('firstPersonCeilings', () => {
  const grid = cellGridOf(4, 4, 50, GridType.SQUARE);
  const cells = new CellBits(16);
  cells.set(5);
  cells.set(6);
  cells.set(10);
  const rooms = new Int32Array(16).fill(-1);
  rooms[5] = 0;
  rooms[6] = 0;
  rooms[10] = 1;
  const roof = { cells, heightPx: 100, rooms, raised: new Map([[1, 150]]) };

  it('turns a painted face down over each cell under the roof, at its room’s height', () => {
    const ceilings = firstPersonCeilings(roof, grid, 40);
    expect(ceilings.map((ceiling) => [ceiling.id, ceiling.zPx])).toEqual([
      ['ceiling:5', 100],
      ['ceiling:6', 100],
      ['ceiling:10', 150],
    ]);
    expect(ceilings[0]).toMatchObject({ facing: 'down', pictureUrl: '', glass: false, colour: CEILING_COLOUR });
    expect(ceilings[0].outline).toEqual([
      { x: 50, y: 50 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
      { x: 50, y: 100 },
    ]);
  });

  it('puts none where the roof stands no higher than the eye', () => {
    expect(firstPersonCeilings(roof, grid, 120).map((ceiling) => ceiling.id)).toEqual(['ceiling:10']);
    expect(firstPersonCeilings(roof, grid, 150)).toEqual([]);
  });
});
