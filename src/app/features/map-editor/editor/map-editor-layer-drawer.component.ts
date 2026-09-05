import { NgClass } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TRANSLATE_FN } from '@axe/application/i18n/translate.token';
import { ConfirmService } from '@axe/application/ui/confirm.service';
import { MapEditorState } from '@axe/features/map-editor/editor/map-editor-state';
import { LayerKind, MapLayer } from '@axe/features/map-editor/model/scene';
import { moveLayer, removeLayer } from '@axe/features/map-editor/model/scene-ops';
import { reorderRows, RowReorder } from '@axe/ui/dragging/row-reorder';
import { TranslocoModule } from '@jsverse/transloco';

const LAYER_ICONS: Record<LayerKind, string> = {
  cell: 'grid_on',
  shape: 'category',
  stamp: 'approval',
  freehand: 'gesture',
  text: 'title',
  image: 'image',
  function: 'block',
};

@Component({
  selector: 'map-editor-layer-drawer',
  templateUrl: './map-editor-layer-drawer.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, NgClass, TranslocoModule],
  host: { class: 'contents' },
})
export class MapEditorLayerDrawerComponent {
  protected readonly state = inject(MapEditorState);
  private readonly confirm = inject(ConfirmService);
  private readonly t = inject(TRANSLATE_FN);

  readonly thumbnails = input.required<ReadonlyMap<string, string>>();
  readonly compact = input(false);
  readonly open = input(true);

  protected readonly layerKinds: LayerKind[] = ['cell', 'shape', 'stamp', 'freehand', 'text', 'image'];
  protected readonly addLayerMenuOpen = signal(false);
  protected readonly renamingLayerId = signal<string | null>(null);
  protected readonly layerDrag = new RowReorder<string>();

  protected readonly layers = computed(() => {
    this.state.sceneTick();
    return this.state.layersTopFirst();
  });

  protected layerIcon(kind: LayerKind): string {
    return LAYER_ICONS[kind];
  }

  protected setActive(layer: MapLayer): void {
    this.state.setActiveLayer(layer.id);
  }

  protected toggleVisible(layer: MapLayer): void {
    this.state.applyCommitted(() => {
      const found = this.state.current.layers.find((l) => l.id === layer.id);
      if (found) found.visible = !found.visible;
    });
  }

  protected toggleLocked(layer: MapLayer): void {
    this.state.applyCommitted(() => {
      const found = this.state.current.layers.find((l) => l.id === layer.id);
      if (found) found.locked = !found.locked;
    });
  }

  protected setOpacity(layer: MapLayer, value: number): void {
    this.state.applyCommitted(() => {
      const found = this.state.current.layers.find((l) => l.id === layer.id);
      if (found) found.opacity = value;
    });
  }

  protected moveLayerUp(layer: MapLayer): void {
    this.state.applyCommitted(() => moveLayer(this.state.current, layer.id, 1));
  }

  protected moveLayerDown(layer: MapLayer): void {
    this.state.applyCommitted(() => moveLayer(this.state.current, layer.id, -1));
  }

  protected onLayerDragStart(layer: MapLayer, event: DragEvent): void {
    this.layerDrag.begin(layer.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', layer.id);
    }
  }

  protected onLayerDragOver(layer: MapLayer, event: DragEvent): void {
    if (this.layerDrag.held() === null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.layerDrag.hover(layer.id);
  }

  protected onLayerDrop(event: DragEvent): void {
    const drop = this.layerDrag.release();
    if (!drop) return;

    event.preventDefault();
    event.stopPropagation();
    const order = reorderRows(
      this.layers().map((layer) => layer.id),
      drop.held,
      drop.over,
      drop.side
    );
    if (order) this.state.reorderLayersTopFirst(order);
  }

  protected onLayerDragEnd(): void {
    this.layerDrag.cancel();
  }

  protected deleteLayer(layer: MapLayer): void {
    if (layer.locked) return;
    void this.confirm
      .ask({
        message: this.t('feature.mapEditor.layers.deleteConfirm'),
        okLabel: this.t('common.button.delete'),
        danger: true,
      })
      .then((ok) => {
        if (!ok) return;
        this.state.applyCommitted(() => removeLayer(this.state.current, layer.id));
        if (this.state.activeLayerId() === layer.id) this.state.activeLayerId.set(null);
      });
  }

  protected startRename(layer: MapLayer): void {
    this.renamingLayerId.set(layer.id);
  }

  protected commitRename(layer: MapLayer, name: string): void {
    this.state.applyCommitted(() => {
      const found = this.state.current.layers.find((l) => l.id === layer.id);
      if (found) found.name = name;
    });
    this.renamingLayerId.set(null);
  }

  protected addLayerOfKind(kind: LayerKind): void {
    const label = this.t('feature.mapEditor.layers.kinds.' + kind);
    const count = this.state.current.layers.filter((l) => l.kind === kind).length + 1;
    this.state.addEmptyLayer(kind, label + ' ' + count);
    this.addLayerMenuOpen.set(false);
  }
}
