import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TableCameraService } from '@axe/application/tabletop/table-camera.service';
import { TableSurfaceService } from '@axe/application/tabletop/table-surface.service';
import { TransientPlacementService } from '@axe/application/tabletop/transient-placement.service';
import { quadMatrix } from '@axe/domain/tabletop/world/page-boxes';

/**
 * The outline of where a dragged piece would land on another face, over a table drawn on a canvas:
 * laid on that face where the canvas draws it, in perspective, as the page lays it in the face's own
 * element on its own table.
 */
@Component({
  selector: 'table-drop-preview',
  templateUrl: './table-drop-preview.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableDropPreviewComponent {
  private readonly transient = inject(TransientPlacementService);
  private readonly camera = inject(TableCameraService);
  private readonly surfaces = inject(TableSurfaceService);

  /** How large the outline is and the transform that lays it on its face, or null while there is none to lay. */
  protected readonly laid = computed(() => {
    const preview = this.transient.dropPreview();
    this.camera.version();
    const layout = this.camera.layout;
    if (!preview || !layout || !(preview.width > 0) || !(preview.height > 0)) return null;
    const { width, height } = preview;
    const corners = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ].map(([across, down]) => this.surfaces.pageOf(preview.surface, preview.x + across, preview.y + down));
    if (corners.some((corner) => !corner)) return null;
    const [a, b, c, d] = corners.map((corner) => ({ x: corner!.x - layout.left, y: corner!.y - layout.top }));
    const matrix = quadMatrix(width, height, [a, b, c, d]);
    if (!matrix) return null;
    return { width, height, transform: `matrix3d(${matrix.map((value) => Math.round(value * 1e6) / 1e6).join(', ')})` };
  });
}
