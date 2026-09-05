import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { MoveBlockService } from '@axe/application/tabletop/move-block.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf, cellIndexAt, gridExtentPx } from '@axe/domain/tabletop/fog/cell-grid';
import { moveRangePolygons } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { overlayScale } from '@axe/features/tabletop/table-vision-overlay/vision-overlay-render';
import { translateZCss, Z_OFFSET_MASK_PX, Z_OFFSET_TALL_OBJECT_PX } from '@axe/ui/tabletop/z-offset';

export const MOVE_BLOCK_RESTING_FILL = 'rgba(220, 60, 60, 0.16)';
export const MOVE_BLOCK_PAINTING_FILL = 'rgba(220, 60, 60, 0.45)';

interface MoveBlockView {
  grid: CellGrid;
  cells: CellBits;
  painting: boolean;
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

  protected readonly zTransform = computed(() =>
    translateZCss(this.view()?.painting ? Z_OFFSET_TALL_OBJECT_PX : Z_OFFSET_MASK_PX)
  );

  protected readonly view = computed<MoveBlockView | null>(() => {
    const table = this.tabletopService.currentTableVersion();
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    const grid = cellGridOf(table.width, table.height, table.gridSize, table.gridType);
    const painting = this.moveBlock.isPainting();
    const cells = this.moveBlock.paintedOn(grid);
    if (!cells && !painting) return null;
    return { grid, cells: cells ?? new CellBits(grid.cols * grid.rows), painting };
  });

  constructor() {
    effect(() => {
      const view = this.view();
      const canvas = this.canvasRef()?.nativeElement;
      if (!view || !canvas) return;
      this.paint(canvas, view);
    });
  }

  protected onPointerDown(event: PointerEvent): void {
    if (!this.view()?.painting) return;
    event.stopPropagation();
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.paintFrom(event);
  }

  protected onPointerMove(event: PointerEvent): void {
    if (!this.view()?.painting || event.buttons < 1) return;
    event.stopPropagation();
    event.preventDefault();
    this.paintFrom(event);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (!this.view()?.painting) return;
    event.stopPropagation();
    (event.target as HTMLElement).releasePointerCapture?.(event.pointerId);
    this.moveBlock.endStroke();
  }

  private paintFrom(event: PointerEvent): void {
    const view = this.view();
    if (!view) return;
    const extent = gridExtentPx(view.grid);
    const cell = cellIndexAt(view.grid, event.offsetX + extent.minX, event.offsetY + extent.minY);
    this.moveBlock.paintAt(view.grid, cell);
  }

  private paint(canvas: HTMLCanvasElement, view: MoveBlockView): void {
    const extent = gridExtentPx(view.grid);
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

    const area = new Path2D();
    for (const polygon of moveRangePolygons(view.grid, view.cells)) {
      area.moveTo(polygon[0].x, polygon[0].y);
      for (let corner = 1; corner < polygon.length; corner++) area.lineTo(polygon[corner].x, polygon[corner].y);
      area.closePath();
    }
    context.fillStyle = view.painting ? MOVE_BLOCK_PAINTING_FILL : MOVE_BLOCK_RESTING_FILL;
    context.fill(area);
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
