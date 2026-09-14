import { CSSNumber } from '@axe/core/transform/css-number';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { PERF_TRANSFORM_INIT, perfCounters } from '@axe/core/util/perf-counters';

export interface IPoint2D {
  x: number;
  y: number;
}
export interface IPoint3D extends IPoint2D {
  z: number;
  w: number;
}
export class Transform {
  private element: HTMLElement | null = null;
  private matrix: Matrix3D = new Matrix3D();
  private sceneTransform: Matrix3D = new Matrix3D();
  private inverseSceneTransform: Matrix3D = new Matrix3D();

  private paddingLeft!: number;
  private paddingTop!: number;
  private marginLeft!: number;
  private marginTop!: number;
  private borderLeft!: number;
  private borderTop!: number;

  constructor(element: HTMLElement) {
    this.initialize(element);
  }

  /** Lets go of the element and resets the own matrix, as when the instance goes back to a pool. */
  clear(): Transform {
    this.element = null;
    this.matrix.identity();

    return this;
  }

  /** Points an existing instance at another element, which is how one is taken from the pool and reused. */
  reinit(element: HTMLElement): this {
    this.initialize(element);
    return this;
  }

  private initialize(element: HTMLElement) {
    if (!element) return;

    this.element = element;
    perfCounters.bump(PERF_TRANSFORM_INIT);

    const style = window.getComputedStyle(element);

    let parentWidth: number;
    let parentHeight: number;
    if (this.element.parentElement) {
      parentWidth = this.element.parentElement.clientWidth;
      parentHeight = this.element.parentElement.clientHeight;
    } else {
      parentWidth = window.innerWidth;
      parentHeight = window.innerHeight;
    }
    this.paddingLeft = CSSNumber.relation(style.paddingLeft, parentWidth);
    this.paddingTop = CSSNumber.relation(style.paddingTop, parentHeight);
    this.marginLeft = CSSNumber.relation(style.marginLeft, parentWidth);
    this.marginTop = CSSNumber.relation(style.marginTop, parentHeight);
    this.borderLeft = CSSNumber.relation(style.borderLeft, parentWidth);
    this.borderTop = CSSNumber.relation(style.borderTop, parentHeight);

    this.matrix.setCSS(style.transform);
    this.sceneTransform.identity();
    this.extract(this, this.sceneTransform);
    this.sceneTransform.invert(this.inverseSceneTransform);

    return this;
  }

  /**
   * Converts a point in page coordinates to this element's coordinates, through every CSS
   * transform and perspective above it.
   *
   * The result lies on the element plane, so a pointer over a tilted table lands on its surface.
   * The layout is the one captured when the transform was made or reinitialised.
   */
  globalToLocal(x: number, y: number, z: number = 0): IPoint3D {
    const ret: IPoint3D = { x: x, y: y, z: z, w: 1 };
    this.inverseSceneTransform.unproject(ret, ret);
    this.fromBorderBox(ret);
    return ret;
  }

  /**
   * Converts a point in this element's coordinates to page coordinates, using the layout captured
   * when the transform was made or reinitialised.
   */
  localToGlobal(x: number, y: number, z: number = 0): IPoint3D {
    const ret: IPoint3D = { x: x, y: y, z: z, w: 1 };
    this.sceneTransform.project(ret, ret);
    this.fromBorderBox(ret);
    return ret;
  }

  /**
   * Converts a point in this element's coordinates into another element's, building a transform for
   * the other element and throwing it away afterwards.
   *
   * When converting repeatedly, keep a transform for the target and use `localToLocalUsing`.
   */
  localToLocal(x: number, y: number, z: number, to: HTMLElement): IPoint3D {
    const transformer: Transform = new Transform(to);
    const ret = this.localToLocalUsing(x, y, z, transformer);
    transformer.clear();
    return ret;
  }

