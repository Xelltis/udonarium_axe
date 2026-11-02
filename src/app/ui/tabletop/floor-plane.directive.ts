import { DestroyRef, Directive, effect, ElementRef, inject, untracked } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { quadMatrix } from '@axe/domain/tabletop/world/page-boxes';

/**
 * Lays an element of the screen over a table drawn on a canvas on the board itself, in perspective,
 * so what is laid out in it in table pixels, as the marks drawn on the floor, lies where the canvas
 * draws that point of the floor. The element is as large as the board, and is laid afresh in the
 * frame after the camera moves.
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
    const camera = inject(TableCameraService);
    const surfaces = inject(TableSurfaceService);
    let frame: number | null = null;
    const lay = () => {
      frame = null;
      const layout = camera.layout;
      if (!layout) return;
      const { boardWidth: width, boardHeight: height } = layout;
      const corners = [
        [0, 0],
        [width, 0],
        [width, height],
        [0, height],
      ].map(([x, y]) => surfaces.pageOf('floor', x, y));
      if (corners.some((corner) => !corner)) return;
      const [a, b, c, d] = corners.map((corner) => ({ x: corner!.x - layout.left, y: corner!.y - layout.top }));
      const matrix = quadMatrix(width, height, [a, b, c, d]);
      if (!matrix) return;
      element.style.width = `${width}px`;
      element.style.height = `${height}px`;
      element.style.transform = `matrix3d(${matrix.map((value) => Math.round(value * 1e6) / 1e6).join(', ')})`;
    };
    effect(() => {
      camera.version();
      untracked(() => {
        if (frame === null) frame = requestAnimationFrame(lay);
      });
    });
    inject(DestroyRef).onDestroy(() => {
      if (frame !== null) cancelAnimationFrame(frame);
    });
  }
}
