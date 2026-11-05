import { inject, InjectionToken, Signal } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import type { TableScreenMatrixOf, TableScreenOf } from '@axe/domain/tabletop/camera/table-camera';

/**
 * What carries the board onto a screen of elements laid over a canvas: the table's own camera, or
 * the eye of a view drawn among the pieces, which hands its own to what it lays out.
 */
export interface TableScreen {
  /** Goes up each time the view changes, or where the screen lies on the page. */
  readonly version: Signal<number>;
  /** How a point of the board is carried onto the screen now; null before there is a view. */
  readonly screenOf: Signal<TableScreenOf | null>;
  /** How an element placed on the board is laid on the screen now; null before there is a view. */
  readonly screenMatrixOf: Signal<TableScreenMatrixOf | null>;
}

/** The screen what is laid over a canvas is laid on: the table's own camera, unless a view gives its own. */
export const TABLE_SCREEN = new InjectionToken<TableScreen>('TABLE_SCREEN', {
  providedIn: 'root',
  factory: () => inject(TableCameraService),
});
