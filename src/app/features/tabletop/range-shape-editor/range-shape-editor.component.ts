import { ChangeDetectionStrategy, Component, computed, EventEmitter, Output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CellCoord,
  cellPatternBoundingBox,
  parseCellPattern,
  serializeCellPattern,
} from '@axe/domain/tabletop/cell-pattern';
import {
  buildEditorBoardGeometry,
  cellsFromKeys,
  EditorCellGeometry,
  EditorGridType,
} from '@axe/features/tabletop/range-shape-editor/range-shape-editor-utils';
import { TranslocoModule } from '@jsverse/transloco';

export interface RangeShapeEditorResult {
  name: string;
  cellPattern: string;
  gridType: EditorGridType;
  gridColor: string;
  rangeColor: string;
  isRotatable: boolean;
}

@Component({
  selector: 'range-shape-editor',
  templateUrl: './range-shape-editor.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoModule],
})
export class RangeShapeEditorComponent {
  readonly name = signal('');
  readonly gridType = signal<EditorGridType>('square');
  readonly gridColor = signal('#FFFF00');
  readonly rangeColor = signal('#000000');
  readonly cellSet = signal<ReadonlySet<string>>(new Set<string>());
  readonly isRotatable = signal(false);

  private paintMode: 'add' | 'remove' | null = null;
  private isPointerDown = false;
  private touchedCellsThisDrag = new Set<string>();

  @Output() readonly saved = new EventEmitter<RangeShapeEditorResult>();
  @Output() readonly cancelled = new EventEmitter<void>();

  readonly geometry = computed(() => buildEditorBoardGeometry(this.gridType()));

  readonly boundingSummary = computed(() => {
    const cells = cellsFromKeys(this.cellSet());
    const bb = cellPatternBoundingBox(cells);
    return { count: cells.length, width: bb.width, height: bb.height };
  });

  /**
   * Fills the editor with a range's current shape and colours, once it has been opened.
   *
   * Only the fields given are applied; the rest keep the editor's defaults.
   */
  initialize(initial: Partial<RangeShapeEditorResult> = {}): void {
    if (initial.name !== undefined) this.name.set(initial.name);
    if (initial.gridType) this.gridType.set(initial.gridType);
    if (initial.gridColor) this.gridColor.set(initial.gridColor);
    if (initial.rangeColor) this.rangeColor.set(initial.rangeColor);
    if (initial.isRotatable !== undefined) this.isRotatable.set(initial.isRotatable === true);
    if (initial.cellPattern !== undefined) {
      const cells = parseCellPattern(initial.cellPattern);
      const keys = new Set<string>();
      for (const c of cells) keys.add(`${c.gx},${c.gy}`);
      this.cellSet.set(keys);
    }
  }

  protected isFilled(cell: EditorCellGeometry): boolean {
    return this.cellSet().has(cell.key);
  }

  protected onCellPointerDown(cell: EditorCellGeometry, event: PointerEvent): void {
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    this.isPointerDown = true;
    this.touchedCellsThisDrag.clear();
    const filled = this.cellSet().has(cell.key);
    this.paintMode = filled ? 'remove' : 'add';
    this.applyToCell(cell);
  }

  protected onCellPointerEnter(cell: EditorCellGeometry): void {
    if (!this.isPointerDown || !this.paintMode) return;
    this.applyToCell(cell);
  }

  protected onPointerUp(): void {
    this.isPointerDown = false;
    this.paintMode = null;
    this.touchedCellsThisDrag.clear();
  }

  private applyToCell(cell: EditorCellGeometry): void {
    if (this.touchedCellsThisDrag.has(cell.key)) return;
    this.touchedCellsThisDrag.add(cell.key);
    const next = new Set(this.cellSet());
    if (this.paintMode === 'add') next.add(cell.key);
    else next.delete(cell.key);
    this.cellSet.set(next);
  }

  protected clear(): void {
    this.cellSet.set(new Set<string>());
  }

  protected save(): void {
    const cells: CellCoord[] = cellsFromKeys(this.cellSet());
    cells.sort((a, b) => (a.gy === b.gy ? a.gx - b.gx : a.gy - b.gy));
    this.saved.emit({
      name: this.name().trim(),
      cellPattern: serializeCellPattern(cells),
      gridType: this.gridType(),
      gridColor: this.gridColor(),
      rangeColor: this.rangeColor(),
      isRotatable: this.isRotatable(),
    });
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  protected setGridType(value: string): void {
    if (value === 'square' || value === 'hex-vertical' || value === 'hex-horizontal') {
      this.gridType.set(value);
    }
  }
}
