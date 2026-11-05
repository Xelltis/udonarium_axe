import { computed, Injectable, signal } from '@angular/core';
import { IMatrix3D, Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  pageOfTablePoint,
  TableCameraView,
  tableEyeMatrix,
  TableLayout,
  tableRayOfPage,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';

/**
 * Where a point of the board is drawn on the screen of the table, against the screen's top left
 * corner, and how many pixels of the screen a pixel of the board facing the eye is drawn across there.
 */
export interface TableScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/**
 * Carries a point of the board onto the screen of the table, brought first the given way towards the
 * eye along the way the camera looks, as a picture turned to the eye is brought off what it stands on.
 */
export type TableScreenOf = (x: number, y: number, z: number, towardsEyePx?: number) => TableScreenPoint;

/**
 * Where the table's camera stands as it was last drawn, and where the table sits on the page, so
 * that points can be carried between the board and the page by working them out rather than by
 * reading the page's styles back.
 */
@Injectable({
  providedIn: 'root',
})
export class TableCameraService {
  private shownView: TableCameraView | null = null;
  private shownLayout: TableLayout | null = null;
  private readonly scene = new Matrix3D();
  private readonly inverse = new Matrix3D();
  private stale = true;
  private readonly changes = signal(0);
  private readonly layoutChanges = signal(0);

  /** Goes up each time the view drawn or the table's place on the page changes. */
  readonly version = this.changes.asReadonly();

  /** Goes up each time the table's place on the page changes, and not when only the view does. */
  readonly layoutVersion = this.layoutChanges.asReadonly();

  /**
   * How a point of the board is carried onto the screen of the table now, for what is laid on the
   * screen over a table drawn on a canvas. Follows the camera; null until both a view has been drawn
   * and the table has been laid out.
   */
  readonly screenOf = computed<TableScreenOf | null>(() => {
    this.version();
    const scene = this.sceneMatrix();
    const inverse = this.inverseSceneMatrix();
    const view = this.shownView;
    const layout = this.shownLayout;
    if (!scene || !inverse || !view || !layout) return null;
    const right = eyeAxesOf(tableEyeMatrix(view, layout)).right;
    const away = tableRayOfPage(inverse, layout.left + layout.width / 2, layout.top + layout.height / 2).direction;
    return (x, y, z, towardsEyePx = 0) => {
      const near = { x: x - away.x * towardsEyePx, y: y - away.y * towardsEyePx, z: z - away.z * towardsEyePx };
      const at = pageOfTablePoint(scene, near.x, near.y, near.z);
      const beside = pageOfTablePoint(scene, near.x + right.x, near.y + right.y, near.z + right.z);
      return { x: at.x - layout.left, y: at.y - layout.top, scale: Math.hypot(beside.x - at.x, beside.y - at.y) };
    };
  });

  /** The view as it was last drawn, or null before the table first draws one. */
  get view(): TableCameraView | null {
    return this.shownView;
  }

  /** Where the table sits on the page, or null before it is laid out. */
  get layout(): TableLayout | null {
    return this.shownLayout;
  }

  /**
   * How an element placed on the board by a transform of its own, from its top left corner, is laid
   * on the screen of the table: as a CSS transform carrying it on through the camera, the camera's
   * perspective kept in it, so the page draws the element as its own table did and cuts away what
   * comes behind the eye. Follows the camera; null until both a view has been drawn and the table has
   * been laid out.
   */
  readonly screenMatrixOf = computed<((placed: IMatrix3D) => string) | null>(() => {
    this.version();
    const scene = this.sceneMatrix();
    const layout = this.shownLayout;
    if (!scene || !layout) return null;
    const toScreen = Matrix3D.multiply(scene, Matrix3D.makePosition({ x: -layout.left, y: -layout.top, z: 0, w: 1 }));
    const laid = new Matrix3D();
    return (placed) => Matrix3D.multiply(placed, toScreen, laid).toCss();
  });

  /** Called in the frame the table draws a view. */
  showView(view: TableCameraView): void {
    this.shownView = view;
    this.stale = true;
    this.changes.update((version) => version + 1);
  }

  /** Called when the table is laid out again, or its board changes size. */
  setLayout(layout: TableLayout): void {
    const was = this.shownLayout;
    if (
      was &&
      was.left === layout.left &&
      was.top === layout.top &&
      was.width === layout.width &&
      was.height === layout.height &&
      was.boardWidth === layout.boardWidth &&
      was.boardHeight === layout.boardHeight
    ) {
      return;
    }
    this.shownLayout = layout;
    this.stale = true;
    this.changes.update((version) => version + 1);
    this.layoutChanges.update((version) => version + 1);
  }

  /**
   * The matrix that takes a point of the board onto the page, or null until both a view has been
   * drawn and the table has been laid out. The same instance is handed back each time and changes
   * in place, so a caller that keeps it copies it.
   */
  sceneMatrix(): Matrix3D | null {
    return this.refresh() ? this.scene : null;
  }

  /** The inverse of `sceneMatrix`, under the same terms. */
  inverseSceneMatrix(): Matrix3D | null {
    return this.refresh() ? this.inverse : null;
  }

  private refresh(): boolean {
    if (!this.shownView || !this.shownLayout) return false;
    if (this.stale) {
      tableSceneMatrix(this.shownView, this.shownLayout, this.scene);
      this.scene.invert(this.inverse);
      this.stale = false;
    }
    return true;
  }
}
