import { IMatrix3D } from '@axe/core/transform/matrix-3d';

/**
 * A 4 by 4 matrix as sixteen numbers, column after column, which is how a CSS `matrix3d()` lists
 * them and how WebGL takes them. It acts on a column of x, y, z and w.
 */
export type Matrix4 = readonly number[];

/** A rectangle of the page, in CSS pixels. */
export interface PageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export type Point3 = readonly [number, number, number];

/** How much room is left in front of and behind what is drawn, as a share of its depth. */
const DEPTH_MARGIN = 0.25;

/** The sixteen numbers of a CSS matrix, in the order `matrix3d()` lists them. */
export function columnsOf(m: IMatrix3D): number[] {
  return [
    m.m11,
    m.m12,
    m.m13,
    m.m14,
    m.m21,
    m.m22,
    m.m23,
    m.m24,
    m.m31,
    m.m32,
    m.m33,
    m.m34,
    m.m41,
    m.m42,
    m.m43,
    m.m44,
  ];
}

/** The product a·b, which applies b and then a. */
export function multiply(a: Matrix4, b: Matrix4): number[] {
  const out = new Array<number>(16).fill(0);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** A point through a matrix, before the divide by w. */
export function transform(m: Matrix4, [x, y, z]: Point3): [number, number, number, number] {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
    m[3] * x + m[7] * y + m[11] * z + m[15],
  ];
}

/** Where a point lands on the page through a matrix that takes it there. */
export function toPage(toPageMatrix: Matrix4, point: Point3): [number, number] {
  const [x, y, , w] = transform(toPageMatrix, point);
  return [x / w, y / w];
}

/**
 * The matrix WebGL draws with to lay a scene exactly over a part of the page, from the matrix that
 * takes the scene's points onto the page: across, the rectangle runs from −1 to 1, and up the page
 * from −1 at its foot to 1 at its head.
 *
 * The page has no depth of its own to give, so the depth is set to span the points that bound the
 * scene, nearest the viewer at −1, with room to spare; anything else of the scene beyond them is
 * cut off.
 */
export function clipMatrixOf(toPageMatrix: Matrix4, rect: PageRect, bounds: readonly Point3[]): number[] {
  const sx = 2 / rect.width;
  const sy = -2 / rect.height;
  // Across and down the page in the homogeneous coordinates the CSS matrix gives, so the divide by
  // w that WebGL does afterwards is the one the page does.
  const toClip: number[] = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 0, 0, -1 - rect.left * sx, 1 - rect.top * sy, 0, 1];
  const clip = multiply(toClip, toPageMatrix);

  // Nearer the viewer is further along the page's z, after the divide by w.
  const depths = bounds.map((point) => {
    const [, , z, w] = transform(toPageMatrix, point);
    return z / w;
  });
  const near = Math.max(...depths);
  const far = Math.min(...depths);
  const margin = Math.max((near - far) * DEPTH_MARGIN, 1e-3);
  const a = 2 / (near - far + margin * 2);
  const centre = (near + far) / 2;
  // z_clip = −a·(z − centre·w), so z over w runs from −1 nearest to 1 furthest.
  for (let column = 0; column < 4; column++) {
    clip[column * 4 + 2] = -a * (toPageMatrix[column * 4 + 2] - centre * toPageMatrix[column * 4 + 3]);
  }
  return clip;
}

/**
 * Where the eye stands that a clip matrix looks from, in the scene's own space: the one point it
 * sends to no place at all. Null when the view has no perspective and looks from infinitely far.
 */
export function eyeOf(clip: Matrix4): [number, number, number] | null {
  const inverse = invert(clip);
  if (!inverse) return null;
  // The eye goes to nowhere across, up or in w, so it is what the inverse makes of the depth axis.
  const [x, y, z, w] = inverse.slice(8, 12);
  if (Math.abs(w) < 1e-9) return null;
  return [x / w, y / w, z / w];
}

/** The inverse of a matrix, or null for one that has none. */
export function invert(m: Matrix4): number[] | null {
  const inv = new Array<number>(16);
  inv[0] =
    m[5] * m[10] * m[15] -
    m[5] * m[11] * m[14] -
    m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] +
    m[13] * m[6] * m[11] -
    m[13] * m[7] * m[10];
  inv[4] =
    -m[4] * m[10] * m[15] +
    m[4] * m[11] * m[14] +
    m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] -
    m[12] * m[6] * m[11] +
    m[12] * m[7] * m[10];
  inv[8] =
    m[4] * m[9] * m[15] -
    m[4] * m[11] * m[13] -
    m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] +
    m[12] * m[5] * m[11] -
    m[12] * m[7] * m[9];
  inv[12] =
    -m[4] * m[9] * m[14] +
    m[4] * m[10] * m[13] +
    m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] -
    m[12] * m[5] * m[10] +
    m[12] * m[6] * m[9];
  inv[1] =
    -m[1] * m[10] * m[15] +
    m[1] * m[11] * m[14] +
    m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] -
    m[13] * m[2] * m[11] +
    m[13] * m[3] * m[10];
  inv[5] =
    m[0] * m[10] * m[15] -
    m[0] * m[11] * m[14] -
    m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] +
    m[12] * m[2] * m[11] -
    m[12] * m[3] * m[10];
  inv[9] =
    -m[0] * m[9] * m[15] +
    m[0] * m[11] * m[13] +
    m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] -
    m[12] * m[1] * m[11] +
    m[12] * m[3] * m[9];
  inv[13] =
    m[0] * m[9] * m[14] -
    m[0] * m[10] * m[13] -
    m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] +
    m[12] * m[1] * m[10] -
    m[12] * m[2] * m[9];
  inv[2] =
    m[1] * m[6] * m[15] -
    m[1] * m[7] * m[14] -
    m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] +
    m[13] * m[2] * m[7] -
    m[13] * m[3] * m[6];
  inv[6] =
    -m[0] * m[6] * m[15] +
    m[0] * m[7] * m[14] +
    m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] -
    m[12] * m[2] * m[7] +
    m[12] * m[3] * m[6];
  inv[10] =
    m[0] * m[5] * m[15] -
    m[0] * m[7] * m[13] -
    m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] +
    m[12] * m[1] * m[7] -
    m[12] * m[3] * m[5];
  inv[14] =
    -m[0] * m[5] * m[14] +
    m[0] * m[6] * m[13] +
    m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] -
    m[12] * m[1] * m[6] +
    m[12] * m[2] * m[5];
  inv[3] =
    -m[1] * m[6] * m[11] +
    m[1] * m[7] * m[10] +
    m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] -
    m[9] * m[2] * m[7] +
    m[9] * m[3] * m[6];
  inv[7] =
    m[0] * m[6] * m[11] -
    m[0] * m[7] * m[10] -
    m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] +
    m[8] * m[2] * m[7] -
    m[8] * m[3] * m[6];
  inv[11] =
    -m[0] * m[5] * m[11] +
    m[0] * m[7] * m[9] +
    m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] -
    m[8] * m[1] * m[7] +
    m[8] * m[3] * m[5];
  inv[15] =
    m[0] * m[5] * m[10] -
    m[0] * m[6] * m[9] -
    m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] +
    m[8] * m[1] * m[6] -
    m[8] * m[2] * m[5];
  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-12) return null;
  return inv.map((value) => value / det);
}
