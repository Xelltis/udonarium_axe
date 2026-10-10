import { Logger } from '@axe/core/logging/logger';
import { CSSNumber } from '@axe/core/transform/css-number';
import { IPoint2D, IPoint3D } from '@axe/core/transform/transform';

export interface IMatrix3D {
  m11: number;
  m12: number;
  m13: number;
  m14: number;
  m21: number;
  m22: number;
  m23: number;
  m24: number;
  m31: number;
  m32: number;
  m33: number;
  m34: number;
  m41: number;
  m42: number;
  m43: number;
  m44: number;
}

export class Matrix3D {
  m11: number = 1;
  m12: number = 0;
  m13: number = 0;
  m14: number = 0;
  m21: number = 0;
  m22: number = 1;
  m23: number = 0;
  m24: number = 0;
  m31: number = 0;
  m32: number = 0;
  m33: number = 1;
  m34: number = 0;
  m41: number = 0;
  m42: number = 0;
  m43: number = 0;
  m44: number = 1;

  constructor() {}

  /**
   * Reads an element's computed CSS transform into a matrix, or the identity for
   * an element outside a document.
   *
   * Pass the computed style when it is already at hand to save looking it up again, and a matrix
   * to fill to avoid allocating one.
   */
  static create(element: HTMLElement, style: CSSStyleDeclaration | null = null, ret = new Matrix3D()): Matrix3D {
    if (element && element.ownerDocument) return ret.setCSS((style || window.getComputedStyle(element)).transform);
    return ret.identity();
  }

  /**
   * Fills the matrix from the numbers of a CSS `matrix3d()` (16), `matrix()` (6) or a 3 by 3 (9)
   * list, in the order CSS lists them.
   *
   * Any other length, or no data, leaves the matrix as it was.
   */
  setData(data: number[]): Matrix3D {
    if (data == null) return this;

    const l = data.length;
    if (l == 16) {
      this.m11 = data[0];
      this.m12 = data[1];
      this.m13 = data[2];
      this.m14 = data[3];
      this.m21 = data[4];
      this.m22 = data[5];
      this.m23 = data[6];
      this.m24 = data[7];
      this.m31 = data[8];
      this.m32 = data[9];
      this.m33 = data[10];
      this.m34 = data[11];
      this.m41 = data[12];
      this.m42 = data[13];
      this.m43 = data[14];
      this.m44 = data[15];
    } else if (l == 6) {
      this.m11 = data[0];
      this.m12 = data[1];
      this.m13 = 0;
      this.m14 = 0;
      this.m21 = data[2];
      this.m22 = data[3];
      this.m23 = 0;
      this.m24 = 0;
      this.m31 = 0;
      this.m32 = 0;
      this.m33 = 1;
      this.m34 = 0;
      this.m41 = data[4];
      this.m42 = data[5];
      this.m43 = 0;
      this.m44 = 1;
    } else if (l == 9) {
      this.m11 = data[0];
      this.m12 = data[1];
      this.m13 = 0;
      this.m14 = data[2];
      this.m21 = data[3];
      this.m22 = data[4];
      this.m23 = 0;
      this.m24 = data[5];
      this.m31 = 0;
      this.m32 = 0;
      this.m33 = 1;
      this.m34 = 0;
      this.m41 = data[6];
      this.m42 = data[7];
      this.m43 = 0;
      this.m44 = data[8];
    }

    return this;
  }

  /** Resets the matrix to the identity in place. */
  identity(): Matrix3D {
    this.m11 = 1;
    this.m12 = 0;
    this.m13 = 0;
    this.m14 = 0;
    this.m21 = 0;
    this.m22 = 1;
    this.m23 = 0;
    this.m24 = 0;
    this.m31 = 0;
    this.m32 = 0;
    this.m33 = 1;
    this.m34 = 0;
    this.m41 = 0;
    this.m42 = 0;
    this.m43 = 0;
    this.m44 = 1;
    return this;
  }

