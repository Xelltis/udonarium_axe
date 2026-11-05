import { DestroyRef, Directive, effect, ElementRef, inject, untracked } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TABLE_SCREEN } from '@axe/application/tabletop/table-screen';
import { Matrix3D } from '@axe/core/transform/matrix-3d';

/**
 * Lays an element of the screen over a table drawn on a canvas on the board itself, in perspective,
 * so what is laid out in it in table pixels, as the marks drawn on the floor, lies where the canvas
 * draws that point of the floor. The element is as large as the board, and is laid afresh in the
 * frame after the view moves, through the screen it lies on: the table's own camera, or the eye of a
 * view among the pieces. The board is carried through the view whole, so a part of it behind the eye
 * is cut away rather than folded over.
 */
@Directive({
  selector: '[appFloorPlane]',
  host: {
    '[style.position]': "'absolute'",
    '[style.left.px]': '0',
    '[style.top.px]': '0',
    '[style.transform-origin]': "'0 0'",
  },
})
export class FloorPlaneDirective {
  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const board = inject(TableCameraService);
    const screen = inject(TABLE_SCREEN);
    const onBoard = new Matrix3D();
    let frame: number | null = null;
    const lay = () => {
      frame = null;
      const layout = board.layout;
      const laid = screen.screenMatrixOf();
      if (!layout || !laid) return;
      element.style.width = `${layout.boardWidth}px`;
      element.style.height = `${layout.boardHeight}px`;
      element.style.transform = laid(onBoard);
    };
    effect(() => {
      screen.version();
      board.layoutVersion();
      untracked(() => {
        if (frame === null) frame = requestAnimationFrame(lay);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (frame !== null) cancelAnimationFrame(frame);
    });
  }
}
