import { computed, Injectable, signal } from '@angular/core';
import type { TableScreen } from '@axe/application/tabletop/table-screen';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  perspectiveOf,
  screenMatrixOfScene,
  screenOfScene,
  TableCameraView,
  tableEyeMatrix,
  TableLayout,
  tableSceneMatrix,
  TableScreenMatrixOf,
  TableScreenOf,
} from '@axe/domain/tabletop/camera/table-camera';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';

/**
 * Where the table's camera stands as it was last drawn, and where the table sits on the page, so
 * that points can be carried between the board and the page by working them out rather than by
 * reading the page's styles back.
 */
@Injectable({
  providedIn: 'root',
})
export class TableCameraService implements TableScreen {
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
    return screenOfScene(
      scene,
      inverse,
      eyeAxesOf(tableEyeMatrix(view, layout)).right,
      { x: layout.left, y: layout.top },
      { x: layout.left + layout.width / 2, y: layout.top + layout.height / 2 }
    );
  });

  /** The view as it was last drawn, or null before the table first draws one. */
  get view(): TableCameraView | null {
    return this.shownView;
  }

  /**
   * How far up the page's depth the eye stands, which nothing nearer than can be seen; null for a
   * view drawn without perspective, or before the table first draws one.
   */
  eyeDepth(): number | null {
    const view = this.shownView;
    return view && !view.orthographic ? perspectiveOf(view) : null;
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
  readonly screenMatrixOf = computed<TableScreenMatrixOf | null>(() => {
    this.version();
    const scene = this.sceneMatrix();
    const layout = this.shownLayout;
    return scene && layout ? screenMatrixOfScene(scene, { x: layout.left, y: layout.top }) : null;
  });

  /** Called in the frame the table draws a view. */
  showView(view: TableCameraView): void {
    this.shownView = view;
    this.stale = true;
    this.changes.update((version) => version + 1);
  }

  /** Called when the table goes from the page, which then has no camera until a table draws one again. */
  forget(): void {
    if (!this.shownView && !this.shownLayout) return;
    this.shownView = null;
    this.shownLayout = null;
    this.stale = true;
    this.changes.update((version) => version + 1);
    this.layoutChanges.update((version) => version + 1);
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
