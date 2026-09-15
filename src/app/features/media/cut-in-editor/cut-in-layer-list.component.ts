import { ChangeDetectionStrategy, Component, ElementRef, inject, input, output } from '@angular/core';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { PointerDeviceService } from '@axe/application/input/pointer-device.service';
import { ContextMenuService } from '@axe/application/ui/context-menu.service';
import { buildReorderContextMenu } from '@axe/application/ui/reorder-context-menu';
import { CutInLayer } from '@axe/domain/media/cut-in-layer';
import { TIMELINE_ROW_H_PX } from '@axe/features/media/cut-in-editor/cut-in-timeline-geometry';
import { type DropSide, RowReorder } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

/** The layers of a scene, topmost last, with what each one is called and whether it shows. */
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'cut-in-layer-list',
  templateUrl: './cut-in-layer-list.component.html',
  host: { class: 'block' },
  imports: [TranslocoModule],
})
export class CutInLayerListComponent {
  private readonly contextMenuService = inject(ContextMenuService);
  private readonly pointerDeviceService = inject(PointerDeviceService);
  private readonly t = inject(TRANSLATE_FN);

  readonly layers = input<readonly CutInLayer[]>([]);
  readonly selected = input<CutInLayer | null>(null);
  readonly isEditable = input(false);

  readonly selectLayer = output<CutInLayer>();
  readonly toggleHidden = output<CutInLayer>();
  readonly toggleLocked = output<CutInLayer>();
  readonly reorder = output<{ held: CutInLayer; over: CutInLayer; side: DropSide | null }>();

  /** The bands of the timeline are this tall, and these heads stand level with them. */
  protected readonly rowHeightPx = TIMELINE_ROW_H_PX;

  protected readonly dragging = new RowReorder<CutInLayer>();

  protected onDragStart(layer: CutInLayer): void {
    if (!this.isEditable()) return;
    this.dragging.begin(layer);
  }

  protected onDragOver(event: DragEvent, layer: CutInLayer, row: ElementRef<HTMLElement> | HTMLElement): void {
    if (!this.isEditable()) return;
    event.preventDefault();
    const element = row instanceof ElementRef ? row.nativeElement : row;
    const bounds = element.getBoundingClientRect();
    this.dragging.hoverHalf(layer, { top: bounds.top, height: bounds.height }, event.clientY);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    const dropped = this.dragging.release();
    if (dropped) this.reorder.emit(dropped);
  }

  protected onDragEnd(): void {
    this.dragging.cancel();
  }

  /**
   * Moves a layer from its menu, opened by a right click or a press held on its row.
   *
   * The rows are otherwise put in order by dragging, which a touch screen may not start. A move
   * takes the place of the row it goes to, which reads the same whichever way up the list is drawn.
   */
  protected onRowContextMenu(event: MouseEvent, layer: CutInLayer): void {
    if (!this.isEditable() || !this.pointerDeviceService.isAllowedToOpenContextMenu) return;
    const rows = this.rows;
    const index = rows.indexOf(layer);
    if (index < 0) return;
    const takePlaceOf = (over: CutInLayer) => this.reorder.emit({ held: layer, over, side: null });
    const actions = buildReorderContextMenu(
      { index, count: rows.length },
      {
        moveToTop: () => takePlaceOf(rows[0]),
        moveUp: () => takePlaceOf(rows[index - 1]),
        moveDown: () => takePlaceOf(rows[index + 1]),
        moveToBottom: () => takePlaceOf(rows[rows.length - 1]),
      },
      this.t
    );
    if (actions.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuService.open(
      this.pointerDeviceService.pointers[0],
      actions,
      layer.name || this.t('feature.media.cutInEditor.unnamedLayer')
    );
  }

  /** Topmost first, which is how a stack of layers is read. */
  protected get rows(): CutInLayer[] {
    return [...this.layers()].reverse();
  }
}
