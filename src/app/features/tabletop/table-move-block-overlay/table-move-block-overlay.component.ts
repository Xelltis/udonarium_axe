import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf } from '@axe/domain/tabletop/fog/cell-grid';
import { MoveBlockService } from '@axe/features/tabletop/table-move-block-overlay/move-block.service';
import { cellAreaPath } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { fitCanvasToGrid } from '@axe/ui/tabletop/fit-canvas-to-grid';
import { laidOnCanvasFloor } from '@axe/ui/tabletop/laid-on-canvas-floor';
import { translateZCss, Z_OFFSET_MASK_PX } from '@axe/ui/tabletop/z-offset';

export const MOVE_BLOCK_RESTING_FILL = 'rgba(220, 60, 60, 0.16)';

interface MoveBlockView {
  grid: CellGrid;
  cells: CellBits;
}

@Component({
  selector: 'table-move-block-overlay',
  templateUrl: './table-move-block-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableMoveBlockOverlayComponent {
  private readonly moveBlock = inject(MoveBlockService);
  private readonly tabletopService = inject(TabletopService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('blockCanvas');
  private readonly painted = laidOnCanvasFloor({
    id: () => 'move-block',
    canvas: () => this.canvasRef()?.nativeElement,
    heightPx: () => Z_OFFSET_MASK_PX,
  });

  protected readonly zTransform = computed(() => translateZCss(Z_OFFSET_MASK_PX));

  protected readonly view = computed<MoveBlockView | null>(() => {
    const table = this.tabletopService.currentTableVersion();
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const cells = this.moveBlock.blockedOn(grid);
    if (!cells || cells.isEmpty) return null;
    return { grid, cells };
  });

  constructor() {
    effect(() => {
      const view = this.view();
      const canvas = this.canvasRef()?.nativeElement;
      if (!view || !canvas) return;
      this.paint(canvas, view);
      this.painted();
    });
  }

  private paint(canvas: HTMLCanvasElement, view: MoveBlockView): void {
    const context = fitCanvasToGrid(canvas, view.grid);
    if (!context) return;

    const area = cellAreaPath(view.grid, view.cells);
    context.fillStyle = MOVE_BLOCK_RESTING_FILL;
    context.fill(area);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
