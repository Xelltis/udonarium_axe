import { computed, Injectable, signal } from '@angular/core';
import type { TableScreen } from '@axe/application/tabletop/table-screen';
import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  screenMatrixOfScene,
  screenOfScene,
  TableScreenMatrixOf,
  TableScreenOf,
} from '@axe/domain/tabletop/camera/table-camera';
import type { FirstPersonCamera } from '@axe/domain/tabletop/first-person/first-person-clip';
import { firstPersonBoardScreenMatrix, firstPersonEyeMatrix } from '@axe/domain/tabletop/first-person/first-person-eye';
import { eyeAxesOf } from '@axe/domain/tabletop/world/table-sprites';

/** The eye a first-person view is drawn through, and the screen it is drawn on. */
export interface FirstPersonScreenView {
  readonly camera: FirstPersonCamera;
  /** How far out the eye stands from the screen, in the view's own pixels. */
  readonly focalPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** How many of the view's own pixels a pixel of the board comes to. */
  readonly scale: number;
}

/**
 * The screen of a first-person view, which what the view lays over its canvas is laid on: the board
 * carried through the view's eye onto the view, against its top left corner, as the view draws it.
 * The view says where its eye stands each time it moves.
 */
@Injectable()
export class FirstPersonScreen implements TableScreen {
  private readonly view = signal<FirstPersonScreenView | null>(null);
  private readonly changes = signal(0);

  readonly version = this.changes.asReadonly();

  /** The matrix that takes the board onto the view, or null before the view has an eye. */
  private readonly scene = computed(() => {
    const view = this.view();
    return view
      ? firstPersonBoardScreenMatrix(view.camera, view.focalPx, view.widthPx, view.heightPx, view.scale)
      : null;
  });

  readonly screenOf = computed<TableScreenOf | null>(() => {
    const view = this.view();
    const scene = this.scene();
    if (!view || !scene) return null;
    return screenOfScene(
      scene,
      scene.invert(new Matrix3D()),
      eyeAxesOf(firstPersonEyeMatrix(view.camera, view.focalPx)).right,
      { x: 0, y: 0 },
      { x: view.widthPx / 2, y: view.heightPx / 2 }
    );
  });

  readonly screenMatrixOf = computed<TableScreenMatrixOf | null>(() => {
    const scene = this.scene();
    return scene ? screenMatrixOfScene(scene, { x: 0, y: 0 }) : null;
  });

  /** Draws through this eye from now on, or through none. */
  show(view: FirstPersonScreenView | null): void {
    this.view.set(view);
    this.changes.update((version) => version + 1);
  }
}
