import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { VisionService } from '@axe/application/tabletop/vision.service';
import { clamp } from '@axe/core/util/clamp';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { CellGrid, cellGridOf, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { MOST_MOVE_COST_EXTRA } from '@axe/domain/tabletop/table-move-cost';
import { TableMoveCostService } from '@axe/features/tabletop/table-move-cost-overlay/table-move-cost.service';
import { cellAreaPath } from '@axe/features/tabletop/table-move-range-overlay/move-range-render';
import { fitCanvasToGrid } from '@axe/ui/tabletop/fit-canvas-to-grid';
import { laidOnCanvasFloor } from '@axe/ui/tabletop/laid-on-canvas-floor';
import { translateZCss, Z_OFFSET_MASK_PX } from '@axe/ui/tabletop/z-offset';

/** One stretch of ground priced apart from the rest, and what it is priced at. */
interface CostPatch {
  cells: CellBits;
  color: string;
  charge: number;
  /** Whether it is a road, which is drawn evenly rather than by how dear it is. */
  eases: boolean;
}

const LEAST_ALPHA = 0.18;
const MOST_ALPHA = 0.5;
/** A road is one thing rather than a scale of things, so it is drawn at the one weight. */
const ROAD_ALPHA = 0.32;

/** How solidly a stretch is drawn, so that the dearer ground of two reads as the dearer one. */
function alphaFor(charge: number): number {
  const share = clamp((charge - 1) / (MOST_MOVE_COST_EXTRA - 1), 0, 1);
  return LEAST_ALPHA + share * (MOST_ALPHA - LEAST_ALPHA);
}

@Component({
  selector: 'table-move-cost-overlay',
  templateUrl: './table-move-cost-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableMoveCostOverlayComponent {
  private readonly areas = inject(TableMoveCostService);
  private readonly tabletopService = inject(TabletopService);
  private readonly vision = inject(VisionService);
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('moveCostCanvas');
  private readonly painted = laidOnCanvasFloor({
    id: () => 'move-cost',
    canvas: () => this.canvasRef()?.nativeElement,
    heightPx: () => Z_OFFSET_MASK_PX,
  });

  protected readonly zTransform = computed(() => translateZCss(Z_OFFSET_MASK_PX));

  private readonly board = computed<CellGrid | null>(() => {
    const table = this.tabletopService.currentTableVersion();
    if (table.gridSize <= 0 || table.width <= 0 || table.height <= 0) return null;
    return cellGridOf(table.width, table.height, table.gridSize, table.gridType);
  });

  /**
   * The stretches this seat is shown, each whole: none laid wholly where the fog still lies over ground
   * nobody has walked to (see `VisionService.isGroundShown`).
   */
  protected readonly view = computed<CostPatch[]>(() => {
    const grid = this.board();
    if (!grid) return [];
    const patches: CostPatch[] = [];
    for (const area of this.areas.all()) {
      const rect = area.rect;
      if (!this.vision.isGroundShown(grid, rect)) continue;
      const cells = new CellBits(grid.cols * grid.rows);
      for (let row = 0; row < rect.height; row++) {
        for (let col = 0; col < rect.width; col++) {
          const index = cellIndexOf(grid, rect.col + col, rect.row + row);
          if (index >= 0) cells.set(index);
        }
      }
      if (cells.isEmpty) continue;
      patches.push({ cells, color: area.color, charge: area.charge, eases: area.halves });
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
      this.painted();
    });
  }

  private paint(canvas: HTMLCanvasElement, grid: CellGrid, patches: readonly CostPatch[]): void {
    const context = fitCanvasToGrid(canvas, grid);
    if (!context) return;

    for (const patch of patches) {
      const area = cellAreaPath(grid, patch.cells);
      context.globalAlpha = patch.eases ? ROAD_ALPHA : alphaFor(patch.charge);
      context.fillStyle = patch.color;
      context.fill(area);
      context.globalAlpha = 0.7;
      context.strokeStyle = patch.color;
      context.lineWidth = 2;
      context.stroke(area);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
