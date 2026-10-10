import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, viewChild } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { TableTriggerService } from '@axe/application/tabletop/table-trigger.service';
import { TabletopService } from '@axe/application/tabletop/tabletop.service';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellGridOf, cellIndexOf, gridExtentPx } from '@axe/domain/tabletop/fog/cell-grid';
import { triggerEffectLine } from '@axe/domain/tabletop/table-trigger';
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
  /** What it is called, and what it does, written on the ground it covers. */
  name: string;
  effect: string;
  /** Where those words go: the middle of the ground it covers. */
  at: { x: number; y: number };
}

const SHOWN_ALPHA = 0.28;
const HIDDEN_ALPHA = 0.16;
const SPENT_ALPHA = 0.08;
/** How tall the words on a patch are, as a share of one cell. */
const LABEL_SIZE = 0.26;
const LABEL_LEADING = 1.15;
const LABEL_INK = '#ffffff';
const LABEL_EDGE = 'rgba(0, 0, 0, 0.85)';

@Component({
  selector: 'table-trigger-overlay',
  templateUrl: './table-trigger-overlay.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
})
export class TableTriggerOverlayComponent {
  private readonly triggers = inject(TableTriggerService);
  private readonly t = inject(TRANSLATE_FN);
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
      const middle = cellIndexOf(grid, rect.col + Math.floor(rect.width / 2), rect.row + Math.floor(rect.height / 2));
      const pressed = trigger.pressSwitch;
      const at = middle >= 0 ? cellCenterOf(grid, middle) : { x: 0, y: 0 };
      if (pressed) {
        const definition = pressed.def;
        patches.push({
          cells,
          color: trigger.color,
          hidden: !trigger.isShown,
          spent: pressed.retired || (definition.repeat === 'once' && Boolean(pressed.spent)),
          name: definition.label.trim() || trigger.name.trim() || this.t('feature.boardSwitch.unlabeled'),
          effect: this.t('feature.boardSwitch.pressHere'),
          at,
        });
        continue;
      }
      patches.push({
        cells,
        color: trigger.color,
        hidden: !trigger.isShown,
        spent: trigger.repeats === 'once' && trigger.spent,
        name: trigger.name.trim() || this.t('feature.tabletop.trigger.unnamed'),
        effect: triggerEffectLine(trigger),
        at,
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

  /**
   * Writes what the ground is called and what it does across the middle of it.
   *
   * Drawn with a line round every letter, since the ground under the words is whatever the
   * master painted and pale words over a pale patch are no words at all.
   */
  private write(context: CanvasRenderingContext2D, grid: CellGrid, patch: TriggerPatch): void {
    const lines = [patch.name, patch.effect].filter((line) => line.length > 0);
    if (lines.length < 1) return;
    const size = Math.max(9, grid.sizePx * LABEL_SIZE);
    context.globalAlpha = patch.spent ? SPENT_ALPHA : 1;
    context.font = `${size}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.lineWidth = Math.max(2, size * 0.22);
    context.strokeStyle = LABEL_EDGE;
    context.lineJoin = 'round';
    const top = patch.at.y - ((lines.length - 1) * size * LABEL_LEADING) / 2;
    for (const [index, line] of lines.entries()) {
      const y = top + index * size * LABEL_LEADING;
      context.strokeText(line, patch.at.x, y);
      context.fillStyle = LABEL_INK;
      context.fillText(line, patch.at.x, y);
    }
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
      this.write(context, grid, patch);
    }
    context.globalAlpha = 1;
    context.setTransform(1, 0, 0, 1, 0, 0);
  }
}
