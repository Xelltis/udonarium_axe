import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf, cellIndexOf, gridExtentPx } from '@axe/domain/tabletop/fog/cell-grid';
import { moveRangePolygons } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { overlayScale } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { translateZCss, Z_OFFSET_MASK_PX } from '@axe/ui/tabletop/z-offset';

/** One piece of ground to draw, and how it is to be drawn. */
interface TriggerPatch {
  cells: CellBits;
  color: string;
  /** Whether only the master is being shown it, which is drawn as an outline rather than a fill. */
  hidden: boolean;
  spent: boolean;
}

const SHOWN_ALPHA = 0.28;
const HIDDEN_ALPHA = 0.16;
const SPENT_ALPHA = 0.08;

@Component({
  selector: 'table-trigger-overlay',
  templateUrl: './table-trigger-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableTriggerOverlayComponent {
  private readonly triggers = inject(TableTriggerService);
  private readonly tabletopService = inject(TabletopService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('triggerCanvas');

  protected readonly zTransform = computed(() => translateZCss(Z_OFFSET_MASK_PX));

  private readonly board = computed<CellGrid | null>(() => {
    const table = this.tabletopService.currentTableVersion();
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  });

  protected readonly view = computed<TriggerPatch[]>(() => {
    const grid = this.board();
    if (!grid) return [];
    const patches: TriggerPatch[] = [];
    for (const trigger of this.triggers.shown()) {
      const rect = trigger.rect;
      const cells = new CellBits(grid.cols * grid.rows);
      for (let row = 0; row < rect.height; row++) {
        for (let col = 0; col < rect.width; col++) {
          const index = cellIndexOf(grid, rect.col + col, rect.row + row);
          if (index >= 0) cells.set(index);
        }
      }
      if (cells.isEmpty) continue;
      patches.push({
        cells,
        color: trigger.color,
        hidden: !trigger.open,
        spent: trigger.once && trigger.spent,
      });
    }
    return patches;
  });

  constructor() {
    effect(() => {
      const patches = this.view();
      const grid = this.board();
      const canvas = this.canvasRef()?.nativeElement;
      if (!grid || !canvas || patches.length < 1) return;
      this.paint(canvas, grid, patches);
    });
  }

  private paint(canvas: HTMLCanvasElement, grid: CellGrid, patches: readonly TriggerPatch[]): void {
    const extent = gridExtentPx(grid);
    const width = Math.max(1, Math.ceil(extent.maxX - extent.minX));
    const height = Math.max(1, Math.ceil(extent.maxY - extent.minY));
    const scale = overlayScale(width, height);
    const pixelWidth = Math.max(1, Math.ceil(width * scale));
    const pixelHeight = Math.max(1, Math.ceil(height * scale));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.left = extent.minX + 'px';
    canvas.style.top = extent.minY + 'px';
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(scale, 0, 0, scale, -extent.minX * scale, -extent.minY * scale);
    context.clearRect(extent.minX, extent.minY, width, height);

    for (const patch of patches) {
      const area = new Path2D();
      for (const polygon of moveRangePolygons(grid, patch.cells)) {
        area.moveTo(polygon[0].x, polygon[0].y);
        for (let corner = 1; corner < polygon.length; corner++) area.lineTo(polygon[corner].x, polygon[corner].y);
        area.closePath();
      }
      context.globalAlpha = patch.spent ? SPENT_ALPHA : patch.hidden ? HIDDEN_ALPHA : SHOWN_ALPHA;
      context.fillStyle = patch.color;
      context.fill(area);
      // Ground only the master is being shown is outlined as well, so it is never mistaken for
      // something the room can see.
      context.globalAlpha = patch.spent ? SPENT_ALPHA : 0.8;
      context.strokeStyle = patch.color;
      context.lineWidth = 2;
      context.setLineDash(patch.hidden ? [8, 6] : []);
      context.stroke(area);
      context.setLineDash([]);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