  /** The allocation-free form of localToLocal: the caller passes in transforms to reuse. */
  localToLocalUsing(x: number, y: number, z: number, toTransform: Transform): IPoint3D {
    const matrix = Matrix3D.multiply(this.sceneTransform, toTransform.inverseSceneTransform);
    const ret: IPoint3D = { x: 0, y: 0, z: 0, w: 1 };

    ret.x = x * matrix.m11 + y * matrix.m21 + z * matrix.m31 + matrix.m41;
    ret.y = x * matrix.m12 + y * matrix.m22 + z * matrix.m32 + matrix.m42;
    ret.z = x * matrix.m13 + y * matrix.m23 + z * matrix.m33 + matrix.m43;
    ret.w = x * matrix.m14 + y * matrix.m24 + z * matrix.m34 + matrix.m44;

    this.toBorderBox(ret);
    return ret;
  }

  private extract(transform: Transform, matrix: Matrix3D): void {
    const element = transform.element;
    let node: HTMLElement | null = element;

    while (node) {
      this.extractMatrix(node, matrix);
      if (node && node.style.position === 'fixed') {
        matrix.appendPosition(window.pageXOffset, window.pageYOffset, 0);
      }
      node = node.parentElement;
    }
  }

  private extractMatrix(node: HTMLElement, matrix: Matrix3D | null = null): Matrix3D {
    if (!matrix) matrix = new Matrix3D();
    if (!node) return matrix;

    const element: HTMLElement = node;
    const style: CSSStyleDeclaration = window.getComputedStyle(node);

    if (style.transform != 'none') {
      const origin = style.transformOrigin ? style.transformOrigin.split(' ') : [];
      const originX = CSSNumber.relation(origin[0], element.offsetWidth, element.offsetWidth * 0.5);
      const originY = CSSNumber.relation(origin[1], element.offsetHeight, element.offsetHeight * 0.5);
      const originZ = CSSNumber.relation(origin[2], 0, 0);

      matrix.appendPosition(-originX, -originY, -originZ);
      matrix.appendCSS(style.transform);
      matrix.appendPosition(originX, originY, originZ);
    }

    const position = this.getPosition(node);
    matrix.appendPosition(position.x, position.y, 0);

    let perspective = 0;
    let cachedParentStyle: CSSStyleDeclaration | null = null;
    if (node.parentElement) {
      cachedParentStyle = window.getComputedStyle(node.parentElement);
      perspective = CSSNumber.parse(cachedParentStyle.perspective);
    }

    if (node.parentElement && perspective && cachedParentStyle) {
      const perspectiveOrigin = cachedParentStyle.perspectiveOrigin.split(' ');
      const perspectiveOriginX = CSSNumber.relation(perspectiveOrigin[0], element.parentElement!.offsetWidth);
      const perspectiveOriginY = CSSNumber.relation(perspectiveOrigin[1], element.parentElement!.offsetHeight);

      matrix.appendPosition(-perspectiveOriginX, -perspectiveOriginY, 0);
      matrix.appendPerspective(perspective);
      matrix.appendPosition(perspectiveOriginX, perspectiveOriginY, 0);
    }

    return matrix;
  }

  private static getOffsetAxis(
    node: HTMLElement,
    nodeOffset: number,
    parentOffset: number,
    clientBorder: number
  ): number {
    const parent = node.parentElement;
    const base = !node.offsetParent
      ? nodeOffset
      : parent === node.offsetParent
        ? nodeOffset
        : parent && parent.offsetParent === node.offsetParent
          ? nodeOffset - parentOffset
          : 0;
    return base + (node.offsetParent ? clientBorder : 0);
  }

  private getPosition(node: HTMLElement): IPoint2D {
    const parent = node.parentElement;
    return {
      x: Transform.getOffsetAxis(node, node.offsetLeft, parent?.offsetLeft ?? 0, node.offsetParent?.clientLeft ?? 0),
      y: Transform.getOffsetAxis(node, node.offsetTop, parent?.offsetTop ?? 0, node.offsetParent?.clientTop ?? 0),
    };
  }

  private fromBorderBox(point: IPoint3D): void {
    point.x += this.paddingLeft - this.marginLeft - this.borderLeft;
    point.y += this.paddingTop - this.marginTop - this.borderTop;
  }

  private toBorderBox(point: IPoint3D): void {
    point.x -= this.paddingLeft - this.marginLeft - this.borderLeft;
    point.y -= this.paddingTop - this.marginTop - this.borderTop;
  }
}
