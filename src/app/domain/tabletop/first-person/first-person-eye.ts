import { Matrix3D } from '@axe/core/transform/matrix-3d';
import type { FirstPersonCamera } from '@axe/domain/tabletop/first-person/first-person-clip';
import { type FirstPersonRoof, roofHeightAt } from '@axe/domain/tabletop/first-person/first-person-roof';
import { cellCount, type CellGrid, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';
import type { TableWorldCap } from '@axe/domain/tabletop/world/table-world';

/** The colour a ceiling is painted, as dark as the CSS view's. */
export const CEILING_COLOUR = '#0c0a09';

const scratch = new Matrix3D();

function appendTurn(out: Matrix3D, axis: 'x' | 'z', degrees: number): void {
  const turn = (degrees * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  out.append(
    scratch.setData(
      axis === 'z'
        ? [cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
        : [1, 0, 0, 0, 0, cos, sin, 0, 0, -sin, cos, 0, 0, 0, 0, 1]
    )
  );
}

/**
 * The matrix that takes a point of the board into the space the first-person view's eye looks
 * through, as the view's own CSS camera does: pixels from the middle of the view, x to the right,
 * y down and z out towards the eye, which stands `focalPx` out along z. The board is turned so the
 * way the camera faces runs into the screen, then tipped up by its pitch.
 */
export function firstPersonEyeMatrix(
  camera: FirstPersonCamera,
  focalPx: number,
  out: Matrix3D = new Matrix3D()
): Matrix3D {
  out.identity();
  out.appendPosition(-camera.x, -camera.y, -camera.z);
  appendTurn(out, 'z', -camera.yaw);
  appendTurn(out, 'x', 90);
  if (camera.pitch) appendTurn(out, 'x', camera.pitch);
  out.appendPosition(0, 0, focalPx);
  return out;
}

/**
 * The ceilings over the rooms of a roof that stand over the eye, a face turned down over each cell
 * under the roof at its room's height. A roof the eye stands at or over has none it could look up
 * at, and a cell outside every room has none.
 */
export function firstPersonCeilings(roof: FirstPersonRoof, grid: CellGrid, eyeZ: number): TableWorldCap[] {
  const ceilings: TableWorldCap[] = [];
  const count = cellCount(grid);
  for (let cell = 0; cell < count; cell++) {
    if (!roof.cells.get(cell)) continue;
    const zPx = roofHeightAt(roof, cell);
    if (zPx <= eyeZ) continue;
    ceilings.push({
      id: `ceiling:${cell}`,
      outline: cellPolygonOf(grid, cell),
      zPx,
      facing: 'down',
      pictureUrl: '',
      tilePx: 0,
      glass: false,
      colour: CEILING_COLOUR,
    });
  }
  return ceilings;
}
