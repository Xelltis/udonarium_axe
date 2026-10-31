import { Injectable, signal } from '@angular/core';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import { TableCameraView, TableLayout, tableSceneMatrix } from '@axe/domain/tabletop/camera/table-camera';

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

  /** Goes up each time the view drawn or the table's place on the page changes. */
  readonly version = this.changes.asReadonly();

  /** The view as it was last drawn, or null before the table first draws one. */
  get view(): TableCameraView | null {
    return this.shownView;
  }

  /** Where the table sits on the page, or null before it is laid out. */
  get layout(): TableLayout | null {
    return this.shownLayout;
  }

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