  /** Multiplies every entry by a number in place. */
  scalar(scalar: number): Matrix3D {
    this.m11 *= scalar;
    this.m12 *= scalar;
    this.m13 *= scalar;
    this.m14 *= scalar;
    this.m21 *= scalar;
    this.m22 *= scalar;
    this.m23 *= scalar;
    this.m24 *= scalar;
    this.m31 *= scalar;
    this.m32 *= scalar;
    this.m33 *= scalar;
    this.m34 *= scalar;
    this.m41 *= scalar;
    this.m42 *= scalar;
    this.m43 *= scalar;
    this.m44 *= scalar;

    return this;
  }

  /**
   * Maps a 2D point through the matrix to where the line through it, straight into the screen,
   * crosses z = 0 on the other side, following the point projection in Mozilla Gecko's
   * `gfx3DMatrix.cpp`.
   *
   * `Transform.globalToLocal` calls it with the inverted scene transform, which puts a pointer on
   * the page onto the plane of a tilted element such as the table; `CoordinateService` reads
   * pointers that way. Only x and y give the crossing: z and w both hold the depth of the point
   * before it is moved along the line, and any z on the input is ignored. Fills and returns `ret`.
   */
  unproject(point: IPoint2D, ret: IPoint3D = { x: 0, y: 0, z: 0, w: 1 }): IPoint3D {
    let x = point.x * this.m11 + point.y * this.m21 + this.m41;
    let y = point.x * this.m12 + point.y * this.m22 + this.m42;
    let z = point.x * this.m13 + point.y * this.m23 + this.m43;
    let w = point.x * this.m14 + point.y * this.m24 + this.m44;

    let qx = x + this.m31;
    let qy = y + this.m32;
    let qz = z + this.m33;
    let qw = w + this.m34;

    if (w === 0) w = 0.0001;
    x /= w;
    y /= w;
    z /= w;

    if (qw === 0) qw = 0.0001;
    qx /= qw;
    qy /= qw;
    qz /= qw;

    const wz = qz - z;
    if (wz === 0) {
      ret.x = x;
      ret.y = y;
      ret.z = z;
      ret.w = z;
      return ret;
    }

    const t = -z / wz;
    x += t * (qx - x);
    y += t * (qy - y);

    ret.x = x;
    ret.y = y;
    ret.z = z;
    ret.w = z;
    return ret;
  }

  /**
   * Maps a 3D point through the matrix and divides x and y by w for perspective.
   *
   * `Transform.localToGlobal` calls it with the scene transform to find where a point on an element
   * shows on the page, which is how `CoordinateService.convertToGlobal` turns an element's point
   * into a page point. z is passed through unchanged and w is set to it. Fills and returns `ret`.
   */
  project(point: IPoint3D, ret: IPoint3D = { x: 0, y: 0, z: 0, w: 1 }): IPoint3D {
    const z = point.z;
    let w = point.x * this.m14 + point.y * this.m24 + z * this.m34 + this.m44;
    let x = point.x * this.m11 + point.y * this.m21 + z * this.m31 + this.m41;
    let y = point.x * this.m12 + point.y * this.m22 + z * this.m32 + this.m42;

    if (w === 0) w = 0.0001;

    x /= w;
    y /= w;

    if (w < 0) {
      x -= this.m41;
      y -= this.m42;
      x *= 1 / w;
      y *= 1 / w;
      x += this.m41;
      y += this.m42;
    }

    ret.x = x;
    ret.y = y;
    ret.z = z;
    ret.w = z;
    return ret;
  }

  /** Multiplies this matrix by another in place, so that the other's transform applies after this one's. */
  append(b: IMatrix3D): Matrix3D {
    return Matrix3D.multiply(this, b, this);
  }

  /** Overwrites the translation part with a position, leaving the rest as it is. */
  setPosition(position: IPoint3D): Matrix3D {
    this.m41 = position.x;
    this.m42 = position.y;
    this.m43 = position.z;
    return this;
  }

  /** Copies the translation part into `ret` and returns it. */
  getPosition(ret: IPoint3D = { x: 0, y: 0, z: 0, w: 1 }): IPoint3D {
    ret.x = this.m41;
    ret.y = this.m42;
    ret.z = this.m43;
    return ret;
  }
  /** Resets `ret`, a new matrix by default, to a pure translation to the position. */
  static makePosition(position: IPoint3D, ret = new Matrix3D()): Matrix3D {
    ret.identity();
    ret.setPosition(position);
    return ret;
  }

  /** Adds a translation after the current transform, given as a point or as x, y and z. */
  appendPosition(positionOrX: IPoint3D | number, y?: number, z?: number): Matrix3D {
    const position = typeof positionOrX === 'number' ? { x: positionOrX, y: y!, z: z!, w: 1 } : positionOrX;
    return this.append(Matrix3D.makePosition(position, Matrix3D._scratch));
  }

  /** Resets `ret` to a CSS perspective at the given distance, or to the identity for a distance of 0. */
  static makePerspective(perspective: number, ret = new Matrix3D()): Matrix3D {
    ret.identity();
    ret.m34 = perspective ? -(1 / perspective) : 0;
    return ret;
  }

  /**
   * Adds a CSS perspective at the given distance after the current transform; a distance of 0 adds
   * nothing.
   */
  appendPerspective(perspective: number): Matrix3D {
    if (!perspective) return this;
    return this.append(Matrix3D.makePerspective(perspective, Matrix3D._scratch));
  }

  /**
   * Inverts the matrix.
   * -> based on http://www.euclideanspace.com/maths/algebra/matrix/functions/inverse/fourD/index.htm
   * -> based on https://github.com/mrdoob/three.js/blob/master/src/math/Matrix4.js
   */
  invert(target?: Matrix3D): Matrix3D {
    target = target || this;

    const n11 = this.m11,
      n12 = this.m12,
      n13 = this.m13,
      n14 = this.m14;
    const n21 = this.m21,
      n22 = this.m22,
      n23 = this.m23,
      n24 = this.m24;
    const n31 = this.m31,
      n32 = this.m32,
      n33 = this.m33,
      n34 = this.m34;
    const n41 = this.m41,
      n42 = this.m42,
      n43 = this.m43,
      n44 = this.m44;

    const t0 =
      n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
    const t1 =
      n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
    const t2 =
      n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
    const t3 =
      n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;

    const det = n11 * t0 + n21 * t1 + n31 * t2 + n41 * t3;
    if (det === 0) {
      Logger.warn('[Matrix3D] 行列の逆行列が計算不可 (det=0)');
      return this;
    }

    const s = 1 / det;
    target.m11 = t0 * s;
    target.m12 = t1 * s;
    target.m13 = t2 * s;
    target.m14 = t3 * s;
    target.m21 =
      (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * s;
    target.m22 =
      (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * s;
    target.m23 =
      (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * s;
    target.m24 =
      (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * s;
    target.m31 =
      (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * s;
    target.m32 =
      (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * s;
    target.m33 =
      (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * s;
    target.m34 =
      (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * s;
    target.m41 =
      (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * s;
    target.m42 =
      (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * s;
    target.m43 =
      (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * s;
    target.m44 =
      (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * s;

    return target;
  }

  /**
   * Replaces the matrix with a computed CSS transform, empty or `none` giving the identity.
   *
   * Only the `matrix()` and `matrix3d()` forms that computed styles report are understood; anything
   * else leaves the matrix as it was.
   */
  setCSS(cssString: string): Matrix3D {
    if (!cssString || cssString == 'none') return this.identity();
    const parts = cssString.replace('matrix3d(', '').replace('matrix(', '').replace(')', '').split(',');
    const trans = parts.map((p) => CSSNumber.parse(p));
    return this.setData(trans);
  }

  /**
   * Adds a computed CSS transform after the current one; empty or `none` adds nothing.
   *
   * With `force2D`, a `matrix3d()` is flattened to its effect on the plane first.
   */
  appendCSS(cssString: string, force2D: boolean = false): Matrix3D {
    if (!cssString || cssString == 'none') return this;
    if (force2D && cssString.indexOf('matrix3d') >= 0) {
      return this.append(Matrix3D._scratch.setCSS(cssString).flatten());
    }
    return this.append(Matrix3D._scratch.setCSS(cssString));
  }

  /** Discards the depth and perspective entries in place, so the matrix acts on the plane only. */
  flatten(): Matrix3D {
    this.m31 = 0;
    this.m32 = 0;
    this.m33 = 1;
    this.m34 = 0;
    this.m44 = 1;
    this.m14 = 0;
    this.m24 = 0;
    this.m43 = 0;
    return this;
  }

  /**
   * Multiplies `a` by `b` into `ret`, a new matrix by default, so that a's transform applies first
   * and b's after. `ret` may be either operand.
   */
  static multiply(a: IMatrix3D, b: IMatrix3D, ret: Matrix3D = new Matrix3D()): Matrix3D {
    const m11 = a.m11 * b.m11 + a.m12 * b.m21 + a.m13 * b.m31 + a.m14 * b.m41;
    const m12 = a.m11 * b.m12 + a.m12 * b.m22 + a.m13 * b.m32 + a.m14 * b.m42;
    const m13 = a.m11 * b.m13 + a.m12 * b.m23 + a.m13 * b.m33 + a.m14 * b.m43;
    const m14 = a.m11 * b.m14 + a.m12 * b.m24 + a.m13 * b.m34 + a.m14 * b.m44;
    const m21 = a.m21 * b.m11 + a.m22 * b.m21 + a.m23 * b.m31 + a.m24 * b.m41;
    const m22 = a.m21 * b.m12 + a.m22 * b.m22 + a.m23 * b.m32 + a.m24 * b.m42;
    const m23 = a.m21 * b.m13 + a.m22 * b.m23 + a.m23 * b.m33 + a.m24 * b.m43;
    const m24 = a.m21 * b.m14 + a.m22 * b.m24 + a.m23 * b.m34 + a.m24 * b.m44;
    const m31 = a.m31 * b.m11 + a.m32 * b.m21 + a.m33 * b.m31 + a.m34 * b.m41;
    const m32 = a.m31 * b.m12 + a.m32 * b.m22 + a.m33 * b.m32 + a.m34 * b.m42;
    const m33 = a.m31 * b.m13 + a.m32 * b.m23 + a.m33 * b.m33 + a.m34 * b.m43;
    const m34 = a.m31 * b.m14 + a.m32 * b.m24 + a.m33 * b.m34 + a.m34 * b.m44;
    const m41 = a.m41 * b.m11 + a.m42 * b.m21 + a.m43 * b.m31 + a.m44 * b.m41;
    const m42 = a.m41 * b.m12 + a.m42 * b.m22 + a.m43 * b.m32 + a.m44 * b.m42;
    const m43 = a.m41 * b.m13 + a.m42 * b.m23 + a.m43 * b.m33 + a.m44 * b.m43;
    const m44 = a.m41 * b.m14 + a.m42 * b.m24 + a.m43 * b.m34 + a.m44 * b.m44;

    ret.m11 = m11;
    ret.m12 = m12;
    ret.m13 = m13;
    ret.m14 = m14;
    ret.m21 = m21;
    ret.m22 = m22;
    ret.m23 = m23;
    ret.m24 = m24;
    ret.m31 = m31;
    ret.m32 = m32;
    ret.m33 = m33;
    ret.m34 = m34;
    ret.m41 = m41;
    ret.m42 = m42;
    ret.m43 = m43;
    ret.m44 = m44;

    return ret;
  }

  /** The entries laid out as four tab-separated rows, for logging while debugging. */
  public toString(fractionalDigits: number = 3): string {
    const f = (v: number) => v.toFixed(fractionalDigits);
    return [
      `m11=${f(this.m11)}\tm21=${f(this.m21)}\tm31=${f(this.m31)}\tm41=${f(this.m41)}`,
      `m12=${f(this.m12)}\tm22=${f(this.m22)}\tm32=${f(this.m32)}\tm42=${f(this.m42)}`,
      `m13=${f(this.m13)}\tm23=${f(this.m23)}\tm33=${f(this.m33)}\tm43=${f(this.m43)}`,
      `m14=${f(this.m14)}\tm24=${f(this.m24)}\tm34=${f(this.m34)}\tm44=${f(this.m44)}`,
    ].join('\n');
  }
  private static _scratch = new Matrix3D();
}
